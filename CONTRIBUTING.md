# Contributing

This repository follows a simple trunk-based workflow.

## Workflow
1. Branch from `main` for any change.
2. Keep branches short-lived and focused.
3. Open a pull request back into `main`.
4. Merge after checks/review pass.
5. Delete the feature branch after merge.

## Branch Naming
Use clear names, for example:
- `feature/terrain-lod`
- `fix/camera-clamp`
- `chore/docs-update`

## Local Run
- `python3 -m http.server 5173`
- Open `http://localhost:5173`

## Quality Expectations
- Keep interactivity smooth; prefer performance over excessive terrain detail.
- Avoid broad refactors unrelated to your change.
- Document notable behavior changes in `README.md`.
