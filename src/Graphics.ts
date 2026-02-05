/**
 * Graphics - Low-level pixel operations for cutscene rendering
 * 
 * Implements pixel-perfect rendering algorithms matching the reference engine:
 * - Bresenham line drawing
 * - Scanline polygon filling
 * - Ellipse rendering
 * - Direct pixel manipulation
 */

import type { Color } from './types'

export interface Point {
  x: number
  y: number
}

export class Graphics {
  private imageData: ImageData
  private pixels: Uint8ClampedArray
  private width: number
  private height: number
  
  // Clipping rectangle (relative to layer)
  private crx: number = 0
  private cry: number = 0
  private crw: number = 0
  private crh: number = 0
  
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.imageData = new ImageData(width, height)
    this.pixels = this.imageData.data
    this.crw = width
    this.crh = height
  }
  
  getImageData(): ImageData {
    return this.imageData
  }
  
  getWidth(): number {
    return this.width
  }
  
  getHeight(): number {
    return this.height
  }
  
  setClippingRect(rx: number, ry: number, rw: number, rh: number): void {
    this.crx = rx
    this.cry = ry
    this.crw = rw
    this.crh = rh
  }
  
  clear(color: Color): void {
    for (let i = 0; i < this.pixels.length; i += 4) {
      this.pixels[i] = color.r
      this.pixels[i + 1] = color.g
      this.pixels[i + 2] = color.b
      this.pixels[i + 3] = 255
    }
  }
  
  /**
   * Set a single pixel with bounds checking.
   * Coordinates are relative to clipping rect origin.
   */
  drawPoint(color: Color, x: number, y: number): void {
    if (x >= 0 && x < this.crw && y >= 0 && y < this.crh) {
      const px = x + this.crx
      const py = y + this.cry
      if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
        const idx = (py * this.width + px) * 4
        this.pixels[idx] = color.r
        this.pixels[idx + 1] = color.g
        this.pixels[idx + 2] = color.b
        this.pixels[idx + 3] = 255
      }
    }
  }
  
  /**
   * Get pixel color at coordinates.
   */
  getPixel(x: number, y: number): Color {
    const px = x + this.crx
    const py = y + this.cry
    if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
      const idx = (py * this.width + px) * 4
      return {
        r: this.pixels[idx],
        g: this.pixels[idx + 1],
        b: this.pixels[idx + 2]
      }
    }
    return { r: 0, g: 0, b: 0 }
  }
  
  /**
   * Draw a line using Bresenham's algorithm.
   * Matches reference engine's drawLine() exactly.
   */
  drawLine(color: Color, x1: number, y1: number, x2: number, y2: number): void {
    let dxincr1 = 1
    let dyincr1 = 1
    let dx = x2 - x1
    if (dx < 0) {
      dxincr1 = -1
      dx = -dx
    }
    let dy = y2 - y1
    if (dy < 0) {
      dyincr1 = -1
      dy = -dy
    }
    
    let dxincr2: number
    let dyincr2: number
    let delta1: number
    let delta2: number
    
    if (dx < dy) {
      dxincr2 = 0
      dyincr2 = 1
      delta1 = dx
      delta2 = dy
      if (dyincr1 < 0) {
        dyincr2 = -1
      }
    } else {
      dxincr2 = 1
      dyincr2 = 0
      delta1 = dy
      delta2 = dx
      if (dxincr1 < 0) {
        dxincr2 = -1
      }
    }
    
    let px = x1
    let py = y1
    const octincr1 = delta1 * 2 - delta2 * 2
    const octincr2 = delta1 * 2
    let oct = delta1 * 2 - delta2
    
    if (delta2 >= 0) {
      this.drawPoint(color, px, py)
      while (--delta2 >= 0) {
        if (oct >= 0) {
          px += dxincr1
          py += dyincr1
          oct += octincr1
        } else {
          px += dxincr2
          py += dyincr2
          oct += octincr2
        }
        this.drawPoint(color, px, py)
      }
    }
  }
  
  /**
   * Draw a filled polygon using scanline algorithm.
   * Uses fixed-point integer math to match reference engine.
   */
  drawPolygon(color: Color, hasAlpha: boolean, vertices: Point[]): void {
    const numPts = vertices.length
    if (numPts < 2) return
    
    // 2 vertices = line
    if (numPts === 2) {
      this.drawLine(color, vertices[0].x, vertices[0].y, vertices[1].x, vertices[1].y)
      return
    }
    
    // Find bounding box and top vertex (minimum y)
    let xmin = vertices[0].x
    let xmax = vertices[0].x
    let ymin = vertices[0].y
    let ymax = vertices[0].y
    let topIdx = 0
    
    for (let i = 1; i < numPts; i++) {
      const x = vertices[i].x
      const y = vertices[i].y
      if (x < xmin) xmin = x
      if (x > xmax) xmax = x
      if (y < ymin) {
        ymin = y
        topIdx = i
      }
      if (y > ymax) ymax = y
    }
    
    // Early rejection
    if (xmax < 0 || xmin >= this.crw || ymax < 0 || ymin >= this.crh) {
      return
    }
    
    // Horizontal line (all same y)
    if (ymax === ymin) {
      this.drawHorizontalSpan(color, hasAlpha, ymin, Math.max(0, xmin), Math.min(this.crw - 1, xmax))
      return
    }
    
    // Walk down left and right edges from top vertex
    // Using 16.16 fixed point for x coordinates
    const FIXED_SHIFT = 16
    const FIXED_HALF = 1 << (FIXED_SHIFT - 1)
    
    // Left edge walks backwards, right edge walks forwards
    let leftIdx = topIdx
    let rightIdx = topIdx
    
    // Get next vertex going left (backwards)
    const prevIdx = (i: number) => (i === 0 ? numPts - 1 : i - 1)
    // Get next vertex going right (forwards)
    const nextIdx = (i: number) => (i === numPts - 1 ? 0 : i + 1)
    
    let leftX = vertices[leftIdx].x << FIXED_SHIFT
    let rightX = vertices[rightIdx].x << FIXED_SHIFT
    let leftDx = 0
    let rightDx = 0
    let leftEndY = vertices[leftIdx].y
    let rightEndY = vertices[rightIdx].y
    
    // Calculate step for left edge (matches reference calcPolyStep1)
    const calcPolyStep1 = (dx: number, dy: number): number => {
      if (dy === 0) return 0
      let a = dx * 256  // 8.8 format
      if (Math.abs(a >> 16) < dy) {
        // Normal case: result fits in 16 bits
        const div = Math.trunc(a / dy) | 0
        const truncated = (div << 16) >> 16  // Simulate int16_t cast
        a = truncated * 256
      } else {
        // Large result: mask to 16 bits
        a = (Math.trunc(Math.trunc(a / 256) / dy) & 0xFFFF) << 16
      }
      return a
    }
    
    // Calculate step for right edge (matches reference calcPolyStep2)
    const calcPolyStep2 = (dx: number, dy: number): number => {
      if (dy === 0) return 0
      let a = dx * 256  // 8.8 format
      if (Math.abs(a >> 16) < dy) {
        // Normal case: result fits in 16 bits
        const div = Math.trunc(a / dy) | 0
        const truncated = (div << 16) >> 16  // Simulate int16_t cast
        a = truncated * 256
      } else {
        // Large result: left shift (preserves sign differently than mask)
        a = Math.trunc(Math.trunc(a / 256) / dy) << 16
      }
      return a
    }
    
    // Advance to next edges
    const advanceLeftEdge = () => {
      const fromIdx = leftIdx
      leftIdx = prevIdx(leftIdx)
      const fromY = vertices[fromIdx].y
      const toY = vertices[leftIdx].y
      leftEndY = toY
      if (toY > fromY) {
        const fromX = vertices[fromIdx].x
        const toX = vertices[leftIdx].x
        const dy = toY - fromY
        const dx = toX - fromX
        leftX = fromX << FIXED_SHIFT
        leftDx = calcPolyStep1(dx, dy)
      }
    }
    
    const advanceRightEdge = () => {
      const fromIdx = rightIdx
      rightIdx = nextIdx(rightIdx)
      const fromY = vertices[fromIdx].y
      const toY = vertices[rightIdx].y
      rightEndY = toY
      if (toY > fromY) {
        const fromX = vertices[fromIdx].x
        const toX = vertices[rightIdx].x
        const dy = toY - fromY
        const dx = toX - fromX
        rightX = fromX << FIXED_SHIFT
        rightDx = calcPolyStep2(dx, dy)
      }
    }
    
    // Initialize first edges
    advanceLeftEdge()
    advanceRightEdge()
    
    // Clamp scanline range
    const startY = Math.max(0, ymin)
    const endY = Math.min(this.crh - 1, ymax)
    
    // Skip rows above screen
    if (ymin < 0) {
      const skip = -ymin
      leftX += leftDx * skip
      rightX += rightDx * skip
    }
    
    for (let y = startY; y <= endY; y++) {
      // Advance edges if we've reached their end
      while (y >= leftEndY && leftIdx !== rightIdx) {
        advanceLeftEdge()
      }
      while (y >= rightEndY && leftIdx !== rightIdx) {
        advanceRightEdge()
      }
      
      // Convert fixed-point to integer with rounding
      let x1 = (leftX + FIXED_HALF) >> FIXED_SHIFT
      let x2 = (rightX + FIXED_HALF) >> FIXED_SHIFT
      
      // Ensure x1 <= x2
      if (x1 > x2) {
        const tmp = x1; x1 = x2; x2 = tmp
      }
      
      // Clamp to screen
      x1 = Math.max(0, x1)
      x2 = Math.min(this.crw - 1, x2)
      
      if (x1 <= x2) {
        this.drawHorizontalSpan(color, hasAlpha, y, x1, x2)
      }
      
      // Step along edges
      leftX += leftDx
      rightX += rightDx
    }
  }
  
  /**
   * Draw a horizontal span (used by polygon and ellipse filling).
   */
  private drawHorizontalSpan(color: Color, hasAlpha: boolean, y: number, x1: number, x2: number): void {
    if (y < 0 || y >= this.crh) return
    
    const py = y + this.cry
    if (py < 0 || py >= this.height) return
    
    const startX = Math.max(0, x1)
    const endX = Math.min(this.crw - 1, x2)
    
    for (let x = startX; x <= endX; x++) {
      const px = x + this.crx
      if (px >= 0 && px < this.width) {
        const idx = (py * this.width + px) * 4
        
        if (hasAlpha) {
          // Alpha blending (50% blend)
          this.pixels[idx] = (this.pixels[idx] + color.r) >> 1
          this.pixels[idx + 1] = (this.pixels[idx + 1] + color.g) >> 1
          this.pixels[idx + 2] = (this.pixels[idx + 2] + color.b) >> 1
        } else {
          this.pixels[idx] = color.r
          this.pixels[idx + 1] = color.g
          this.pixels[idx + 2] = color.b
        }
        this.pixels[idx + 3] = 255
      }
    }
  }
  
  /**
   * Draw a filled ellipse.
   * Uses midpoint ellipse algorithm for outline, then scanline fill.
   */
  drawEllipse(color: Color, hasAlpha: boolean, cx: number, cy: number, rx: number, ry: number): void {
    if (rx <= 0 || ry <= 0) {
      this.drawPoint(color, cx, cy)
      return
    }
    
    // Collect horizontal spans for each y
    const spans: Map<number, { x1: number; x2: number }> = new Map()
    
    const addSpan = (y: number, x1: number, x2: number) => {
      if (y < 0 || y >= this.crh) return
      const existing = spans.get(y)
      if (existing) {
        existing.x1 = Math.min(existing.x1, x1)
        existing.x2 = Math.max(existing.x2, x2)
      } else {
        spans.set(y, { x1, x2 })
      }
    }
    
    // Midpoint ellipse algorithm
    let x = 0
    let y = ry
    
    const rxSq = rx * rx
    const rySq = ry * ry
    const twoRxSq = 2 * rxSq
    const twoRySq = 2 * rySq
    
    let px = 0
    let py = twoRxSq * y
    
    // Region 1
    let p = Math.round(rySq - rxSq * ry + 0.25 * rxSq)
    
    while (px < py) {
      const x1 = cx - x
      const x2 = cx + x
      addSpan(cy + y, x1, x2)
      addSpan(cy - y, x1, x2)
      
      x++
      px += twoRySq
      
      if (p < 0) {
        p += rySq + px
      } else {
        y--
        py -= twoRxSq
        p += rySq + px - py
      }
    }
    
    // Region 2
    p = Math.round(rySq * (x + 0.5) * (x + 0.5) + rxSq * (y - 1) * (y - 1) - rxSq * rySq)
    
    while (y >= 0) {
      const x1 = cx - x
      const x2 = cx + x
      addSpan(cy + y, x1, x2)
      addSpan(cy - y, x1, x2)
      
      y--
      py -= twoRxSq
      
      if (p > 0) {
        p += rxSq - py
      } else {
        x++
        px += twoRySq
        p += rxSq - py + px
      }
    }
    
    // Fill all spans
    for (const [spanY, span] of spans) {
      this.drawHorizontalSpan(color, hasAlpha, spanY, span.x1, span.x2)
    }
  }
  
  /**
   * Draw a polygon outline (no fill).
   */
  drawPolygonOutline(color: Color, vertices: Point[]): void {
    const numPts = vertices.length
    if (numPts < 2) return
    
    for (let i = 0; i < numPts - 1; i++) {
      this.drawLine(color, vertices[i].x, vertices[i].y, vertices[i + 1].x, vertices[i + 1].y)
    }
    // Close the polygon
    this.drawLine(color, vertices[numPts - 1].x, vertices[numPts - 1].y, vertices[0].x, vertices[0].y)
  }
}
