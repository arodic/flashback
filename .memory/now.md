# Now - Current Focus

## Active Task
Configured deployment for GitHub Pages subdirectory

## Recent Change
All paths now relative (no leading `/`) for subdirectory deployment:
- `vite.config.ts`: Added `base: './'`
- Build outputs to project root (not dist/)
- `index.src.html` = source (tracked), `index.html` = built output

## Path Rules
**CRITICAL**: All paths must be relative:
- `./DATA/` not `/DATA/`
- `./src/main.ts` not `/src/main.ts`
- `./assets/` not `/assets/`

## Build/Dev Workflow
- `npm run dev` - Copies index.src.html to index.html, runs dev server
- `npm run build` - Builds to root (index.html, assets/)

## Deploy (GitHub Pages)
Upload entire root folder:
- `index.html` (built)
- `assets/`
- `DATA/`
- `flashback-instruments.json`, `flashback.wopl`

## Quick Reference
- Dev server: `pnpm dev` or `npm run dev`
- TypeScript check: `npx tsc --noEmit`
