/**
 * CutsceneParser - Binary parsing for CMD and POL files
 * 
 * Parses Flashback cutscene data directly from binary files.
 * Ported from Python parsers in tools/parse_cmd.py and tools/parse_pol.py.
 */

import type { 
  Script, Subscene, Frame, Command, 
  Shape, Primitive, PointPrimitive, EllipsePrimitive, PolygonPrimitive,
  Color 
} from './types'

/** Opcode definitions matching the original engine */
const enum Opcode {
  MARK_CUR_POS = 0,
  REFRESH_SCREEN = 1,
  WAIT_FOR_SYNC = 2,
  DRAW_SHAPE = 3,
  SET_PALETTE = 4,
  MARK_CUR_POS_2 = 5,
  DRAW_CAPTION_TEXT = 6,
  NOP = 7,
  SKIP_3 = 8,
  REFRESH_ALL = 9,
  DRAW_SHAPE_SCALE = 10,
  DRAW_SHAPE_SCALE_ROT = 11,
  COPY_SCREEN = 12,
  DRAW_TEXT_AT_POS = 13,
  HANDLE_KEYS = 14,
}

const OPCODE_NAMES: Record<number, string> = {
  [Opcode.MARK_CUR_POS]: 'markCurPos',
  [Opcode.REFRESH_SCREEN]: 'refreshScreen',
  [Opcode.WAIT_FOR_SYNC]: 'waitForSync',
  [Opcode.DRAW_SHAPE]: 'drawShape',
  [Opcode.SET_PALETTE]: 'setPalette',
  [Opcode.MARK_CUR_POS_2]: 'markCurPos',
  [Opcode.DRAW_CAPTION_TEXT]: 'drawCaptionText',
  [Opcode.NOP]: 'nop',
  [Opcode.SKIP_3]: 'skip3',
  [Opcode.REFRESH_ALL]: 'refreshAll',
  [Opcode.DRAW_SHAPE_SCALE]: 'drawShapeScale',
  [Opcode.DRAW_SHAPE_SCALE_ROT]: 'drawShapeScaleRotate',
  [Opcode.COPY_SCREEN]: 'copyScreen',
  [Opcode.DRAW_TEXT_AT_POS]: 'drawTextAtPos',
  [Opcode.HANDLE_KEYS]: 'handleKeys',
}

/**
 * Binary reader helper class
 */
class BinaryReader {
  private view: DataView
  private data: Uint8Array
  pos: number = 0

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer)
    this.data = new Uint8Array(buffer)
  }

  get length(): number {
    return this.data.length
  }

  readUint8(): number {
    const value = this.data[this.pos]
    this.pos += 1
    return value
  }

  readInt8(): number {
    const value = this.data[this.pos]
    this.pos += 1
    return value < 128 ? value : value - 256
  }

  readBEUint16(): number {
    const value = this.view.getUint16(this.pos, false) // false = big-endian
    this.pos += 2
    return value
  }

  readBEInt16(): number {
    const value = this.view.getInt16(this.pos, false)
    this.pos += 2
    return value
  }

  readBEUint16At(offset: number): number {
    return this.view.getUint16(offset, false)
  }

  readBEInt16At(offset: number): number {
    return this.view.getInt16(offset, false)
  }

  readUint8At(offset: number): number {
    return this.data[offset]
  }

  readInt8At(offset: number): number {
    const value = this.data[offset]
    return value < 128 ? value : value - 256
  }

  seek(offset: number): void {
    this.pos = offset
  }

  eof(): boolean {
    return this.pos >= this.data.length
  }
}

/**
 * Parse a CMD (command) file into a Script object
 */
