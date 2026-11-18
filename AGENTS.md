# Bonnes Ondes

## Working on the project

- GitHub is the source of truth. In the GitHub repository, edit the Next.js app in `source/`. Run npm commands from that directory. In a standalone checkout of the app, use its root.
- Use Node.js 22 or newer. Install from `package-lock.json` with `npm ci`, then run `npm run typecheck` and `npm run build` before proposing a change.
- Read the GitHub issue and its acceptance criteria before editing. Keep the change scoped, include validation in the PR, and link the issue.
- Keep the interface in French. Preserve the Bonnes Ondes visual identity, existing navigation, radio playback, and the browser storage key and item IDs that preserve personal favorites.
- Verify editorial metadata and media links against their original sources. Keep unknown titles and artists empty. Keep credentials out of committed code and browser bundles.

## GitHub Pages

- The public site is https://haniadaher21-ops.github.io/bonnesondes/. The compiled site is tracked at the repository root on `main`. Its root `index.html`, `.nojekyll`, `_next/`, and asset directories serve the current deployment.
- For a source change, update `source/` and verify the build. Update the compiled root files when publishing is part of the task. Check the Pages setup first and retain the `/bonnesondes` URL prefix for GitHub Pages.
- After a release, verify the public homepage and its CSS, scripts and images, then smoke-test the feature that changed.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
