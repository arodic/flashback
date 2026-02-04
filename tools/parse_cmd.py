"""
CMD (Command) file parser for Flashback cutscenes.

CMD files contain bytecode that controls cutscene playback:
- Shape drawing commands
- Palette changes
- Timing/synchronization
- Input handling
- Text display

File structure:
    Header:
        uint16 sub_count        - Number of sub-cutscenes
        uint16 offset[sub_count] - Offsets to each sub-cutscene
        ... bytecode ...        - Starts at (sub_count + 1) * 2

Opcode encoding:
    byte = (opcode << 2) | flags
    opcode = byte >> 2  (0-14)
"""

import struct
import json
from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Tuple
from enum import IntEnum


class Opcode(IntEnum):
    """Cutscene opcodes."""
    MARK_CUR_POS = 0          # Mark frame position, update screen
    REFRESH_SCREEN = 1        # Set clear screen mode
    WAIT_FOR_SYNC = 2         # Wait N frames
    DRAW_SHAPE = 3            # Draw shape at position
    SET_PALETTE = 4           # Set palette
    MARK_CUR_POS_2 = 5        # Alias for MARK_CUR_POS
    DRAW_CAPTION_TEXT = 6     # Draw subtitle text
    NOP = 7                   # No operation
    SKIP_3 = 8                # Skip 3 bytes
    REFRESH_ALL = 9           # Refresh and handle keys
    DRAW_SHAPE_SCALE = 10     # Draw scaled shape
    DRAW_SHAPE_SCALE_ROT = 11 # Draw scaled and rotated shape
    COPY_SCREEN = 12          # Copy screen buffers
    DRAW_TEXT_AT_POS = 13     # Draw text at position
    HANDLE_KEYS = 14          # Handle input branching


OPCODE_NAMES = {
    Opcode.MARK_CUR_POS: "markCurPos",
    Opcode.REFRESH_SCREEN: "refreshScreen",
    Opcode.WAIT_FOR_SYNC: "waitForSync",
    Opcode.DRAW_SHAPE: "drawShape",
    Opcode.SET_PALETTE: "setPalette",
    Opcode.MARK_CUR_POS_2: "markCurPos",
    Opcode.DRAW_CAPTION_TEXT: "drawCaptionText",
    Opcode.NOP: "nop",
    Opcode.SKIP_3: "skip3",
    Opcode.REFRESH_ALL: "refreshAll",
    Opcode.DRAW_SHAPE_SCALE: "drawShapeScale",
    Opcode.DRAW_SHAPE_SCALE_ROT: "drawShapeScaleRotate",
    Opcode.COPY_SCREEN: "copyScreen",
    Opcode.DRAW_TEXT_AT_POS: "drawTextAtPos",
    Opcode.HANDLE_KEYS: "handleKeys",
}


@dataclass
class Command:
    """A single cutscene command."""
    opcode: int
    name: str
    args: Dict[str, Any]
    offset: int  # Position in CMD file


