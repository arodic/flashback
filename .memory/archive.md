# Archive - Flashback Cutscene Project

## 2026-02-04: InsToOpl3 Field Naming Mismatch

**[BUG] libadlmidi-js expected different field names**
- `percussionNote` → `percussionKey`
- `isRhythmModeCar/Mod` (booleans) → `rhythmMode` (number 0-7)
- Missing `version` field (defaults to 0)

Encoder was silently using default values, corrupting instrument data.

---

## 2026-02-04: Instrument Mapper Tool

**[FEATURE] Interactive debugging UI for channel/instrument mapping**
- Checkbox to mute/unmute channels
- Dropdown to swap instruments between channels
- Octave offset control (-4 to +4)
- Added `setChannelInstrument()` and `setChannelOctaveOffset()` to MidiPlayer

---

## 2026-02-04: CRITICAL - INS File Parsing Bug

**[BUG] INS file was parsed from wrong offsets**
- Symptom: OPL3 sounds vastly different from original - wrong octaves, wrong timbre
- Root cause: InsParser.ts read operator data and wave select from incorrect file positions

**Wrong offsets (what we had):**
| Field | Offset |
|-------|--------|
| Modulator operator | 6 |
| Carrier operator | 32 |
| Modulator wave select | 2 |
| Carrier wave select | 3 |

**Correct offsets (from REminiscence loadIns):**
| Field | Offset |
|-------|--------|
| Modulator operator | 2 |
| Carrier operator | 28 |
| Modulator wave select | 74 |
| Carrier wave select | 76 |

**Impact:**
- Wave select (0-7) dramatically changes timbre: sine, half-sine, abs-sine, pulse, square, etc.
- Reading from wrong positions = garbage waveform values = completely wrong sound
- Operator parameters at wrong offsets = wrong ADSR envelopes, frequency multipliers, etc.

**Reference:** REminiscence/prf_player.cpp lines 138-156
```cpp
f->read(&p[6], 26 * 2);  // 52 bytes from file pos 2 into p+6
f->seek(54 + 20);        // seek to pos 74
p[2] = f->readByte();    // modulator wave select at file pos 74
p[3] = f->readByte();    // carrier wave select at file pos 76
```

---

## 2026-02-04: OPL3 Octave-Wrap Fix (Heartbeat pitch)

**[BUG] Channel 5 heartbeat 2-3 octaves too high**
- Symptom: Heartbeat sound is super high pitch, should be low "bell sample"
- MIDI analysis: Channel 5 plays note 101 (F7, octave 8)
- Root cause: OPL3 block register is only 3 bits (0-7)
- In original hardware: `octave / 12 << 2` for octave 8 overflows into bit 5
- Result: Octave 8 wraps to octave 0 (very low pitch)
- libadlmidi-js doesn't replicate this hardware overflow behavior

**[FIX] MIDI note range analysis with octave-wrap offset**
- Added `analyzeMidiNotes()` to scan MIDI file for note ranges per channel
- Added `calculateOctaveWrapOffset()`: for max note in octave 8+, return -96
- `loadForCutscene()` now loads MIDI first, analyzes notes, then injects instruments
- `loadAndInjectInstruments()` applies octave-wrap offset to noteOffset1
- Formula: `wrappedOctave = octave % 8`, offset = `-8 * 12 = -96` for octave 8

**[BUG] libadlmidi-js init() hanging**
- Symptom: `synth.init(processorUrl)` never resolved
- Cause: Passed custom processor URL that overrode library's internal URLs
- Fix: Call `synth.init()` with NO arguments when using nuked profile
- The nuked profile already resolves URLs via `import.meta.url` internally

**[REFERENCE] REminiscence midi_driver_adlib.cpp:260**
```cpp
const uint8_t regBx = ((note / 12) << 2) | ((freq & 0x300) >> 8);
writeRegister(0xB0 + hw_channel, regBx);
```
The 3-bit field (bits 2-4) can only hold 0-7, so octave 8 (0x20) overflows.

---

## 2026-02-04: Browser Autoplay Policy Fix

**[AUDIO] Fixed initial audio not playing**
- Symptom: No audio on first page load, only plays after switching cutscenes
- Cause: Browser autoplay policy blocks AudioContext init without user gesture
- Solution: Deferred `AdlMidi` initialization until user clicks Play or changes cutscene
- Implementation:
  - `MidiPlayer` tracks `initializing` and `pendingLoad` states
  - On failed init (no gesture), stores PRF name in pendingLoad
  - `ensureInitialized()` exposed for user gesture handlers
  - `CutscenePlayer.play()` and `togglePlay()` now async, call ensureInitialized
  - `main.ts` handlers await audio init on Play button & cutscene dropdown

