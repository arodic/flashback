# Flashback Cutscene Extraction Tools

Python tools for extracting and parsing Flashback (1992) cutscene data.

## Requirements

- Python 3.8+
- No external dependencies

## Files

| File | Description |
|------|-------------|
| `bytekiller.py` | Bytekiller decompression algorithm |
| `parse_aba.py` | ABA archive reader |
| `parse_pol.py` | POL (polygon) file parser |
| `parse_cmd.py` | CMD (command) file parser |
| `extract-cutscenes.py` | Main extraction script |

## Usage

### Extract from a directory of CMD/POL files (recommended)

The `--dir` option allows extracting from a directory containing separate CMD and POL files:

```bash
# Extract all cutscenes from DATA directory
python extract-cutscenes.py --dir DATA/ -o public/data

# Extract a specific cutscene
python extract-cutscenes.py --dir DATA/ -o public/data -c INTRO1

# List available cutscenes
python extract-cutscenes.py --dir DATA/ --list
```

### Extract from an ABA archive

For older game data versions that use ABA archives:

```bash
# Extract all cutscenes from an archive
python extract-cutscenes.py DATA/DEMO_UK.ABA -o public/data

# Extract a specific cutscene
python extract-cutscenes.py DATA/DEMO_UK.ABA -o public/data --cutscene LOGOS

# List available cutscenes
python extract-cutscenes.py DATA/DEMO_UK.ABA --list
```

### Additional options

```bash
# Output combined JSON file
python extract-cutscenes.py --dir DATA/ -o public/data --combined --pretty

# Pretty-print JSON output (for debugging)
python extract-cutscenes.py --dir DATA/ -o public/data --pretty
```

## Output Format

### Individual cutscene JSON

```json
{
  "name": "LOGOS",
  "shapes": [
    {
      "id": 0,
      "primitives": [
        {
          "type": "polygon",
          "color": 14,
          "hasAlpha": false,
          "vertices": [[109, 61], [131, 46], ...]
        }
      ]
    }
  ],
  "palettes": [
    [{"r": 0, "g": 0, "b": 0}, {"r": 204, "g": 204, "b": 204}, ...]
  ],
  "script": {
    "subsceneCount": 2,
    "subscenes": [
      {
        "id": 0,
        "frames": [
          {
            "commands": [
              {"op": "drawShape", "shapeId": 5, "x": 0, "y": 0}
            ]
          }
        ]
      }
    ]
  }
}
```

## Data Formats

### POL File (Polygon Data)

Contains vector graphics data:
- **Shapes**: Collections of primitives (polygons, ellipses, points)
- **Palettes**: 32-color palettes in Amiga format (0x0RGB)

### CMD File (Command Data)

Contains bytecode for cutscene playback:
- Shape drawing commands with position/scale/rotation
- Palette changes
- Frame timing
- Text display
- Input handling

## Individual Module Usage

### Parse a POL file

```python
from parse_pol import POLParser

with open("LOGOS.POL", "rb") as f:
    data = f.read()

parser = POLParser(data)
result = parser.parse_all()

# Access shapes
for shape in result["shapes"]:
    print(f"Shape {shape['id']}: {len(shape['primitives'])} primitives")
```

### Parse a CMD file

```python
from parse_cmd import CMDParser

with open("LOGOS.CMD", "rb") as f:
    data = f.read()

parser = CMDParser(data)
result = parser.parse_all()

# Access commands
for subscene in result["subscenes"]:
    for frame in subscene["frames"]:
        for cmd in frame["commands"]:
            print(cmd)
```

### Read from ABA archive

```python
from parse_aba import ABAArchive

archive = ABAArchive("DEMO_UK.ABA")

# List all files
for entry in archive.list_entries():
    print(entry.name, entry.uncompressed_size)

# Extract a file
data = archive.extract("LOGOS.POL")
```
