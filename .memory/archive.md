# Archive - Flashback Cutscene Project

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