export function parseCMD(buffer: ArrayBuffer): Script {
  const reader = new BinaryReader(buffer)
  
  // Parse header
  const subCount = reader.readBEUint16()
  const baseOffset = (subCount + 1) * 2
  
  // Read sub-cutscene offsets
  let subOffsets: number[]
  let actualSubCount: number
  
  if (subCount === 0) {
    // Single implicit subscene at offset 0 from base
    subOffsets = [0]
    actualSubCount = 1
  } else {
    subOffsets = []
    for (let i = 0; i < subCount; i++) {
      subOffsets.push(reader.readBEUint16())
    }
    actualSubCount = subCount
  }
  
  // Parse each subscene
  const subscenes: Subscene[] = []
  
  for (let s = 0; s < actualSubCount; s++) {
    reader.seek(baseOffset + subOffsets[s])
    const commands = parseCommands(reader)
    
    // Group commands into frames (separated by markCurPos)
    const frames: Frame[] = []
    let currentFrame: Command[] = []
    
    for (const cmd of commands) {
      if (cmd.op === 'markCurPos' && currentFrame.length > 0) {
        frames.push({ commands: currentFrame })
        currentFrame = []
      }
      currentFrame.push(cmd)
    }
    
    // Don't forget the last frame
    if (currentFrame.length > 0) {
      frames.push({ commands: currentFrame })
    }
    
    subscenes.push({
      id: s,
      offset: subOffsets[s],
      frames
    })
  }
  
  return {
    subsceneCount: actualSubCount,
    baseOffset,
    subscenes
  }
}

/**
 * Parse commands from the current position until end marker
 */
function parseCommands(reader: BinaryReader): Command[] {
  const commands: Command[] = []
  
  while (!reader.eof()) {
    const byte = reader.readUint8()
    
    // Check for end marker
    if (byte & 0x80) {
      break
    }
    
    const opcode = byte >> 2
    if (opcode > 14) {
      console.warn(`Invalid opcode ${opcode}`)
      break
    }
    
    const name = OPCODE_NAMES[opcode] ?? `unknown_${opcode}`
    const cmd: Command = { op: name }
    
    // Parse arguments based on opcode
    switch (opcode) {
      case Opcode.REFRESH_SCREEN:
        cmd.clearMode = reader.readUint8()
        break
        
      case Opcode.WAIT_FOR_SYNC:
        cmd.frames = reader.readUint8()
        break
        
      case Opcode.DRAW_SHAPE: {
        const shapeWord = reader.readBEUint16()
        cmd.shapeId = shapeWord & 0x7FF
        
        if (shapeWord & 0x8000) {
          cmd.x = reader.readBEInt16()
          cmd.y = reader.readBEInt16()
        } else {
          cmd.x = 0
          cmd.y = 0
        }
        break
      }
        
      case Opcode.SET_PALETTE:
        cmd.paletteNum = reader.readUint8()
        cmd.bufferNum = reader.readUint8()
        break
        
      case Opcode.DRAW_CAPTION_TEXT:
        cmd.stringId = reader.readBEUint16()
        break
        
      case Opcode.SKIP_3:
        cmd.skipped = [reader.readUint8(), reader.readUint8(), reader.readUint8()]
        break
        
      case Opcode.DRAW_SHAPE_SCALE: {
        const shapeWord = reader.readBEUint16()
        cmd.shapeId = shapeWord & 0x7FF
        
        if (shapeWord & 0x8000) {
          cmd.x = reader.readBEInt16()
          cmd.y = reader.readBEInt16()
        } else {
          cmd.x = 0
          cmd.y = 0
        }
        
        cmd.zoom = reader.readBEInt16()  // Signed - negative = shrink, positive = grow
        cmd.originX = reader.readUint8()
        cmd.originY = reader.readUint8()
        break
      }
        
      case Opcode.DRAW_SHAPE_SCALE_ROT: {
        const shapeWord = reader.readBEUint16()
        cmd.shapeId = shapeWord & 0x7FF
        
        if (shapeWord & 0x8000) {
          cmd.x = reader.readBEInt16()
          cmd.y = reader.readBEInt16()
        } else {
          cmd.x = 0
          cmd.y = 0
        }
        
        if (shapeWord & 0x4000) {
          cmd.zoom = reader.readBEInt16()  // Signed
        } else {
          cmd.zoom = 0
        }
        
        cmd.originX = reader.readUint8()
        cmd.originY = reader.readUint8()
        
        cmd.rotationA = reader.readBEUint16()
        
        if (shapeWord & 0x2000) {
          cmd.rotationB = reader.readBEUint16()
        } else {
          cmd.rotationB = 180 // Default
        }
        
        if (shapeWord & 0x1000) {
          cmd.rotationC = reader.readBEUint16()
        } else {
          cmd.rotationC = 90 // Default
        }
        break
      }
        
      case Opcode.DRAW_TEXT_AT_POS: {
        const stringId = reader.readBEUint16()
        if (stringId !== 0xFFFF) {
          cmd.stringId = stringId & 0xFFF
          cmd.color = (stringId >> 12) & 0xF
          cmd.x = reader.readInt8() * 8
          cmd.y = reader.readInt8() * 8
        }
        break
      }
        
      case Opcode.HANDLE_KEYS: {
        const handlers: { keyMask: number; target: number }[] = []
        while (true) {
          const keyMask = reader.readUint8()
          if (keyMask === 0xFF) {
            break
          }
          const target = reader.readBEInt16()
          handlers.push({ keyMask, target })
        }
        cmd.handlers = handlers
        break
      }
        
      // Opcodes with no arguments: MARK_CUR_POS, MARK_CUR_POS_2, NOP, REFRESH_ALL, COPY_SCREEN
    }
    
    commands.push(cmd)
  }
  
  return commands
}