class CMDParser:
    """Parser for CMD cutscene command files."""
    
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0
        self._parse_header()
    
    def _read_uint8(self) -> int:
        value = self.data[self.pos]
        self.pos += 1
        return value
    
    def _read_int8(self) -> int:
        value = self.data[self.pos]
        self.pos += 1
        return value if value < 128 else value - 256
    
    def _read_be_uint16(self) -> int:
        value = struct.unpack('>H', self.data[self.pos:self.pos + 2])[0]
        self.pos += 2
        return value
    
    def _read_be_int16(self) -> int:
        value = struct.unpack('>h', self.data[self.pos:self.pos + 2])[0]
        self.pos += 2
        return value
    
    def _parse_header(self) -> None:
        """Parse CMD file header.
        
        When sub_count == 0, there is one implicit subscene starting at offset 2.
        When sub_count > 0, there are explicit subscene offsets.
        """
        self.pos = 0
        self.sub_count = self._read_be_uint16()
        self.base_offset = (self.sub_count + 1) * 2
        
        self.sub_offsets = []
        if self.sub_count == 0:
            # Single implicit subscene at offset 0 from base
            self.sub_offsets = [0]
            self.sub_count = 1
        else:
            for _ in range(self.sub_count):
                self.sub_offsets.append(self._read_be_uint16())
    
    def _parse_command(self) -> Optional[Command]:
        """Parse a single command at current position."""
        if self.pos >= len(self.data):
            return None
        
        start_offset = self.pos
        byte = self._read_uint8()
        
        # Check for end marker
        if byte & 0x80:
            return None
        
        opcode = byte >> 2
        if opcode > 14:
            raise ValueError(f"Invalid opcode {opcode} at offset 0x{start_offset:04x}")
        
        name = OPCODE_NAMES.get(Opcode(opcode), f"unknown_{opcode}")
        args = {}
        
        # Parse arguments based on opcode
        if opcode == Opcode.REFRESH_SCREEN:
            args["clearMode"] = self._read_uint8()
        
        elif opcode == Opcode.WAIT_FOR_SYNC:
            args["frames"] = self._read_uint8()
        
        elif opcode == Opcode.DRAW_SHAPE:
            shape_word = self._read_be_uint16()
            args["shapeId"] = shape_word & 0x7FF
            
            if shape_word & 0x8000:
                args["x"] = self._read_be_int16()
                args["y"] = self._read_be_int16()
            else:
                args["x"] = 0
                args["y"] = 0
        
        elif opcode == Opcode.SET_PALETTE:
            args["paletteNum"] = self._read_uint8()
            args["bufferNum"] = self._read_uint8()
        
        elif opcode == Opcode.DRAW_CAPTION_TEXT:
            args["stringId"] = self._read_be_uint16()
        
        elif opcode == Opcode.SKIP_3:
            # Skip 3 bytes (unknown purpose)
            args["skipped"] = [self._read_uint8() for _ in range(3)]
        
        elif opcode == Opcode.DRAW_SHAPE_SCALE:
            shape_word = self._read_be_uint16()
            args["shapeId"] = shape_word & 0x7FF
            
            if shape_word & 0x8000:
                args["x"] = self._read_be_int16()
                args["y"] = self._read_be_int16()
            else:
                args["x"] = 0
                args["y"] = 0
            
            args["zoom"] = self._read_be_uint16()
            args["originX"] = self._read_uint8()
            args["originY"] = self._read_uint8()
        
        elif opcode == Opcode.DRAW_SHAPE_SCALE_ROT:
            shape_word = self._read_be_uint16()
            args["shapeId"] = shape_word & 0x7FF
            
            if shape_word & 0x8000:
                args["x"] = self._read_be_int16()
                args["y"] = self._read_be_int16()
            else:
                args["x"] = 0
                args["y"] = 0
            
            if shape_word & 0x4000:
                args["zoom"] = self._read_be_uint16()
            else:
                args["zoom"] = 0
            
            args["originX"] = self._read_uint8()
            args["originY"] = self._read_uint8()
            
            args["rotationA"] = self._read_be_uint16()
            
            if shape_word & 0x2000:
                args["rotationB"] = self._read_be_uint16()
            else:
                args["rotationB"] = 180  # Default
            
            if shape_word & 0x1000:
                args["rotationC"] = self._read_be_uint16()
            else:
                args["rotationC"] = 90  # Default
        
        elif opcode == Opcode.DRAW_TEXT_AT_POS:
            string_id = self._read_be_uint16()
            if string_id != 0xFFFF:
                args["stringId"] = string_id & 0xFFF
                args["color"] = (string_id >> 12) & 0xF
                args["x"] = self._read_int8() * 8
                args["y"] = self._read_int8() * 8
        
        elif opcode == Opcode.HANDLE_KEYS:
            # Parse key handlers (variable length)
            handlers = []
            while True:
                key_mask = self._read_uint8()
                if key_mask == 0xFF:
                    break
                target = self._read_be_int16()
                handlers.append({
                    "keyMask": key_mask,
                    "target": target
                })
            args["handlers"] = handlers
        
        # Other opcodes have no arguments (MARK_CUR_POS, NOP, REFRESH_ALL, COPY_SCREEN)
        
        return Command(
            opcode=opcode,
            name=name,
            args=args,
            offset=start_offset
        )
    
    def parse_subscene(self, index: int) -> List[Command]:
        """Parse all commands in a sub-cutscene."""
        if index >= self.sub_count:
            raise IndexError(f"Sub-cutscene {index} out of range (0-{self.sub_count - 1})")
        
        self.pos = self.base_offset + self.sub_offsets[index]
        commands = []
        
        while self.pos < len(self.data):
            cmd = self._parse_command()
            if cmd is None:
                break
            commands.append(cmd)
        
        return commands
    
    def parse_all(self) -> Dict[str, Any]:
        """Parse entire CMD file to a dictionary."""
        subscenes = []
        
        for i in range(self.sub_count):
            commands = self.parse_subscene(i)
            
            # Group commands into frames (separated by markCurPos)
            frames = []
            current_frame = []
            
            for cmd in commands:
                cmd_dict = {
                    "op": cmd.name,
                    **cmd.args
                }
                
                if cmd.name == "markCurPos" and current_frame:
                    frames.append({"commands": current_frame})
                    current_frame = []
                
                current_frame.append(cmd_dict)
            
            # Don't forget the last frame
            if current_frame:
                frames.append({"commands": current_frame})
            
            subscenes.append({
                "id": i,
                "offset": self.sub_offsets[i],
                "frames": frames
            })
        
        return {
            "subsceneCount": self.sub_count,
            "baseOffset": self.base_offset,
            "subscenes": subscenes
        }
    
    def to_json(self, indent: int = 2) -> str:
        """Convert CMD file to JSON string."""
        return json.dumps(self.parse_all(), indent=indent)


def parse_cmd(data: bytes) -> Dict[str, Any]:
    """Parse CMD data and return as dictionary."""
    parser = CMDParser(data)
    return parser.parse_all()


def parse_cmd_to_json(data: bytes, indent: int = 2) -> str:
    """Parse CMD data and return as JSON string."""
    parser = CMDParser(data)
    return parser.to_json(indent=indent)


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python parse_cmd.py <file.cmd> [output.json]")
        sys.exit(1)
    
    with open(sys.argv[1], 'rb') as f:
        data = f.read()
    
    parser = CMDParser(data)
    
    print(f"CMD file: {len(data)} bytes")
    print(f"  Sub-cutscene count: {parser.sub_count}")
    print(f"  Base offset: 0x{parser.base_offset:04x}")
    print(f"  Sub-cutscene offsets: {[f'0x{o:04x}' for o in parser.sub_offsets]}")
    
    if len(sys.argv) > 2:
        json_str = parser.to_json()
        with open(sys.argv[2], 'w') as f:
            f.write(json_str)
        print(f"\nWritten to {sys.argv[2]}")
    else:
        # Print first few commands as sample
        print("\nFirst sub-cutscene commands:")
        commands = parser.parse_subscene(0)
        for i, cmd in enumerate(commands[:15]):
            args_str = ", ".join(f"{k}={v}" for k, v in cmd.args.items())
            print(f"  0x{cmd.offset:04x}: {cmd.name}({args_str})")
        if len(commands) > 15:
            print(f"  ... and {len(commands) - 15} more commands")
