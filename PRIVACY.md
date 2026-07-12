# Privacy Policy — qbcheck for Google Docs

_Last updated: 2026-07-12_

qbcheck is a Google Docs editor add-on that checks quizbowl question packets for
style and formatting issues. This policy explains what the add-on does and does
not do with your data.

## Summary

**qbcheck does not collect, transmit, sell, or share any personal information or
document content.** It runs entirely within Google's Apps Script environment and
operates only on the document you have open.

## What the add-on accesses

qbcheck requests the minimum access needed to do its job:

- **The currently open document** (`https://www.googleapis.com/auth/documents.currentonly`).
  The add-on can read and edit only the document you have open while using it. It
  cannot see any of your other files in Google Drive. Document content is read to
  run the style checks and is edited in place only when you explicitly apply a fix.
- **Permission to show its user interface** (`https://www.googleapis.com/auth/script.container.ui`).
  Used solely to display the qbcheck sidebar inside Google Docs.

## What is stored

The only data qbcheck stores is your **list of disabled rules** — your
preference for which checks to turn off. This is saved via Google Apps Script
[user properties](https://developers.google.com/apps-script/guides/properties),
which are scoped to your account and hosted on Google's infrastructure. It
contains no document content and no personal information.

## What is NOT done

- No document content is ever sent to any server outside of Google's Apps Script
  runtime.
- No external network calls are made.
- No analytics, tracking, telemetry, advertising, or cookies.
- No data is shared with the developer or any third party.

## Data retention and deletion

qbcheck keeps no copy of your documents. To remove the stored disabled-rules
preference, uninstall the add-on or clear its stored properties; no other data is
retained.

## Changes to this policy

If this policy changes, the "Last updated" date above will be revised and the new
version will be published at this URL.

## Contact

Questions about this policy can be raised via the project's issue tracker at
<https://github.com/rkeyal/qbcheck/issues>.
