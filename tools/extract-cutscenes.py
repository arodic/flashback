#!/usr/bin/env python3
"""
Flashback Cutscene Extraction Tool

Extracts cutscene data from ABA archives OR separate CMD/POL files,
and converts to JSON format for use with the Three.js cutscene viewer.

Usage:
    # From ABA archive:
    python extract-cutscenes.py archive.aba [output_dir]
    
    # From directory with separate CMD/POL files:
    python extract-cutscenes.py --dir DATA/ [output_dir]
    
Examples:
    python extract-cutscenes.py DATA/DEMO_UK.ABA public/data
    python extract-cutscenes.py --dir DATA/ public/data
    python extract-cutscenes.py --dir DATA/ public/data -c INTRO1
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, Optional

# Add tools directory to path
sys.path.insert(0, str(Path(__file__).parent))

from parse_pol import POLParser
from parse_cmd import CMDParser
from bytekiller import unpack as bytekiller_unpack, is_compressed


def extract_cutscene(name: str, cmd_data: bytes, pol_data: bytes) -> dict:
    """
    Extract a single cutscene to a combined JSON structure.
    
    Args:
        name: Cutscene name (e.g., "LOGOS")
        cmd_data: Raw CMD file data
        pol_data: Raw POL file data
        
    Returns:
        Combined cutscene data dictionary
    """
    # Parse POL (shapes and palettes)
    pol_parser = POLParser(pol_data)
    pol_result = pol_parser.parse_all()
    
    # Parse CMD (commands/script)
    cmd_parser = CMDParser(cmd_data)
    cmd_result = cmd_parser.parse_all()
    
    # Combine into single structure
    return {
        "name": name,
        "shapes": pol_result["shapes"],
        "palettes": pol_result["palettes"],
        "script": cmd_result
    }


def load_file_with_decompression(path: Path) -> bytes:
    """
    Load a file, decompressing if necessary.
    
    Args:
        path: Path to the file
        
    Returns:
        File contents (decompressed if needed)
    """
    with open(path, 'rb') as f:
        data = f.read()
    
    # Check if data is Bytekiller compressed
    if is_compressed(data):
        try:
            return bytekiller_unpack(data)
        except Exception:
            # Not actually compressed, return as-is
            pass
    
    return data


def get_cutscenes_from_directory(data_dir: Path) -> Dict[str, Dict[str, bytes]]:
    """
    Find and load all cutscene CMD/POL pairs from a directory.
    
    Args:
        data_dir: Path to directory containing CMD and POL files
        
    Returns:
        Dict mapping cutscene name to {"cmd": bytes, "pol": bytes}
    """
    cutscenes: Dict[str, Dict[str, bytes]] = {}
    
    # Find all CMD files
    cmd_files = list(data_dir.glob("*.CMD")) + list(data_dir.glob("*.cmd"))
    
    for cmd_path in cmd_files:
        base_name = cmd_path.stem.upper()
        
        # Look for matching POL file (case-insensitive)
        pol_path = None
        for ext in [".POL", ".pol"]:
            candidate = cmd_path.parent / (cmd_path.stem + ext)
            if candidate.exists():
                pol_path = candidate
                break
        
        if not pol_path:
            print(f"Warning: No POL file found for {cmd_path.name}, skipping")
            continue
        
        try:
            cmd_data = load_file_with_decompression(cmd_path)
            pol_data = load_file_with_decompression(pol_path)
            cutscenes[base_name] = {"cmd": cmd_data, "pol": pol_data}
        except Exception as e:
            print(f"Warning: Failed to load {base_name}: {e}")
    
    return cutscenes


def get_cutscenes_from_archive(archive_path: Path) -> Dict[str, Dict[str, bytes]]:
    """
    Extract all cutscene CMD/POL pairs from an ABA archive.
    
    Args:
        archive_path: Path to ABA archive file
        
    Returns:
        Dict mapping cutscene name to {"cmd": bytes, "pol": bytes}
    """
    from parse_aba import ABAArchive
    
    archive = ABAArchive(str(archive_path))
    print(f"Found {len(archive)} entries in archive")
    return archive.get_cutscene_files()


def main():
    parser = argparse.ArgumentParser(
        description="Extract Flashback cutscene data from ABA archives or directories"
    )
    
    # Source option - either archive path or directory with --dir flag
    parser.add_argument(
        "archive",
        nargs="?",
        help="Path to ABA archive file (or use --dir for directory mode)"
    )
    parser.add_argument(
        "--dir", "-d",
        dest="data_dir",
        help="Path to directory containing CMD/POL files (alternative to archive)"
    )
    
    parser.add_argument(
        "--output", "-o",
        dest="output_dir",
        default="public/data",
        help="Output directory for JSON files (default: public/data)"
    )
    parser.add_argument(
        "--cutscene", "-c",
        help="Extract only specified cutscene (e.g., INTRO1)"
    )
    parser.add_argument(
        "--list", "-l",
        action="store_true",
        help="List available cutscenes and exit"
    )
    parser.add_argument(
        "--combined", "-C",
        action="store_true",
        help="Output single combined JSON file instead of separate files"
    )
    parser.add_argument(
        "--pretty", "-p",
        action="store_true",
        help="Pretty-print JSON output"
    )
    
    args = parser.parse_args()
    
    # Validate source arguments
    if not args.data_dir and not args.archive:
        parser.error("Either provide an archive path or use --dir to specify a directory")
    
    if args.data_dir and args.archive:
        parser.error("Cannot use both archive path and --dir option")
    
    # Determine source and load cutscenes
    if args.data_dir:
        data_dir = Path(args.data_dir)
        if not data_dir.is_dir():
            print(f"Error: Directory not found: {data_dir}")
            sys.exit(1)
        
        print(f"Loading cutscenes from directory: {data_dir}")
        cutscenes = get_cutscenes_from_directory(data_dir)
    else:
        archive_path = Path(args.archive)
        if not archive_path.exists():
            print(f"Error: Archive not found: {archive_path}")
            sys.exit(1)
        
        print(f"Loading archive: {archive_path}")
        cutscenes = get_cutscenes_from_archive(archive_path)
    
    print(f"Found {len(cutscenes)} cutscene(s)")
    
    if args.list:
        print(f"\nAvailable cutscenes ({len(cutscenes)}):")
        for name in sorted(cutscenes.keys()):
            cmd_size = len(cutscenes[name]["cmd"])
            pol_size = len(cutscenes[name]["pol"])
            print(f"  {name:15s}  CMD: {cmd_size:6d} bytes, POL: {pol_size:6d} bytes")
        return
    
    # Filter to specific cutscene if requested
    if args.cutscene:
        name = args.cutscene.upper()
        if name not in cutscenes:
            print(f"Error: Cutscene '{name}' not found")
            print(f"Available: {', '.join(sorted(cutscenes.keys()))}")
            sys.exit(1)
        cutscenes = {name: cutscenes[name]}
    
    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    indent = 2 if args.pretty else None
    all_cutscenes = []
    
    # Extract each cutscene
    for name in sorted(cutscenes.keys()):
        print(f"\nExtracting {name}...")
        
        try:
            data = cutscenes[name]
            cutscene = extract_cutscene(name, data["cmd"], data["pol"])
            
            # Count elements
            shape_count = len(cutscene["shapes"])
            palette_count = len(cutscene["palettes"])
            frame_count = sum(
                len(sub["frames"]) 
                for sub in cutscene["script"]["subscenes"]
            )
            
            print(f"  Shapes: {shape_count}")
            print(f"  Palettes: {palette_count}")
            print(f"  Frames: {frame_count}")
            
            if args.combined:
                all_cutscenes.append(cutscene)
            else:
                # Write individual JSON file
                output_file = output_dir / f"{name.lower()}.json"
                with open(output_file, 'w') as f:
                    json.dump(cutscene, f, indent=indent)
                print(f"  Written to: {output_file}")
        
        except Exception as e:
            print(f"  Error: {e}")
            import traceback
            traceback.print_exc()
    
    # Write combined file if requested
    if args.combined:
        output_file = output_dir / "all_cutscenes.json"
        combined = {
            "cutscenes": all_cutscenes
        }
        with open(output_file, 'w') as f:
            json.dump(combined, f, indent=indent)
        print(f"\nWritten combined file: {output_file}")
    
    print(f"\nDone! Extracted {len(cutscenes)} cutscene(s)")


if __name__ == "__main__":
    main()
