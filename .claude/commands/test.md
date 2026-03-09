Run the test suite. If any tests fail, investigate and fix the failures.

```bash
npm test
```

If the user provided arguments, pass them through to run a subset of tests:

```bash
npm test -- $ARGUMENTS
```

If tests fail:
1. Read the failure output carefully
2. Determine whether the failure is in test code or source code
3. Fix the root cause
4. Re-run the failing tests to confirm the fix
