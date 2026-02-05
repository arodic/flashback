# Now - Current Focus

## Active Task
Cleaned up MidiPlayer.ts - removed dead code from audio debugging attempts

## Recent Change
Simplified MidiPlayer.ts from 978 lines to ~485 lines:
- Removed `analyzeMidi()` (120 line MIDI parser that didn't fix the issue)
- Removed `calculateOctaveWrapOffset()` workaround
- Simplified `loadAndInjectInstruments()` to direct slot→channel mapping
- Extracted `loadInsFile()` helper for cleaner code
- Kept all debug interface: channel muting, instrument swapping, octave offset, note testing

## Debug Interface (preserved)
- `muteChannel()` / `unmuteChannel()` / `toggleMuteChannel()`
- `getChannels()` / `onChannelChange()`
- `setChannelInstrument()` / `getAvailableInstruments()`
- `setChannelOctaveOffset()`
- `noteOn()` / `noteOff()` / `allNotesOff()`

## Quick Reference
- Dev server: `pnpm dev` (running at http://localhost:3001/)
- TypeScript check: `npx tsc --noEmit`
