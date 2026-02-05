/**
 * Canvas2DRenderer - Renders Flashback cutscene primitives using Canvas 2D
 * 
 * Replaces Three.js rendering with pixel-perfect 2D canvas operations.
 * Handles polygon, ellipse, and point primitives with palette-based colors.
 */

import { Graphics, Point } from './Graphics'
import type { 
  Shape, 
  PolygonPrimitive, 
  EllipsePrimitive, 
  PointPrimitive,
  Color 
} from './types'
import { 
  SCREEN_WIDTH, 
  SCREEN_HEIGHT, 
  VIEWPORT_X, 
  VIEWPORT_Y, 
  VIEWPORT_WIDTH, 
  VIEWPORT_HEIGHT 
} from './types'

interface DrawnShape {
  shapeId: number
  x: number
  y: number
  scale: number
  rotation: number
  originX: number
  originY: number
  clearScreenAtDraw: number
}

export class Canvas2DRenderer {
  private graphics: Graphics
  private shapes: Map<number, Shape> = new Map()
  private drawnShapes: DrawnShape[] = []
  private auxShapes: DrawnShape[] = []
  private palette: Color[] = []
  private clearScreen: number = 1
  
  constructor() {
    this.graphics = new Graphics(SCREEN_WIDTH, SCREEN_HEIGHT)
  }
  
  getImageData(): ImageData {
    return this.graphics.getImageData()
  }
  
  setPalette(palette: Color[]): void {
    this.palette = palette
  }
  
  setClearScreen(clearScreen: number): void {
    this.clearScreen = clearScreen
  }
  
  private getColorForClearScreen(index: number, clearScreen: number): Color {
    let paletteIndex = index & 0x1F
    if (clearScreen === 0) {
      paletteIndex = (paletteIndex + 16) & 0x1F
    }
    
    const color = this.palette[paletteIndex]
    if (!color) {
      return { r: 255, g: 0, b: 255 } // Magenta for missing
    }
    return color
  }
  
  loadShapes(shapes: Shape[]): void {
    this.shapes.clear()
    for (const shape of shapes) {
      this.shapes.set(shape.id, shape)
    }
  }
  
  drawShape(shapeId: number, x: number, y: number): void {
    const shape = this.shapes.get(shapeId)
    if (!shape) {
      console.warn(`Shape ${shapeId} not found`)
      return
    }
    
    const drawn: DrawnShape = {
      shapeId,
      x,
      y,
      scale: 1,
      rotation: 0,
      originX: 0,
      originY: 0,
      clearScreenAtDraw: this.clearScreen
    }
    
    this.drawnShapes.push(drawn)
    
    if (this.clearScreen !== 0) {
      this.auxShapes.push(drawn)
    }
  }
  
  drawShapeScale(
    shapeId: number,
    x: number,
    y: number,
    zoom: number,
    originX: number,
    originY: number
  ): void {
    const shape = this.shapes.get(shapeId)
    if (!shape) {
      console.warn(`Shape ${shapeId} not found`)
      return
    }
    
    // Zoom is relative to 512 base (512 = 1.0x)
    const scale = (zoom + 512) / 512
    
    const drawn: DrawnShape = {
      shapeId,
      x,
      y,
      scale,
      rotation: 0,
      originX,
      originY,
      clearScreenAtDraw: this.clearScreen
    }
    
    this.drawnShapes.push(drawn)
    
    if (this.clearScreen !== 0) {
      this.auxShapes.push(drawn)
    }
  }
  
  drawShapeScaleRotate(
    shapeId: number,
    x: number,
    y: number,
    zoom: number,
    originX: number,
    originY: number,
    rotationA: number,
    _rotationB: number,
    _rotationC: number
  ): void {
    const shape = this.shapes.get(shapeId)
    if (!shape) {
      console.warn(`Shape ${shapeId} not found`)
      return
    }
    
    const scale = (zoom + 512) / 512
    const rotation = (rotationA * Math.PI) / 180
    
    const drawn: DrawnShape = {
      shapeId,
      x,
      y,
      scale,
      rotation,
      originX,
      originY,
      clearScreenAtDraw: this.clearScreen
    }
    
    this.drawnShapes.push(drawn)
    
    if (this.clearScreen !== 0) {
      this.auxShapes.push(drawn)
    }
  }
  
  clearDrawnShapes(): void {
    if (this.clearScreen === 0) {
      // Keep background shapes, remove foreground
      this.drawnShapes = [...this.auxShapes]
    } else {
      this.drawnShapes = []
      this.auxShapes = []
    }
  }
  
  clearAllShapes(): void {
    this.drawnShapes = []
    this.auxShapes = []
  }
  
  updateDrawnShapeColors(): void {
    // No-op for immediate mode rendering
    // Colors are resolved at render time
  }
  
  /**
   * Render all drawn shapes to the graphics buffer.
   * Call this before getting the ImageData.
   */
  render(): void {
    // Clear to black
    this.graphics.clear({ r: 0, g: 0, b: 0 })
    
    // Draw all shapes
    for (const drawn of this.drawnShapes) {
      const shape = this.shapes.get(drawn.shapeId)
      if (!shape) continue
      
      this.renderShape(shape, drawn)
    }
    
    // Draw viewport mask (black borders)
    this.drawViewportMask()
  }
  