**[BUG] Recursive loadForCutscene was breaking audio**
- Symptom: Audio stopped loading entirely after autoplay fix
- Cause: `init()` calls `loadForCutscene(pendingLoad)` which loads music successfully,
  but the ORIGINAL `loadForCutscene` call continues after `init()` returns and
  overwrites `loaded=false`, then tries to load again
- Fix: After `init()` returns, check if PRF was already loaded via pendingLoad
  and return early: `if (this.loaded && this.currentPrfName === prfName) return true`

**[DEBUG] Added MIDI channel mute controls**
- UI buttons showing instrument names per MIDI channel
- Toggle mute to isolate and identify problematic sounds
- `MidiPlayer` tracks channelInstruments[] and mutedChannels Set

---

## 2026-02-04: Zoom Fix and Polygon Accuracy Improvements

**[BUG] Signed zoom values**
- Frames 210-218 in INTRO1 had giant triangles covering the scene
- Cause: `zoom` values were parsed as uint16 but should be int16 (signed)
- Example: 65496 as uint16 = -40 as int16
- With formula `scale = (zoom + 512) / 512`:
  - Unsigned: 128.9x scale (HUGE!)
  - Signed: 0.92x scale (correct slight shrink)
- Fix: Changed `readBEUint16()` to `readBEInt16()` in CutsceneParser.ts

**[RENDERING] Improved polygon step calculation**
- Implemented calcPolyStep1/calcPolyStep2 matching reference engine's 8.8 intermediate format
- Reference uses: `a = dx * 256; a = ((int16_t)(a / dy)) * 256;`
- This truncates intermediate result to int16 before scaling up
- Reduced pixel differences from 105 to 100 (0.2% to 0.17%)

**[INVESTIGATION] Remaining 100 pixel differences**
- All edge pixels at polygon boundaries
- 68x dark blue rendered where black expected (edges too wide)
- 14x black rendered where olive expected (edges too narrow)
- 6x blue rendered where red expected (polygon overlap)
- Reference engine has ~600 lines of complex polygon code with goto statements and half-step corrections
- Would need full port of complex algorithm to achieve 100% match

---

## 2026-02-04: Three.js to Canvas 2D Rewrite

**[ARCHITECTURE] Why we switched from Three.js to Canvas 2D**

The goal is **pixel-perfect rendering** matching the original Flashback engine (REminiscence). Three.js couldn't achieve this because:

1. **Polygon triangulation differs** - Three.js uses earcut algorithm to triangulate polygons into triangles for WebGL. The original engine uses scanline rasterization which fills polygons row-by-row. Different algorithms produce different pixel coverage on edges.

2. **Line rendering differs** - Three.js doesn't have true 1-pixel lines. We were using thin rotated rectangles, but WebGL's rasterization rules (diamond-exit) differ from Bresenham's algorithm used by the original.

3. **Unnecessary complexity** - Three.js brings a 3D scene graph, materials system, and WebGL abstraction we don't need. We're drawing 2D shapes to a fixed-resolution buffer.

4. **Color space issues** - Had to fight Three.js's sRGB gamma correction (`outputColorSpace = LinearSRGBColorSpace`).

**[RESULTS] Pixel accuracy improved dramatically**
- Three.js: 4.6% pixels different
- Canvas 2D (simple scanline): 2.0% pixels different
- Canvas 2D (fixed-point edge-walking): 0.2% pixels different (105 pixels)
- Fixed the black patch artifact on pipe in INTRO1 frame 0

**[FILES] Changes made**
- Created: `src/Graphics.ts` - Bresenham lines, scanline polygon fill, ellipse
- Created: `src/Canvas2DRenderer.ts` - Replaces ShapeRenderer
- Rewritten: `src/CutscenePlayer.ts` - Uses 2D canvas context
- Rewritten: `src/CutsceneLoader.ts` - Removed Three.js Loader dependency
- Deleted: `src/ShapeRenderer.ts`
- Removed: `three` and `@types/three` from package.json

**[PATTERN] Canvas 2D rendering approach**
```typescript
// Render to ImageData buffer
const graphics = new Graphics(256, 224)
graphics.drawPolygon(color, hasAlpha, vertices)
graphics.drawLine(color, x1, y1, x2, y2)

// Display via putImageData
ctx.putImageData(graphics.getImageData(), 0, 0)
```

