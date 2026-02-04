# Cutscene Verification Tests

This directory contains reference screenshots and comparison tools for verifying
the Three.js cutscene renderer matches the original REminiscence output.

## Directory Structure

```
test/
├── reference/           # Reference screenshots from REminiscence
│   ├── logos_frame001.png
│   ├── logos_frame050.png
│   └── ...
├── output/              # Screenshots from Three.js viewer
│   └── ...
├── diff/                # Difference images
│   └── ...
└── compare.py           # Comparison script
```

## Capturing Reference Screenshots

### Option 1: Build and run REminiscence

1. Install SDL2 development libraries:
   ```bash
   # macOS
   brew install sdl2
   
   # Ubuntu/Debian
   sudo apt install libsdl2-dev
   ```

2. Build REminiscence:
   ```bash
   cd REminiscence
   make
   ```

3. Run with screenshot mode:
   ```bash
   ./re --datapath=../DATA --cutscene=LOGOS --screenshot
   ```

### Option 2: Use video capture

1. Run REminiscence normally
2. Play the LOGOS cutscene
3. Use screen recording software
4. Extract frames using ffmpeg:
   ```bash
   ffmpeg -i recording.mp4 -vf "fps=12" reference/logos_frame%03d.png
   ```

## Capturing Three.js Screenshots

1. Start the viewer:
   ```bash
   cd packages/cutscene-viewer
   pnpm dev
   ```

2. Open http://localhost:3000

3. Use keyboard controls:
   - Arrow keys: navigate frames
   - Space: play/pause
   - Home: reset to first frame

4. Take screenshots manually, or use the browser console:
   ```javascript
   // Get canvas data URL
   document.querySelector('canvas').toDataURL('image/png')
   ```

## Running Comparison

```bash
python test/compare.py test/reference/logos_frame001.png test/output/logos_frame001.png
```

The comparison will output:
- Pixel difference percentage
- Visual diff image saved to `test/diff/`