  private renderShape(shape: Shape, drawn: DrawnShape): void {
    const baseX = drawn.x + VIEWPORT_X
    const baseY = drawn.y + VIEWPORT_Y
    
    for (const primitive of shape.primitives) {
      const color = this.getColorForClearScreen(primitive.color, drawn.clearScreenAtDraw)
      
      switch (primitive.type) {
        case 'polygon':
          this.renderPolygon(primitive, color, baseX, baseY, drawn)
          break
        case 'ellipse':
          this.renderEllipse(primitive, color, baseX, baseY, drawn)
          break
        case 'point':
          this.renderPoint(primitive, color, baseX, baseY, drawn)
          break
      }
    }
  }
  
  private transformPoint(
    x: number, 
    y: number, 
    baseX: number, 
    baseY: number, 
    drawn: DrawnShape
  ): Point {
    // Apply scale around origin
    let tx = x
    let ty = y
    
    if (drawn.scale !== 1) {
      tx = drawn.originX + (tx - drawn.originX) * drawn.scale
      ty = drawn.originY + (ty - drawn.originY) * drawn.scale
    }
    
    // Apply rotation around origin
    if (drawn.rotation !== 0) {
      const cos = Math.cos(-drawn.rotation)
      const sin = Math.sin(-drawn.rotation)
      const rx = tx - drawn.originX
      const ry = ty - drawn.originY
      tx = drawn.originX + rx * cos - ry * sin
      ty = drawn.originY + rx * sin + ry * cos
    }
    
    return {
      x: Math.round(tx + baseX),
      y: Math.round(ty + baseY)
    }
  }
  
  private renderPolygon(
    prim: PolygonPrimitive, 
    color: Color, 
    baseX: number, 
    baseY: number,
    drawn: DrawnShape
  ): void {
    const offsetX = prim.offsetX || 0
    const offsetY = prim.offsetY || 0
    
    // Transform vertices
    const vertices: Point[] = prim.vertices.map(([vx, vy]) => {
      return this.transformPoint(vx + offsetX, vy + offsetY, baseX, baseY, drawn)
    })
    
    if (vertices.length < 2) {
      // Single point
      if (vertices.length === 1) {
        this.graphics.drawPoint(color, vertices[0].x, vertices[0].y)
      }
      return
    }
    
    this.graphics.drawPolygon(color, prim.hasAlpha, vertices)
  }
  
  private renderEllipse(
    prim: EllipsePrimitive, 
    color: Color, 
    baseX: number, 
    baseY: number,
    drawn: DrawnShape
  ): void {
    const offsetX = prim.offsetX || 0
    const offsetY = prim.offsetY || 0
    
    const center = this.transformPoint(
      prim.cx + offsetX, 
      prim.cy + offsetY, 
      baseX, 
      baseY, 
      drawn
    )
    
    // Scale radii
    let rx = Math.round(Math.abs(prim.rx) * drawn.scale)
    let ry = Math.round(Math.abs(prim.ry) * drawn.scale)
    
    this.graphics.drawEllipse(color, prim.hasAlpha, center.x, center.y, rx, ry)
  }
  
  private renderPoint(
    prim: PointPrimitive, 
    color: Color, 
    baseX: number, 
    baseY: number,
    drawn: DrawnShape
  ): void {
    const offsetX = prim.offsetX || 0
    const offsetY = prim.offsetY || 0
    
    const pt = this.transformPoint(
      prim.x + offsetX, 
      prim.y + offsetY, 
      baseX, 
      baseY, 
      drawn
    )
    
    this.graphics.drawPoint(color, pt.x, pt.y)
  }
  
  private drawViewportMask(): void {
    const black = { r: 0, g: 0, b: 0 }
    
    // Top mask
    for (let y = 0; y < VIEWPORT_Y; y++) {
      for (let x = 0; x < SCREEN_WIDTH; x++) {
        this.setPixelDirect(x, y, black)
      }
    }
    
    // Bottom mask
    const bottomY = VIEWPORT_Y + VIEWPORT_HEIGHT
    for (let y = bottomY; y < SCREEN_HEIGHT; y++) {
      for (let x = 0; x < SCREEN_WIDTH; x++) {
        this.setPixelDirect(x, y, black)
      }
    }
    
    // Left mask
    for (let y = VIEWPORT_Y; y < bottomY; y++) {
      for (let x = 0; x < VIEWPORT_X; x++) {
        this.setPixelDirect(x, y, black)
      }
    }
    
    // Right mask
    const rightX = VIEWPORT_X + VIEWPORT_WIDTH
    for (let y = VIEWPORT_Y; y < bottomY; y++) {
      for (let x = rightX; x < SCREEN_WIDTH; x++) {
        this.setPixelDirect(x, y, black)
      }
    }
  }
  
  private setPixelDirect(x: number, y: number, color: Color): void {
    if (x >= 0 && x < SCREEN_WIDTH && y >= 0 && y < SCREEN_HEIGHT) {
      const pixels = this.graphics.getImageData().data
      const idx = (y * SCREEN_WIDTH + x) * 4
      pixels[idx] = color.r
      pixels[idx + 1] = color.g
      pixels[idx + 2] = color.b
      pixels[idx + 3] = 255
    }
  }
  
  dispose(): void {
    this.shapes.clear()
    this.drawnShapes = []
    this.auxShapes = []
  }
}