**[ALGORITHMS] Ported from reference engine**
- Bresenham line: Exact port from graphics.cpp drawLine()
- Scanline polygon: Simplified version (reference uses complex fixed-point)
- Midpoint ellipse: Standard algorithm with scanline fill

---

## 2026-02-04: Binary Cutscene Loader Implementation

**[ARCHITECTURE] Direct binary loading - no JSON extraction step**
- CutsceneLoader extends Three.js `Loader<Cutscene>` pattern
- CutsceneParser handles CMD/POL binary parsing with DataView
- Loads directly from `/DATA/` directory

**[FILES] New source files:**
- `src/CutsceneLoader.ts` - Three.js-style loader with `loadAsync()`
- `src/CutsceneParser.ts` - `parseCMD()` and `parsePOL()` functions
- BinaryReader helper class for big-endian reads

**[PATTERN] Three.js Loader gotcha:**
- Base Loader class has `path` property that conflicts with getters
- Solution: use separate `basePath` property with `setBasePath()` method

**[VERIFIED] Working with multiple cutscenes:**
- INTRO1: 277 shapes, 720 palettes, 261 frames
- CHUTE: 85 shapes, 179 palettes, 172 frames

---

## 2026-02-04: Cutscene Playback Timing Analysis

**[ARCHITECTURE] Graphics persist between frames**
- NOT 25 FPS - effective rate is ~10-12 FPS
- Base clock 60Hz, _frameDelay is multiplier (default 5 = ~12 FPS)
- Accumulate-then-display: draw commands build scene, markCurPos displays
- Static scenes draw once, hold with waitForSync
- Only refreshScreen with clearMode != 0 actually clears

**[REFERENCE] Frame delays by cutscene:**
- Default: 5 ticks (~83ms/frame, ~12 FPS)
- DEBUT: 7 ticks (~117ms/frame, ~8.5 FPS)
- CHUTE: 6 ticks (~100ms/frame, ~10 FPS)

---

## 2026-02-04: Text Rendering System Discovery

**[ARCHITECTURE] Cutscene text uses bitmap fonts, not polygons**
- Text rendered via separate system from polygon cutscene shapes
- 8×8 pixel bitmap glyphs from FB_TXT.FNT (DOS)
- DOS format: 4-bit packed pixels per character
- Opcodes: op_drawCaptionText (6), op_drawTextAtPos (13)
- String data from .TBN files

**[TOOL] Added cutscene frame dumping to REminiscence**
- New `--dump-cutscenes=PATH` command line option
- Saves each frame as PNG to cutscenes/[scene]/frame###.png
- Loop detection: duplicate frame checksum, visited command positions
- Auto-selects first option in interactive menus (op_handleKeys)

---

## 2026-02-04: Memory Discipline Reinforcement

**[META] Added explicit reminder to project.mdc**
- "After EVERY response: Consider what to log to archive.md"
- "Sporadically: Update working.md when patterns emerge"
- "Never ask the user about memory updates"

---

## 2026-02-04: Data Format Update (PC DOS Version)

### Session Summary
Updated extraction tool to support PC DOS game data format where CMD/POL files are separate instead of packed in ABA archive (Amiga format).

### Changes Made

**[TOOL] extract-cutscenes.py updated for directory mode**
- Added `--dir` option to read CMD/POL files directly from a directory
- Changed output option from positional argument to `-o/--output` flag
- Added automatic Bytekiller decompression detection (handles both compressed and raw files)
- Works with both ABA archives (Amiga) and separate files (PC DOS)

**[DATA] PC DOS DATA directory structure**
- 29 cutscenes with separate .CMD and .POL files
- MIDI music files (.MID) - PC DOS format
- PRF music files (different from Amiga MOD)
- Files are uncompressed (not Bytekiller packed like Amiga)
- Binary format (CMD/POL) is identical to Amiga version

**[UI] index.html updated**
- Added all 29 cutscenes to dropdown
- Added descriptive labels for each cutscene
- Replaced LOGOS with LOGOSSSI (new game version)

### Usage Examples
```bash
# Extract from directory (new format)
python tools/extract-cutscenes.py --dir DATA/ -o public/data

# Extract from archive (old format)  
python tools/extract-cutscenes.py DEMO_UK.ABA -o public/data

# List available cutscenes
python tools/extract-cutscenes.py --dir DATA/ --list
```

---

## 2026-02-03: Initial Project Setup & Bug Fixes