/**
 * Parse a POL (polygon) file into shapes and palettes
 */
export function parsePOL(buffer: ArrayBuffer): { shapes: Shape[], palettes: Color[][] } {
  const reader = new BinaryReader(buffer)
  
  if (reader.length < 0x14) {
    throw new Error('POL data too short')
  }
  
  // Parse header
  const shapeOffsetTable = reader.readBEUint16At(0x02)
  const paletteOffset = reader.readBEUint16At(0x06)
  const verticesOffsetTable = reader.readBEUint16At(0x0A)
  const shapeDataTable = reader.readBEUint16At(0x0E)
  const verticesDataTable = reader.readBEUint16At(0x12)
  
  // Calculate counts
  const shapeCount = (paletteOffset - shapeOffsetTable) / 2
  const paletteSize = 16 * 2 // 16 colors * 2 bytes
  const paletteCount = Math.max(1, Math.floor((verticesOffsetTable - paletteOffset) / paletteSize))
  
  // Parse palettes
  const palettes: Color[][] = []
  for (let i = 0; i < paletteCount; i++) {
    const palette: Color[] = []
    const offset = paletteOffset + i * paletteSize
    
    for (let c = 0; c < 16; c++) {
      const colorValue = reader.readBEUint16At(offset + c * 2)
      // Convert 16-bit Amiga color (0x0RGB) to 8-bit RGB
      palette.push({
        r: ((colorValue >> 8) & 0xF) * 17,
        g: ((colorValue >> 4) & 0xF) * 17,
        b: (colorValue & 0xF) * 17
      })
    }
    
    palettes.push(palette)
  }
  
  // Parse shapes
  const shapes: Shape[] = []
  
  for (let shapeIndex = 0; shapeIndex < shapeCount; shapeIndex++) {
    try {
      const shape = parseShape(
        reader, 
        shapeIndex, 
        shapeOffsetTable, 
        shapeDataTable,
        verticesOffsetTable,
        verticesDataTable
      )
      shapes.push(shape)
    } catch (e) {
      console.warn(`Failed to parse shape ${shapeIndex}:`, e)
      break
    }
  }
  
  return { shapes, palettes }
}

/**
 * Parse a single shape with all its primitives
 */
