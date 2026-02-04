#!/usr/bin/env python3
"""
Image comparison script for verifying cutscene rendering.

Compares two images and outputs the pixel difference percentage.
Optionally generates a visual diff image.

Usage:
    python compare.py <reference.png> <output.png> [--diff diff.png] [--threshold 5]
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageChops, ImageDraw
except ImportError:
    print("Error: Pillow library required. Install with: pip install Pillow")
    sys.exit(1)


def compare_images(ref_path: str, out_path: str, threshold: float = 5.0) -> tuple:
    """
    Compare two images and return similarity metrics.
    
    Args:
        ref_path: Path to reference image
        out_path: Path to output image to compare
        threshold: Acceptable difference percentage
        
    Returns:
        Tuple of (match: bool, diff_percent: float, diff_image: Image)
    """
    # Load images
    ref_img = Image.open(ref_path).convert('RGB')
    out_img = Image.open(out_path).convert('RGB')
    
    # Check dimensions
    if ref_img.size != out_img.size:
        print(f"Warning: Image sizes differ!")
        print(f"  Reference: {ref_img.size}")
        print(f"  Output:    {out_img.size}")
        
        # Resize output to match reference for comparison
        out_img = out_img.resize(ref_img.size, Image.Resampling.NEAREST)
    
    # Calculate pixel-by-pixel difference
    diff = ImageChops.difference(ref_img, out_img)
    
    # Count differing pixels
    diff_pixels = 0
    total_pixels = ref_img.width * ref_img.height
    
    diff_data = diff.getdata()
    for pixel in diff_data:
        # If any channel differs significantly (> 16 out of 255)
        if any(c > 16 for c in pixel):
            diff_pixels += 1
    
    diff_percent = (diff_pixels / total_pixels) * 100
    match = diff_percent <= threshold
    
    # Create visual diff (highlight differences in red)
    diff_visual = ref_img.copy()
    diff_draw = ImageDraw.Draw(diff_visual)
    
    for y in range(ref_img.height):
        for x in range(ref_img.width):
            ref_pixel = ref_img.getpixel((x, y))
            out_pixel = out_img.getpixel((x, y))
            
            # Check if pixels differ
            if any(abs(r - o) > 16 for r, o in zip(ref_pixel, out_pixel)):
                diff_draw.point((x, y), fill=(255, 0, 0))
    
    return match, diff_percent, diff_visual


def main():
    parser = argparse.ArgumentParser(description="Compare cutscene renders")
    parser.add_argument("reference", help="Path to reference image")
    parser.add_argument("output", help="Path to output image")
    parser.add_argument("--diff", "-d", help="Path to save diff image")
    parser.add_argument(
        "--threshold", "-t", 
        type=float, 
        default=5.0,
        help="Acceptable difference percentage (default: 5.0)"
    )
    
    args = parser.parse_args()
    
    # Validate paths
    ref_path = Path(args.reference)
    out_path = Path(args.output)
    
    if not ref_path.exists():
        print(f"Error: Reference image not found: {ref_path}")
        sys.exit(1)
    
    if not out_path.exists():
        print(f"Error: Output image not found: {out_path}")
        sys.exit(1)
    
    # Compare
    print(f"Comparing:")
    print(f"  Reference: {ref_path}")
    print(f"  Output:    {out_path}")
    print()
    
    match, diff_percent, diff_image = compare_images(
        str(ref_path), 
        str(out_path),
        args.threshold
    )
    
    # Output results
    status = "✓ PASS" if match else "✗ FAIL"
    print(f"Result: {status}")
    print(f"Difference: {diff_percent:.2f}%")
    print(f"Threshold:  {args.threshold:.2f}%")
    
    # Save diff image if requested
    if args.diff:
        diff_path = Path(args.diff)
        diff_path.parent.mkdir(parents=True, exist_ok=True)
        diff_image.save(diff_path)
        print(f"\nDiff image saved: {diff_path}")
    
    # Exit code based on match
    sys.exit(0 if match else 1)


if __name__ == "__main__":
    main()
