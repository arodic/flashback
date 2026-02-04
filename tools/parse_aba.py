"""
ABA Archive parser for Flashback game data.

ABA files are simple archives containing multiple compressed files.
Each entry has a 30-byte header with name, offset, sizes, and a tag.
"""

import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Iterator

from bytekiller import unpack as bytekiller_unpack, is_compressed


# Magic tag that marks valid ABA entries
ABA_TAG = 0x442E4D2E  # "D.M." in ASCII (Delphine Multimedia)


@dataclass
class ABAEntry:
    """Represents a single file entry in an ABA archive."""
    name: str
    offset: int
    compressed_size: int
    uncompressed_size: int
    file_index: int = 0  # For multi-file archives
    
    @property
    def is_compressed(self) -> bool:
        return self.compressed_size != self.uncompressed_size


class ABAArchive:
    """
    Reader for ABA archive files.
    
    Usage:
        archive = ABAArchive("DEMO_UK.ABA")
        data = archive.extract("LOGOS.POL")
    """
    
    def __init__(self, *paths: str):
        """
        Open one or more ABA archive files.
        
        Args:
            *paths: Path(s) to ABA archive file(s)
        """
        self.entries: Dict[str, ABAEntry] = {}
        self._files: List[Path] = []
        self._handles: List[any] = []
        
        for path in paths:
            self._load_archive(path)
    
    def _load_archive(self, path: str) -> None:
        """Load entries from an ABA archive file."""
        file_path = Path(path)
        file_index = len(self._files)
        self._files.append(file_path)
        
        with open(file_path, 'rb') as f:
            # Read header
            entry_count = struct.unpack('>H', f.read(2))[0]
            entry_size = struct.unpack('>H', f.read(2))[0]
            
            if entry_size != 30:
                raise ValueError(f"Unexpected entry size {entry_size}, expected 30")
            
            # Read all entries
            for i in range(entry_count):
                # Entry format: name[14] + offset[4] + compressed[4] + size[4] + tag[4]
                raw_name = f.read(14)
                offset = struct.unpack('>I', f.read(4))[0]
                compressed_size = struct.unpack('>I', f.read(4))[0]
                uncompressed_size = struct.unpack('>I', f.read(4))[0]
                tag = struct.unpack('>I', f.read(4))[0]
                
                # Parse name (null-terminated)
                null_pos = raw_name.find(b'\x00')
                if null_pos > 0:
                    name = raw_name[:null_pos].decode('ascii')
                else:
                    name = raw_name.decode('ascii').rstrip()
                
                # Validate tag
                if tag != ABA_TAG:
                    print(f"Warning: Entry '{name}' has unexpected tag 0x{tag:08x}")
                
                entry = ABAEntry(
                    name=name,
                    offset=offset,
                    compressed_size=compressed_size,
                    uncompressed_size=uncompressed_size,
                    file_index=file_index
                )
                
                self.entries[name.upper()] = entry
    
    def list_entries(self, pattern: Optional[str] = None) -> List[ABAEntry]:
        """
        List all entries, optionally filtered by extension.
        
        Args:
            pattern: Optional file extension filter (e.g., ".POL", ".CMD")
            
        Returns:
            List of matching entries
        """
        entries = list(self.entries.values())
        
        if pattern:
            pattern = pattern.upper()
            entries = [e for e in entries if e.name.upper().endswith(pattern)]
        
        return sorted(entries, key=lambda e: e.name)
    
    def extract(self, name: str) -> bytes:
        """
        Extract a file from the archive.
        
        Args:
            name: Filename to extract (case-insensitive)
            
        Returns:
            Decompressed file contents
            
        Raises:
            KeyError: If file not found in archive
        """
        entry = self.entries.get(name.upper())
        if not entry:
            raise KeyError(f"File '{name}' not found in archive")
        
        file_path = self._files[entry.file_index]
        
        with open(file_path, 'rb') as f:
            f.seek(entry.offset)
            compressed_data = f.read(entry.compressed_size)
        
        if entry.is_compressed:
            return bytekiller_unpack(compressed_data)
        else:
            return compressed_data
    
    def extract_all(self, pattern: Optional[str] = None) -> Iterator[tuple]:
        """
        Extract all files matching a pattern.
        
        Args:
            pattern: Optional file extension filter
            
        Yields:
            Tuples of (name, data)
        """
        for entry in self.list_entries(pattern):
            try:
                data = self.extract(entry.name)
                yield entry.name, data
            except Exception as e:
                print(f"Warning: Failed to extract {entry.name}: {e}")
    
    def get_cutscene_files(self) -> Dict[str, Dict[str, bytes]]:
        """
        Extract all cutscene-related files (CMD and POL pairs).
        
        Returns:
            Dict mapping cutscene name to {"cmd": bytes, "pol": bytes}
        """
        cutscenes: Dict[str, Dict[str, bytes]] = {}
        
        # Find all CMD files
        for entry in self.list_entries(".CMD"):
            base_name = entry.name[:-4]  # Remove .CMD extension
            pol_name = base_name + ".POL"
            
            cutscene = {"cmd": None, "pol": None}
            
            try:
                cutscene["cmd"] = self.extract(entry.name)
            except Exception as e:
                print(f"Warning: Failed to extract {entry.name}: {e}")
                continue
            
            if pol_name.upper() in self.entries:
                try:
                    cutscene["pol"] = self.extract(pol_name)
                except Exception as e:
                    print(f"Warning: Failed to extract {pol_name}: {e}")
            
            if cutscene["cmd"] and cutscene["pol"]:
                cutscenes[base_name] = cutscene
        
        return cutscenes
    
    def __contains__(self, name: str) -> bool:
        return name.upper() in self.entries
    
    def __len__(self) -> int:
        return len(self.entries)


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python parse_aba.py <archive.aba> [pattern]")
        sys.exit(1)
    
    archive = ABAArchive(sys.argv[1])
    pattern = sys.argv[2] if len(sys.argv) > 2 else None
    
    print(f"Archive contains {len(archive)} entries")
    print()
    
    entries = archive.list_entries(pattern)
    
    # Group by extension
    by_ext: Dict[str, List[ABAEntry]] = {}
    for entry in entries:
        ext = Path(entry.name).suffix.upper() or "(no ext)"
        by_ext.setdefault(ext, []).append(entry)
    
    for ext in sorted(by_ext.keys()):
        print(f"{ext}:")
        for entry in by_ext[ext]:
            comp = "compressed" if entry.is_compressed else "raw"
            ratio = entry.compressed_size / entry.uncompressed_size * 100
            print(f"  {entry.name:20s}  {entry.uncompressed_size:6d} bytes ({comp}, {ratio:.0f}%)")
        print()
