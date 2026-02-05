# Now - Current Focus

## Active Task
Debugging OPL3 audio - instruments may be incorrectly mapped to MIDI channels.

## Instrument Mapper Tool
Added interactive UI to debug channel/instrument assignments:
- Checkbox to mute/unmute channels
- Dropdown to swap instruments between channels
- Octave offset control (-4 to +4)

## Recent Fixes
- Fixed INS file parsing offsets (modulator @ byte 2, carrier @ byte 28, wave select @ bytes 74/76)
- Fixed InsToOpl3 field names (`percussionKey` not `percussionNote`, `rhythmMode` not booleans)
- Fixed instrument injection to use MIDI program numbers

## Quick Reference
- Dev server: `pnpm dev`
- TypeScript check: `npx tsc --noEmit`