### Session Summary
Ported Flashback cutscene extraction and rendering from C++ (REminiscence) to TypeScript/Three.js.

---

### Decisions Made

**[ARCH] Project scope narrowed to cutscenes only**
- Original goal was full engine port
- Decided to focus exclusively on polygon-based cutscene system
- Three.js chosen for rendering (provides shapes, transformations, WebGL)

**[ARCH] Data extraction pipeline**
- Python scripts for extraction (bytekiller decompression, ABA archive parsing, POL/CMD parsing)
- JSON intermediate format for cutscene data
- TypeScript/Three.js viewer consumes JSON

**[ARCH] Coordinate system**
- Original game: Y-down (0 at top, 224 at bottom)
- Three.js: Y-up by default
- Solution: Orthographic camera with flipped top/bottom (top=0, bottom=height)

---

### Problems Solved

**[BUG] Polygon vertex parsing - CRITICAL**
- Symptom: Polygons missing final vertex, US Gold logo incomplete
- Root cause: Loop iterated `numVertices - 1` times instead of `numVertices`
- C++ code: `for (n = numVertices-1; n >= 0; --n)` runs numVertices times
- Python was: `for _ in range(num_vertices - 1)` - runs numVertices-1 times
- Fix: Changed to `for _ in range(num_vertices)`
- File: `tools/parse_pol.py`

**[BUG] State callback not firing**
- Symptom: Frame counter not updating, play/pause button not changing
- Root cause: `onStateChange()` called before `loadCutscene()`, so interpreter was null
- Fix: Store callback in CutscenePlayer, register when interpreter created
- File: `/src/CutscenePlayer.ts`

**[BUG] Shapes accumulating incorrectly between frames**
- Symptom: Shapes from previous frames overlapping current frame
- Root cause: `clearDrawnShapes()` not called at right time
- Fix: Move clear logic into `refreshScreen` command execution
- File: `/src/OpcodeInterpreter.ts`

**[BUG] rebuildToFrame not executing draw commands**
- Symptom: Going to previous frame showed wrong state
- Root cause: Only tracked palette/clear state, didn't execute draw commands
- Fix: Execute all commands when rebuilding
- File: `/src/OpcodeInterpreter.ts`

---

### Patterns Discovered

**POL file structure**
```
Header (20 bytes):
  0x02: shapeOffsetTable offset
  0x06: paletteData offset  
  0x0A: verticesOffsetTable offset
  0x0E: shapeDataTable offset
  0x12: verticesDataTable offset

Vertex data format:
  byte 0: numVertices
    - 0x00: Point (followed by 2x int16 x,y)
    - 0x80: Ellipse (followed by cx,cy,rx,ry int16s)
    - else: Polygon (1 absolute vertex + numVertices delta pairs)
```

**CMD opcode format**
- Opcodes shifted right by 2: `(byte >> 2)` gives opcode number
- Common opcodes: 0=markCurPos, 1=refreshScreen, 2=drawShape, etc.

**Primitive color indexing**
- Color index 0-31 maps to 32-color palette
- Palette slot 0xC0-0xDF in original (offset by 0xC0)
- clearScreen state affects which palette buffer is used (+0x10 offset)

---

### Errors Encountered

**ABA archive parsing**
- Initial xxd exploration showed only .PRF files
- Needed proper parser based on ResourceAba class
- Entry format: 14-byte name, uint32 offset, uint32 compressedSize, uint32 size, uint16 tag

**Bytekiller decompression**
- Initial Python port had incorrect pointer arithmetic
- C++ uses decrementing pointer, Python needed index variable
- Fixed by using `src_pos` index into bytearray

**Sandbox permission errors**
- Writing to `data/cutscenes/` required `permissions: ['all']`

---

### Tools Created

| File | Purpose |
|------|---------|
| `tools/bytekiller.py` | Bytekiller decompression algorithm |
| `tools/parse_aba.py` | ABA archive parser |
| `tools/parse_pol.py` | POL polygon data parser |
| `tools/parse_cmd.py` | CMD command bytecode parser |
| `tools/extract-cutscenes.py` | Main extraction orchestrator |

---

### Files Modified This Session

- `tools/parse_pol.py` - Fixed vertex loop count
- `/src/CutscenePlayer.ts` - Fixed callback registration
- `/src/OpcodeInterpreter.ts` - Fixed clear logic and rebuild
- `/src/ShapeRenderer.ts` - Added degenerate polygon handling
- `/src/main.ts` - Added debug logging

---

### Open Questions After Session

