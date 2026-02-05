# Flashback Cutscene Player

A TypeScript/Canvas 2D player for Flashback (1992) polygon cutscenes with authentic OPL3 audio.

This project loads the original DOS game data files directly and renders the vector-polygon cutscenes in the browser, complete with FM synthesizer music playback.

## Features

- **Pixel-accurate rendering** - Canvas 2D scanline rasterization matching the original engine (99.8% pixel accuracy)
- **Direct binary loading** - Loads original CMD/POL files without extraction step
- **Authentic OPL3 audio** - Native FM synthesis via libadlmidi-js WebAssembly emulator
- **Frame-accurate playback** - Implements original timing system (60Hz base clock with frame delay multipliers)

## Quick Start

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 in your browser.

### Controls

| Key | Action |
|-----|--------|
| **Space** | Play/Pause |
| **← →** | Step frames |
| **Home** | Reset to first frame |

## Project Structure

```
Flashback/
├── src/
│   ├── main.ts              # Entry point, UI bindings
│   ├── CutscenePlayer.ts    # Main orchestrator (graphics + audio)
│   ├── CutsceneLoader.ts    # Binary file loader
│   ├── CutsceneParser.ts    # CMD/POL binary parsing
│   ├── OpcodeInterpreter.ts # Cutscene bytecode VM
│   ├── Canvas2DRenderer.ts  # Shape rendering
│   ├── Graphics.ts          # Bresenham lines, scanline polygon fill
│   ├── MidiPlayer.ts        # OPL3 MIDI playback
│   ├── InsParser.ts         # AdLib instrument file parser
│   ├── InsToOpl3.ts         # INS → libadlmidi-js conversion
│   ├── PrfParser.ts         # PRF channel config parser
│   ├── audioMapping.ts      # Cutscene → music file mapping
│   └── types.ts             # Shared interfaces
├── DATA/                    # Original PC DOS game files
│   ├── *.CMD                # Cutscene command bytecode
│   ├── *.POL                # Cutscene polygon data
│   ├── *.MID                # MIDI music files
│   ├── *.PRF                # Instrument configuration
│   └── *.INS                # AdLib instrument patches
├── reference/               # REminiscence C++ source + frame dumps
│   ├── *.cpp                # REminiscence reimplementation (multi-platform support)
│   └── cutscenes/           # PNG frame dumps for pixel comparison
└── public/
    ├── flashback-instruments.json
    └── flashback.wopl       # OPL3 instrument bank
```

## Technical Details

### Graphics Pipeline

```
DATA/*.CMD + DATA/*.POL
    ↓ CutsceneLoader → CutsceneParser
Cutscene { shapes, palettes, script }
    ↓ OpcodeInterpreter
Draw commands (polygon, line, ellipse)
    ↓ Canvas2DRenderer → Graphics
ImageData buffer (256×224)
    ↓ CSS scaling
Browser display
```

### Audio Pipeline

```
PRF file (channel→instrument mapping)
    ↓ PrfParser
INS files (80-byte AdLib patches)
    ↓ InsParser → InsToOpl3
libadlmidi-js (Nuked OPL3 emulator)
    ↓ MIDI file + custom instruments
AudioWorklet output
```

### Data Formats

| Format | Description |
|--------|-------------|
| **CMD** | Cutscene command bytecode (opcodes shifted right by 2) |
| **POL** | Polygon/vertex data with palette tables |
| **MID** | Standard MIDI files |
| **PRF** | Per-channel instrument configuration |
| **INS** | 80-byte AdLib instrument patches |

See [.cursor/rules/cutscene-system.mdc](.cursor/rules/cutscene-system.mdc) for detailed format documentation.

## Available Cutscenes

| Name | Description |
|------|-------------|
| LOGOSSSI | Publisher logos (SSI/US Gold) |
| INTRO1 | Intro part 1 - Story setup |
| INTRO2 | Intro part 2 - Conrad's mission |
| DEBUT | Game start sequence |
| CHUTE | Fall/parachute sequences |
| OBJET | Object/item cutscenes |
| GEN | Genesis (death gate) sequences |
| ASCENSEUR | Elevator sequences |
| HOLOSEQ | Hologram sequences |
| FIN | Ending sequences |
| NEWLEVEL | Level transition |
| CREDITS | End credits |
| ... | 29 cutscenes total |

## Known Issues & Challenges

### Graphics

| Issue | Status | Notes |
|-------|--------|-------|
| **Edge pixel differences** | ~0.17% | Scanline rasterization differs slightly from reference at polygon boundaries |
| **Complex polygon algorithm** | Simplified | Reference uses ~600 lines with half-step corrections; we use simplified version |

### Audio

| Issue | Status | Notes |
|-------|--------|-------|
| **Instrument mapping** | Partial | Some channels may have wrong instruments assigned |
| **OPL3 octave wrap** | Workaround | Hardware overflow behavior (octave 8→0) not fully replicated |
| **Browser autoplay** | Handled | Defers audio init until user interaction |

### Architecture Decisions & Trade-offs

| Decision | Rationale |
|----------|-----------|
| **Canvas 2D over Three.js** | Three.js triangulation and WebGL rasterization couldn't achieve pixel-perfect matching |
| **Direct binary loading** | Eliminated JSON extraction step; simpler pipeline |
| **libadlmidi-js for audio** | Authentic FM synthesis without pre-converted audio files |
| **Relative paths everywhere** | Enables GitHub Pages subdirectory deployment |

## Development

### Testing

```bash
pnpm test              # Run Vitest
pnpm exec playwright install chromium  # If browsers not installed
```

Frame comparison tests compare rendered output against reference PNG dumps.

### Build & Deploy

```bash
pnpm build             # TypeScript + Vite build to root
```

Build outputs directly to project root for simple deployment:
- `index.html` (built from `index.src.html`)
- `assets/` (bundled JS, WASM)

### Path Rules

All paths must be relative (no leading `/`) for subdirectory deployment:
- `./DATA/` not `/DATA/`
- `./assets/` not `/assets/`

## History

This project evolved significantly:

1. **Initial**: Python extraction → JSON → Three.js viewer
2. **Binary loading**: Removed JSON step, parse CMD/POL directly
3. **Canvas 2D rewrite**: Replaced Three.js for pixel accuracy (4.6% → 0.17% difference)
4. **OPL3 audio**: Added native FM synthesis via libadlmidi-js

See [.memory/archive.md](.memory/archive.md) for detailed development history.

## Credits

- **Original game**: Delphine Software (1992)
- **REminiscence engine**: Gregory Montoir (2005-2019) - C++ reference implementation
- **libadlmidi**: Vitaly Novichkov - OPL3 emulator
- **Cutscene player**: This project

## License

The viewer code is open source. The original Flashback game data files are copyrighted by Delphine Software/U.S. Gold.
