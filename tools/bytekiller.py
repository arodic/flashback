"""
Bytekiller decompression algorithm.
Used by Delphine Software games (Flashback, Another World) for data compression.

The algorithm reads from the END of the compressed buffer backwards,
using a bit stream to control copy operations.
"""

import struct
from typing import Union


def read_be_uint32(data: bytes, offset: int) -> int:
    """Read a big-endian 32-bit unsigned integer."""
    return struct.unpack('>I', data[offset:offset + 4])[0]


def unpack(src: bytes) -> bytes:
    """
    Decompress Bytekiller-compressed data.
    
    Args:
        src: Compressed data bytes
        
    Returns:
        Decompressed data bytes
        
    Raises:
        ValueError: If decompression fails or CRC check fails
    """
    if len(src) < 12:
        raise ValueError("Data too short to be Bytekiller compressed")
    
    # Read header from END of buffer
    src_pos = len(src) - 4
    size = read_be_uint32(src, src_pos)
    src_pos -= 4
    crc = read_be_uint32(src, src_pos)
    src_pos -= 4
    bits = read_be_uint32(src, src_pos)
    src_pos -= 4
    crc ^= bits
    
    # Allocate output buffer
    dst = bytearray(size)
    dst_pos = size - 1
    
    def next_bit() -> int:
        """Get next bit from the bit stream."""
        nonlocal bits, src_pos, crc
        bit = bits & 1
        bits >>= 1
        if bits == 0:
            # Refill bits from source
            bits = read_be_uint32(src, src_pos)
            src_pos -= 4
            crc ^= bits
            bit = bits & 1
            bits = (1 << 31) | (bits >> 1)
        return bit
    
    def get_bits(count: int) -> int:
        """Get multiple bits from the bit stream (MSB first)."""
        result = 0
        for _ in range(count):
            result = (result << 1) | next_bit()
        return result
    
    def copy_literal(length: int) -> None:
        """Copy literal bytes from bit stream to output."""
        nonlocal dst_pos, size
        size -= length
        if size < 0:
            length += size
            size = 0
        for _ in range(length):
            if dst_pos < 0:
                break
            dst[dst_pos] = get_bits(8)
            dst_pos -= 1
    
    def copy_reference(length: int, offset: int) -> None:
        """Copy bytes from earlier in output (LZ77 back-reference)."""
        nonlocal dst_pos, size
        size -= length
        if size < 0:
            length += size
            size = 0
        for _ in range(length):
            if dst_pos < 0:
                break
            dst[dst_pos] = dst[dst_pos + offset]
            dst_pos -= 1
    
    # Main decompression loop
    while size > 0:
        if not next_bit():
            if not next_bit():
                # 00: Copy 1-8 literal bytes
                copy_literal(get_bits(3) + 1)
            else:
                # 01: Copy 2 bytes from offset (8-bit)
                copy_reference(2, get_bits(8))
        else:
            code = get_bits(2)
            if code == 3:
                # 111: Copy 9-264 literal bytes
                copy_literal(get_bits(8) + 9)
            elif code == 2:
                # 110: Copy N bytes from offset (12-bit)
                length = get_bits(8) + 1
                copy_reference(length, get_bits(12))
            elif code == 1:
                # 101: Copy 4 bytes from offset (10-bit)
                copy_reference(4, get_bits(10))
            else:
                # 100: Copy 3 bytes from offset (9-bit)
                copy_reference(3, get_bits(9))
    
    # Verify CRC
    if crc != 0:
        raise ValueError(f"CRC check failed (residual: 0x{crc:08x})")
    
    return bytes(dst)


def is_compressed(data: bytes) -> bool:
    """
    Check if data appears to be Bytekiller compressed.
    
    Args:
        data: Raw data bytes
        
    Returns:
        True if data appears to be compressed
    """
    if len(data) < 12:
        return False
    
    # Check if the size field at the end is reasonable
    size = read_be_uint32(data, len(data) - 4)
    
    # Decompressed size should be larger than compressed and reasonable
    return size > len(data) and size < len(data) * 20


if __name__ == "__main__":
    # Simple test
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python bytekiller.py <compressed_file>")
        sys.exit(1)
    
    with open(sys.argv[1], 'rb') as f:
        data = f.read()
    
    try:
        decompressed = unpack(data)
        print(f"Decompressed {len(data)} -> {len(decompressed)} bytes")
        
        if len(sys.argv) > 2:
            with open(sys.argv[2], 'wb') as f:
                f.write(decompressed)
            print(f"Written to {sys.argv[2]}")
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)
