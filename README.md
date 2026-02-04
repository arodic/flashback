# Flashback Cutscene Viewer

A Three.js-based viewer for Flashback (1992) polygon cutscenes.

This project extracts the vector-polygon cutscene data from the original game files
and renders them using WebGL/Three.js.

## Project Structure

```
Flashback/
├── DATA/                     # Original game data files
│   └── DEMO_UK.ABA          # Demo archive containing cutscene data
├── REminiscence/            # Reference C++ implementation
├── tools/                   # Python extraction tools
│   ├── bytekiller.py        # Decompression
│   ├── parse_aba.py         # Archive reader
│   ├── parse_pol.py         # Polygon parser
│   ├── parse_cmd.py         # Command parser
│   └── extract-cutscenes.py # Main extraction script
├── data/
│   └── cutscenes/           # Extracted JSON files
├── packages/
│   └── cutscene-viewer/     # Three.js web viewer
└── test/                    # Verification tools
```

## Quick Start

### 1. Extract cutscene data

```bash
python tools/extract-cutscenes.py DATA/DEMO_UK.ABA data/cutscenes
```

### 2. Run the viewer

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000 in your browser.

### 3. Controls

- **← →** Arrow keys: Navigate frames
- **Space**: Play/Pause
- **Home**: Reset to first frame

## Available Cutscenes

| Name | Shapes | Frames | Description |
|------|--------|--------|-------------|
| LOGOS | 6 | 151 | Publisher logos |
| INTRO1 | 277 | - | Intro part 1 |
| INTRO2 | 186 | - | Intro part 2 |
| OBJET | 152 | 407 | Object cutscenes |
| CHUTE | 85 | 172 | Fall sequences |
| GEN | 88 | 155 | Genesis sequences |
| HOLOSEQ | 51 | - | Hologram sequences |
| ... | ... | ... | ... |

## Technical Details

### Data Format

The original Flashback cutscenes use two file types:

- **POL** (Polygon): Contains shape definitions, vertex data, and palettes
- **CMD** (Command): Contains bytecode that controls playback

See [.cursor/rules/cutscene-system.mdc](.cursor/rules/cutscene-system.mdc) for 
detailed documentation of the data formats.

### Rendering

The viewer uses Three.js with:
- Orthographic camera (256x224 original resolution)
- ShapeGeometry for polygons
- EllipseCurve for ellipses
- Palette-based coloring

## Development

### Extract a specific cutscene

```bash
python tools/extract-cutscenes.py DATA/DEMO_UK.ABA data/cutscenes --cutscene LOGOS --pretty
```

### List available cutscenes

```bash
python tools/extract-cutscenes.py DATA/DEMO_UK.ABA --list
```

### Run verification tests

See [test/README.md](test/README.md) for details on comparing renders against
the reference REminiscence implementation.

## License

The extraction tools and viewer are open source. The original Flashback game 
data files are copyrighted by Delphine Software/U.S. Gold.

## Credits

- Original game: Delphine Software (1992)
- REminiscence engine: Gregory Montoir (2005-2019)
- Cutscene viewer: This project
