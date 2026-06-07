# Release Process

This project should only publish a release after the app has passed automated checks and a manual smoke test in the browser.

## Pre-Release Checklist

1. Confirm the worktree contains only intended changes.
2. Run:

   ```bash
   node --check src/server/store.js src/server/server.js src/server/assistant.js src/panel/app.js
   npm test
   git diff --check
   ```

3. Start the app with `npm run start -- --port 8787`.
4. Manually test:
   - setup or settings load
   - creating and deleting a chat
   - sending a message with the intended provider
   - persistent memory file upload, view, edit, backup and restore
   - offline mode if network behavior changed
   - import/export when storage behavior changed
5. Check GitHub code scanning and fix high-confidence alerts.
6. Update README and docs for user-facing behavior.

## Publishing

Use semantic-ish tags while the project is pre-1.0:

```bash
git tag v0.x.y
git push origin v0.x.y
gh release create v0.x.y --title "v0.x.y" --notes-file RELEASE_NOTES.md
```

Do not publish a release from an unvalidated branch. Prefer a draft release when the change is large or security-sensitive.