function parseShape(
  reader: BinaryReader,
  shapeIndex: number,
  shapeOffsetTable: number,
  shapeDataTable: number,
  verticesOffsetTable: number,
  verticesDataTable: number
): Shape {
  // Get shape data offset from table
  const tableOffset = shapeOffsetTable + shapeIndex * 2
  const shapeRelOffset = reader.readBEUint16At(tableOffset)
  const shapeOffset = shapeDataTable + shapeRelOffset
  
  // Read primitive count
  const primitiveCount = reader.readBEUint16At(shapeOffset)
  let pos = shapeOffset + 2
  
  const primitives: Primitive[] = []
  
  for (let i = 0; i < primitiveCount; i++) {
    // Read vertex offset word (contains flags in upper bits)
    const vertexOffsetWord = reader.readBEUint16At(pos)
    pos += 2
    
    const hasOffset = (vertexOffsetWord & 0x8000) !== 0
    const hasAlpha = (vertexOffsetWord & 0x4000) !== 0
    const vertexIndex = vertexOffsetWord & 0x3FFF
    
    // Read optional offset
    let offsetX = 0
    let offsetY = 0
    if (hasOffset) {
      offsetX = reader.readBEInt16At(pos)
      offsetY = reader.readBEInt16At(pos + 2)
      pos += 4
    }
    
    // Read color
    const color = reader.readUint8At(pos)
    pos += 1
    
    // Parse vertex data
    const primitive = parseVertices(
      reader,
      vertexIndex,
      verticesOffsetTable,
      verticesDataTable,
      color,
      hasAlpha,
      offsetX,
      offsetY
    )
    
    primitives.push(primitive)
  }
  
  return { id: shapeIndex, primitives }
}

/**
 * Parse vertex data for a primitive
 */
function parseVertices(
  reader: BinaryReader,
  vertexIndex: number,
  verticesOffsetTable: number,
  verticesDataTable: number,
  color: number,
  hasAlpha: boolean,
  offsetX: number,
  offsetY: number
): Primitive {
  // Get vertex data offset from table
  const tableOffset = verticesOffsetTable + vertexIndex * 2
  const vertexRelOffset = reader.readBEUint16At(tableOffset)
  const vertexOffset = verticesDataTable + vertexRelOffset
  
  const numVertices = reader.readUint8At(vertexOffset)
  let pos = vertexOffset + 1
  
  const baseProps = {
    color,
    hasAlpha,
    ...(offsetX !== 0 || offsetY !== 0 ? { offsetX, offsetY } : {})
  }
  
  if (numVertices === 0) {
    // Point primitive
    const x = reader.readBEInt16At(pos)
    const y = reader.readBEInt16At(pos + 2)
    
    return {
      type: 'point',
      ...baseProps,
      x,
      y
    } as PointPrimitive
  }
  
  if (numVertices & 0x80) {
    // Ellipse primitive
    const cx = reader.readBEInt16At(pos)
    const cy = reader.readBEInt16At(pos + 2)
    const rx = reader.readBEInt16At(pos + 4)
    const ry = reader.readBEInt16At(pos + 6)
    
    return {
      type: 'ellipse',
      ...baseProps,
      cx,
      cy,
      rx,
      ry
    } as EllipsePrimitive
  }
  
  // Polygon primitive
  // First vertex is absolute
  let ix = reader.readBEInt16At(pos)
  let iy = reader.readBEInt16At(pos + 2)
  pos += 4
  
  const vertices: [number, number][] = [[ix, iy]]
  
  // Remaining vertices are deltas
  // Loop numVertices times (from C++ code: n = numVertices - 1; for (; n >= 0; --n))
  for (let n = 0; n < numVertices; n++) {
    const dx = reader.readInt8At(pos)
    const dy = reader.readInt8At(pos + 1)
    pos += 2
    ix += dx
    iy += dy
    vertices.push([ix, iy])
  }
  
  return {
    type: 'polygon',
    ...baseProps,
    vertices
  } as PolygonPrimitive
}
