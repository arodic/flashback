"""
POL (Polygon) file parser for Flashback cutscenes.

POL files contain:
- Shape definitions (collections of primitives)
- Vertex data for polygons, ellipses, and points
- Color palettes (16-bit Amiga format)

File structure:
    Header (20 bytes):
        0x00: unknown
        0x02: shapeOffsetTable offset
        0x04: unknown  
        0x06: paletteData offset
        0x08: unknown
        0x0A: verticesOffsetTable offset
        0x0C: unknown
        0x0E: shapeDataTable offset
        0x10: unknown
        0x12: verticesDataTable offset
"""

import struct
import json
from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Tuple, Optional


@dataclass
class Color:
    """RGB color (0-255 per channel)."""
    r: int
    g: int
    b: int
    
    @classmethod
    def from_amiga(cls, value: int) -> 'Color':
        """Convert 16-bit Amiga color (0x0RGB) to Color."""
        r = ((value >> 8) & 0xF) * 17  # 0-15 -> 0-255
        g = ((value >> 4) & 0xF) * 17
        b = (value & 0xF) * 17
        return cls(r, g, b)


@dataclass
class Point:
    """A single point primitive."""
    x: int
    y: int


@dataclass
class Ellipse:
    """An ellipse primitive."""
    cx: int  # Center X
    cy: int  # Center Y
    rx: int  # Radius X
    ry: int  # Radius Y


@dataclass
class Polygon:
    """A filled polygon primitive."""
    vertices: List[Tuple[int, int]]


@dataclass
class Primitive:
    """A drawing primitive (polygon, ellipse, or point)."""
    type: str  # "polygon", "ellipse", or "point"
    color: int  # Palette index (0-31)
    has_alpha: bool
    offset_x: int = 0
    offset_y: int = 0
    data: Any = None  # Point, Ellipse, or Polygon


@dataclass
class Shape:
    """A shape composed of multiple primitives."""
    id: int
    primitives: List[Primitive]


@dataclass  
class Palette:
    """A 16-color palette (32 bytes in Amiga format)."""
    colors: List[Color]


