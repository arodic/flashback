# Now - Current Focus

## Last Action
Updated cutscene extraction tool to support PC DOS data format:
- Added `--dir` option to read separate CMD/POL files directly
- Changed output option to `-o/--output` instead of positional arg
- Extracted all 29 cutscenes from new DATA directory
- Updated index.html with all available cutscenes

## Data Files (PC DOS Version)
DATA directory contains PC DOS game files:
- Separate .CMD and .POL files (uncompressed, not packed in ABA archive like Amiga)
- MIDI music files (.MID) - PC DOS format
- PRF files for some music
- 29 total cutscenes
- Binary format is same as Amiga, just different packaging

## Quick Reference
- Extract from directory (PC DOS): `python tools/extract-cutscenes.py --dir DATA/ -o public/data`
- Extract from archive (Amiga): `python tools/extract-cutscenes.py DEMO_UK.ABA -o public/data`
- List cutscenes: `python tools/extract-cutscenes.py --dir DATA/ --list`
- Dev server: `pnpm dev`
