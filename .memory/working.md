# Working Memory - Flashback Cutscene Project

## Current Focus
Cutscene viewer with Three.js - basic rendering working, needs verification against original

## Game Data Version
**PC DOS** - Current DATA directory contains PC DOS version files (not Amiga)
- Separate CMD/POL files (not packed in ABA archive)
- MIDI music (.MID files)
- Same binary format as Amiga but different palette encoding

## Architecture

### Data Flow
```
DATA/*.CMD + DATA/*.POL (PC DOS, uncompressed)
    ↓ parse_cmd.py + parse_pol.py
public/data/*.json (structured data)
    ↓ fetch in browser
CutscenePlayer + OpcodeInterpreter + ShapeRenderer
    ↓ Three.js
WebGL canvas

Alternative (Amiga):
DEMO_UK.ABA (compressed archive)
    ↓ bytekiller_unpack
*.CMD + *.POL (raw binary)
    ↓ same parsers
```

### Key Classes

**CutscenePlayer** - Main orchestrator
- Manages Three.js scene, camera, renderer
- Coordinates ShapeRenderer and OpcodeInterpreter
- Handles playback (play/pause/step)

**OpcodeInterpreter** - Command execution
- Executes CMD opcodes frame by frame
- Tracks state (palette buffers, clearScreen)
- Calls ShapeRenderer for draw operations

**ShapeRenderer** - Primitive rendering
- Pre-renders shapes as Three.js groups
- Clones and positions shapes for each draw call
- Handles palette color lookups

### Coordinate System
- Screen: 256x224
- Viewport: 240x128 at offset (8, 50)
- Y-axis: Down (flipped via ortho camera)

## Critical Code Patterns

### Polygon Vertex Loop (FIXED)
```python
# CORRECT - loop numVertices times for deltas
for _ in range(num_vertices):
    dx = self._read_int8(pos)
    dy = self._read_int8(pos + 1)
```

### Callback Registration Pattern
```typescript
// Store callback before interpreter exists
private stateChangeCallback: ((state) => void) | null = null

onStateChange(cb) {
  this.stateChangeCallback = cb
  this.interpreter?.setOnFrameChange(cb)  // Set if exists
}

loadCutscene(data) {
  this.interpreter = new OpcodeInterpreter(...)
  if (this.stateChangeCallback) {
    this.interpreter.setOnFrameChange(this.stateChangeCallback)
  }
}
```

### Frame Clear Logic
```typescript
// Clear happens on refreshScreen command, not automatically
case 'refreshScreen':
  if ((cmd.clearMode ?? 0) !== 0) {
    this.renderer.clearDrawnShapes()
  }
```

### Playback Timing & Graphics Persistence

**NOT a fixed frame rate system** - timing varies by cutscene:
- Base clock: 60 Hz
- Default _frameDelay: 5 → ~12 FPS
- DEBUT: 7 → ~8.5 FPS
- CHUTE: 6 → ~10 FPS

**Graphics persist between frames** - accumulate-then-display model:
1. Draw commands accumulate on back buffer
2. `markCurPos` swaps buffers and displays
3. `waitForSync` can hold frame for arbitrary time
4. Only `refreshScreen` with clearMode != 0 clears

Static scenes: draw once, hold with `waitForSync`
Animation: redraw changed shapes each frame

## Text Rendering System

Text in cutscenes uses a **bitmap font system**, NOT polygons:
- 8×8 pixel glyphs from `.FNT` files (FB_TXT.FNT for DOS)
- Characters stored starting from ASCII 32 (space)
- DOS format: 4-bit packed pixels (8×4 bytes per char)
- Separate rendering path from polygon shapes
- Drawn on top of vector graphics to same frame buffer

**Cutscene text opcodes:**
- `op_drawCaptionText` (opcode 6) - subtitle-style text at bottom of screen
- `op_drawTextAtPos` (opcode 13) - text at arbitrary x,y position

**String data:** Loaded from `.TBN` files or CINE text resources

## Data Format Reference

### POL Primitive Types
| numVerts byte | Type | Data after |
|---------------|------|------------|
| 0x00 | Point | int16 x, int16 y |
| 0x80+ | Ellipse | int16 cx, cy, rx, ry |
| 1-127 | Polygon | int16 x,y + N delta pairs |

### CMD Opcodes (>>2)
| Op | Name | Args |
|----|------|------|
| 0 | markCurPos | - |
| 1 | refreshScreen | byte clearMode |
| 2 | drawShape | word shapeOffset, [word x, word y] |
| 3 | setPalette | byte palNum, byte bufNum |
| ... | ... | ... |

## Known Issues / TODO

### Rendering
- [ ] Verify concave polygon triangulation
- [ ] Test all extracted cutscenes
- [ ] Compare against REminiscence screenshots

### Data
- [ ] Validate zoom values (seem like uint16 overflow?)
- [ ] Check palette buffer switching logic
- [ ] Implement text rendering (bitmap font from FNT, see Text Rendering System section)

### Player
- [ ] Add cutscene selector dropdown
- [ ] Add speed control
- [ ] Add frame scrubber

## Package Locations

| Path | Contents |
|------|----------|
| `tools/` | Python extraction scripts |
| `data/cutscenes/` | Extracted JSON files |
| `/` | Three.js viewer app |
| `REminiscence/` | Original C++ source (reference) |
| `.cursor/rules/cutscene-system.mdc` | Detailed cutscene system documentation |