1. Are concave polygons rendering correctly? Three.js ShapeGeometry uses earcut but may fail on complex shapes
2. Is the 2-vertex polygon rendering (as thin lines) correct behavior?
3. Palette buffer switching (clearScreen +0x10 offset) - is this implemented correctly?
4. Zoom values in drawShapeScale seem wrong (65046, 65106 etc) - are these uint16 being treated as signed?

---

## 2026-02-04 - Audio System Implementation

### Feature: Cutscene Audio Playback

Added audio playback support synced with cutscene visuals:

**Files Created:**
- `src/AudioPlayer.ts` - Manages HTML5 Audio element, play/pause/seek
- `src/audioMapping.ts` - Maps cutscene names to audio filenames
- `public/audio/README.md` - Instructions for adding audio files

**Files Modified:**
- `src/CutscenePlayer.ts` - Integrated AudioPlayer, added volume control
- `src/main.ts` - Added audio state display and volume slider
- `index.html` - Added volume control slider and audio info display

**Key Design Decisions:**
1. Used HTML5 Audio API (not Web Audio) for simplicity
2. Audio files must be pre-converted (MIDI playback in browsers requires synthesizer)
3. Sync is frame-based: audio.currentTime = frame / fps
4. Graceful degradation: plays silently if no audio file found

**Audio Mapping Source:**
- REminiscence `_musicTableDOS` array maps cutscene IDs to track numbers
- REminiscence `PrfPlayer::_names` maps track numbers to PRF filenames
- PRF files contain MIDI filename (e.g., `introl3.prf` -> `INTROLON.MID`)

**Supported Formats:** OGG (preferred), MP3, WAV

**Testing Status:** TypeScript compiles, but no audio files added yet (requires MIDI conversion)

---

## 2026-02-04 - Native OPL3 MIDI Playback

### Feature: Authentic FM Synthesis

Added native MIDI playback using libadlmidi-js - a WebAssembly OPL3 emulator.
This plays the original .MID files through authentic AdLib FM synthesis.

**New Dependency:**
- `libadlmidi-js` - WebAssembly build of libADLMIDI

**Files Created:**
- `src/MidiPlayer.ts` - OPL3 MIDI player using libadlmidi-js

**Files Modified:**
- `src/CutscenePlayer.ts` - Dual-mode audio (MIDI preferred, fallback to HTML5)
- `src/audioMapping.ts` - Added getMidiName() helper
- `src/main.ts` - Updated for MIDI preference
- `index.html` - Added .midi class for green color
- `public/audio/README.md` - Updated to explain native MIDI

**Key Design:**
1. MidiPlayer uses DOSBox OPL3 emulator core
2. Loads MIDI files directly from DATA/ directory
3. Uses AudioWorklet for smooth synthesis
4. Falls back to pre-converted audio if MIDI fails
5. UI shows "OPL3" in green when using native playback

**Why This Matters:**
- Authentic DOS game sound - same FM synthesis technology
- No audio conversion required - works with original game files
- True to retro gaming spirit - playing original assets

---

## 2026-02-05: MidiPlayer.ts Cleanup

**Category:** Code cleanup, simplification

**What was done:**
Cleaned up MidiPlayer.ts, removing dead code from audio debugging attempts that didn't fix the underlying instrument mapping issues.

**Removed (~500 lines):**
- `analyzeMidi()` - 120 line MIDI parser that scanned for track/channel/program info
- `MidiAnalysis` interface and related types
- `calculateOctaveWrapOffset()` - workaround for high notes
- Complex instrument mapping logic using program→slot and track→channel mappings
- `currentMidiAnalysis` state property

**Simplified:**
- `loadAndInjectInstruments()` now uses direct slot→channel mapping (PRF slot N → MIDI channel N)
- Extracted `loadInsFile()` as reusable helper
- Reduced from 978 lines to ~485 lines

**Preserved (debug interface):**
- Channel muting: `muteChannel()`, `unmuteChannel()`, `toggleMuteChannel()`
- Channel info: `getChannels()`, `onChannelChange()`, `getAvailableInstruments()`
- Instrument swapping: `setChannelInstrument()`
- Octave offset: `setChannelOctaveOffset()`
- Note testing: `noteOn()`, `noteOff()`, `allNotesOff()`

**Rationale:**
The MIDI analysis code was an attempt to figure out the correct track-to-instrument mapping, but it didn't solve the audio issues. The simpler direct mapping (slot N → channel N) is easier to debug and maintains the same behavior.
