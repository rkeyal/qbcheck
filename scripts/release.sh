#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"
ZIP="qbcheck-$TAG.zip"

echo "Releasing qbcheck $TAG"

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: uncommitted changes. Commit or stash before releasing."
  exit 1
fi

# Check that the tag doesn't already exist
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: tag $TAG already exists."
  exit 1
fi

# Sync version into manifest.json
node -e "
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
manifest.version = '$VERSION';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
"

# If manifest.json changed, commit it
if ! git diff --quiet manifest.json; then
  git add manifest.json
  git commit -m "Bump manifest.json version to $VERSION"
fi

# Build
echo "Building..."
npm run build

# Zip dist/
echo "Creating $ZIP..."
rm -f "$ZIP"
cd dist
zip -r "../$ZIP" .
cd ..

# Create git tag
git tag "$TAG"
echo "Created tag $TAG"

# Push tag and create GitHub release
echo "Pushing tag and creating GitHub release..."
git push origin main "$TAG"

# Extract release notes from CHANGELOG.md (content between this version's header and the next)
NOTES=$(awk "/^## \\[$VERSION\\]/{found=1; next} /^## \\[/{if(found) exit} found{print}" CHANGELOG.md)

gh release create "$TAG" "$ZIP" \
  --title "qbcheck $TAG" \
  --notes "$NOTES"

echo ""
echo "Done! Release $TAG published at:"
gh release view "$TAG" --json url -q .url

# Clean up zip
rm -f "$ZIP"