class POLParser:
    """Parser for POL polygon data files."""
    
    def __init__(self, data: bytes):
        self.data = data
        self._parse_header()
    
    def _read_be_uint16(self, offset: int) -> int:
        return struct.unpack('>H', self.data[offset:offset + 2])[0]
    
    def _read_be_int16(self, offset: int) -> int:
        return struct.unpack('>h', self.data[offset:offset + 2])[0]
    
    def _read_int8(self, offset: int) -> int:
        value = self.data[offset]
        return value if value < 128 else value - 256
    
    def _parse_header(self) -> None:
        """Parse the POL file header."""
        if len(self.data) < 0x14:
            raise ValueError("POL data too short")
        
        self.shape_offset_table = self._read_be_uint16(0x02)
        self.palette_offset = self._read_be_uint16(0x06)
        self.vertices_offset_table = self._read_be_uint16(0x0A)
        self.shape_data_table = self._read_be_uint16(0x0E)
        self.vertices_data_table = self._read_be_uint16(0x12)
    
    def get_shape_count(self) -> int:
        """Calculate number of shapes in the file."""
        # Shape offset table runs until palette offset
        table_size = self.palette_offset - self.shape_offset_table
        return table_size // 2
    
    def parse_palette(self, palette_index: int = 0) -> Palette:
        """Parse a 16-color palette (32 bytes in Amiga format)."""
        offset = self.palette_offset + (palette_index * 16 * 2)
        colors = []
        
        for i in range(16):
            color_value = self._read_be_uint16(offset + i * 2)
            colors.append(Color.from_amiga(color_value))
        
        return Palette(colors=colors)
    
    def get_palette_count(self) -> int:
        """Estimate number of palettes in the file."""
        # Palettes are stored between palette_offset and vertices_offset_table
        palette_size = 16 * 2  # 16 colors * 2 bytes each = 32 bytes
        available = self.vertices_offset_table - self.palette_offset
        return max(1, available // palette_size)
    
    def parse_vertices(self, vertex_index: int) -> Tuple[str, Any]:
        """
        Parse vertex data and return (type, data).
        
        Returns:
            Tuple of (primitive_type, data) where:
            - ("point", Point)
            - ("ellipse", Ellipse)  
            - ("polygon", Polygon)
        """
        # Get vertex data offset from table
        table_offset = self.vertices_offset_table + vertex_index * 2
        vertex_rel_offset = self._read_be_uint16(table_offset)
        vertex_offset = self.vertices_data_table + vertex_rel_offset
        
        num_vertices = self.data[vertex_offset]
        pos = vertex_offset + 1
        
        if num_vertices == 0:
            # Point primitive
            x = self._read_be_int16(pos)
            y = self._read_be_int16(pos + 2)
            return ("point", Point(x=x, y=y))
        
        elif num_vertices & 0x80:
            # Ellipse primitive
            cx = self._read_be_int16(pos)
            cy = self._read_be_int16(pos + 2)
            rx = self._read_be_int16(pos + 4)
            ry = self._read_be_int16(pos + 6)
            return ("ellipse", Ellipse(cx=cx, cy=cy, rx=rx, ry=ry))
        
        else:
            # Polygon primitive
            # First vertex is absolute
            ix = self._read_be_int16(pos)
            iy = self._read_be_int16(pos + 2)
            pos += 4
            
            vertices = [(ix, iy)]
            
            # Remaining vertices are deltas
            # The C++ code does: n = numVertices - 1; for (; n >= 0; --n)
            # Which loops numVertices times (from n=numVertices-1 down to n=0 inclusive)
            # Total vertices = 1 initial + numVertices deltas = numVertices + 1
            for _ in range(num_vertices):
                dx = self._read_int8(pos)
                dy = self._read_int8(pos + 1)
                pos += 2
                ix += dx
                iy += dy
                vertices.append((ix, iy))
            
            return ("polygon", Polygon(vertices=vertices))
    
    def parse_shape(self, shape_index: int) -> Shape:
        """Parse a complete shape with all its primitives."""
        # Get shape data offset from table
        table_offset = self.shape_offset_table + shape_index * 2
        shape_rel_offset = self._read_be_uint16(table_offset)
        shape_offset = self.shape_data_table + shape_rel_offset
        
        # Read primitive count
        primitive_count = self._read_be_uint16(shape_offset)
        pos = shape_offset + 2
        
        primitives = []
        
        for _ in range(primitive_count):
            # Read vertex offset word (contains flags in upper bits)
            vertex_offset_word = self._read_be_uint16(pos)
            pos += 2
            
            has_offset = (vertex_offset_word & 0x8000) != 0
            has_alpha = (vertex_offset_word & 0x4000) != 0
            vertex_index = vertex_offset_word & 0x3FFF
            
            # Read optional offset
            offset_x = offset_y = 0
            if has_offset:
                offset_x = self._read_be_int16(pos)
                offset_y = self._read_be_int16(pos + 2)
                pos += 4
            
            # Read color
            color = self.data[pos]
            pos += 1
            
            # Parse vertex data
            prim_type, prim_data = self.parse_vertices(vertex_index)
            
            primitive = Primitive(
                type=prim_type,
                color=color,
                has_alpha=has_alpha,
                offset_x=offset_x,
                offset_y=offset_y,
                data=prim_data
            )
            primitives.append(primitive)
        
        return Shape(id=shape_index, primitives=primitives)
    
    def parse_all(self) -> Dict[str, Any]:
        """Parse entire POL file to a dictionary."""
        shape_count = self.get_shape_count()
        palette_count = self.get_palette_count()
        
        # Parse all palettes
        palettes = []
        for i in range(palette_count):
            try:
                palette = self.parse_palette(i)
                palettes.append([asdict(c) for c in palette.colors])
            except:
                break
        
        # Parse all shapes
        shapes = []
        for i in range(shape_count):
            try:
                shape = self.parse_shape(i)
                shape_dict = {
                    "id": shape.id,
                    "primitives": []
                }
                
                for prim in shape.primitives:
                    prim_dict = {
                        "type": prim.type,
                        "color": prim.color,
                        "hasAlpha": prim.has_alpha,
                    }
                    
                    if prim.offset_x != 0 or prim.offset_y != 0:
                        prim_dict["offsetX"] = prim.offset_x
                        prim_dict["offsetY"] = prim.offset_y
                    
                    if prim.type == "point":
                        prim_dict["x"] = prim.data.x
                        prim_dict["y"] = prim.data.y
                    elif prim.type == "ellipse":
                        prim_dict["cx"] = prim.data.cx
                        prim_dict["cy"] = prim.data.cy
                        prim_dict["rx"] = prim.data.rx
                        prim_dict["ry"] = prim.data.ry
                    elif prim.type == "polygon":
                        prim_dict["vertices"] = prim.data.vertices
                    
                    shape_dict["primitives"].append(prim_dict)
                
                shapes.append(shape_dict)
            except Exception as e:
                print(f"Warning: Failed to parse shape {i}: {e}")
                break
        
        return {
            "palettes": palettes,
            "shapes": shapes
        }
    
    def to_json(self, indent: int = 2) -> str:
        """Convert POL file to JSON string."""
        return json.dumps(self.parse_all(), indent=indent)


def parse_pol(data: bytes) -> Dict[str, Any]:
    """Parse POL data and return as dictionary."""
    parser = POLParser(data)
    return parser.parse_all()


def parse_pol_to_json(data: bytes, indent: int = 2) -> str:
    """Parse POL data and return as JSON string."""
    parser = POLParser(data)
    return parser.to_json(indent=indent)


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python parse_pol.py <file.pol> [output.json]")
        sys.exit(1)
    
    with open(sys.argv[1], 'rb') as f:
        data = f.read()
    
    parser = POLParser(data)
    
    print(f"POL file: {len(data)} bytes")
    print(f"  Shape offset table:    0x{parser.shape_offset_table:04x}")
    print(f"  Palette offset:        0x{parser.palette_offset:04x}")
    print(f"  Vertices offset table: 0x{parser.vertices_offset_table:04x}")
    print(f"  Shape data table:      0x{parser.shape_data_table:04x}")
    print(f"  Vertices data table:   0x{parser.vertices_data_table:04x}")
    print(f"  Shape count:           {parser.get_shape_count()}")
    print(f"  Palette count:         {parser.get_palette_count()}")
    
    if len(sys.argv) > 2:
        json_str = parser.to_json()
        with open(sys.argv[2], 'w') as f:
            f.write(json_str)
        print(f"\nWritten to {sys.argv[2]}")
    else:
        # Print first shape as sample
        print("\nFirst shape:")
        shape = parser.parse_shape(0)
        print(f"  Primitives: {len(shape.primitives)}")
        for i, prim in enumerate(shape.primitives[:5]):
            print(f"    [{i}] {prim.type}, color={prim.color}")
        if len(shape.primitives) > 5:
            print(f"    ... and {len(shape.primitives) - 5} more")
