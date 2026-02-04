/**
 * ShapeRenderer - Renders Flashback cutscene primitives using Three.js
 * 
 * Handles polygon, ellipse, and point primitives with palette-based colors.
 */

import * as THREE from 'three'
import type { 
  Shape, 
  Primitive, 
  PolygonPrimitive, 
  EllipsePrimitive, 
  PointPrimitive,
  Color 
} from './types'
import { VIEWPORT_X, VIEWPORT_Y, VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from './types'

export class ShapeRenderer {
  private scene: THREE.Scene
  private shapeGroups: Map<number, THREE.Group> = new Map()
  private drawnShapes: THREE.Object3D[] = []  // Track shapes drawn this frame
  private auxShapes: THREE.Object3D[] = []    // Background shapes (auxPage equivalent)
  private palette: Color[] = []
  private clearScreen: number = 1  // Non-zero = clear mode (use colors 0-15)
  
  constructor(scene: THREE.Scene) {
    this.scene = scene
  }
  
  /**
   * Set the current 32-color palette for color lookups.
   */
  setPalette(palette: Color[]): void {
    this.palette = palette
  }
  
  /**
   * Set the clearScreen state which affects color selection.
   * clearScreen != 0: use colors 0-15
   * clearScreen == 0: use colors 16-31
   */
  setClearScreen(clearScreen: number): void {
    this.clearScreen = clearScreen
  }
  
  /**
   * Get color from palette index with specific clearScreen state.
   * The color index in shape data is 0-15, but the actual palette slot
   * depends on clearScreen state:
   * - clearScreen != 0: use index directly (0-15)
   * - clearScreen == 0: add 16 to index (16-31)
   */
  private getColorForClearScreen(index: number, clearScreen: number): THREE.Color {
    // Apply color offset based on clearScreen state
    let paletteIndex = index & 0x1F  // Mask to 0-31
    if (clearScreen === 0) {
      paletteIndex = (paletteIndex + 16) & 0x1F
    }
    
    const color = this.palette[paletteIndex]
    
    if (!color) {
      return new THREE.Color(0xff00ff) // Magenta for missing colors
    }
    
    return new THREE.Color(color.r / 255, color.g / 255, color.b / 255)
  }
  
  /**
   * Get color using current clearScreen state.
   */
  private getColor(index: number): THREE.Color {
    return this.getColorForClearScreen(index, this.clearScreen)
  }
  
  /**
   * Pre-render all shapes from the cutscene data.
   */
  loadShapes(shapes: Shape[]): void {
    for (const shape of shapes) {
      const group = this.createShapeGroup(shape)
      this.shapeGroups.set(shape.id, group)
      group.visible = false
      this.scene.add(group)
    }
  }
  
  /**
   * Create a Three.js group containing all primitives of a shape.
   */
  private createShapeGroup(shape: Shape): THREE.Group {
    const group = new THREE.Group()
    group.name = `shape_${shape.id}`
    
    for (const primitive of shape.primitives) {
      const mesh = this.createPrimitiveMesh(primitive)
      if (mesh) {
        group.add(mesh)
      }
    }
    
    return group
  }
  
  /**
   * Create a mesh for a single primitive.
   */
  private createPrimitiveMesh(primitive: Primitive): THREE.Object3D | null {
    switch (primitive.type) {
      case 'polygon':
        return this.createPolygonMesh(primitive)
      case 'ellipse':
        return this.createEllipseMesh(primitive)
      case 'point':
        return this.createPointMesh(primitive)
      default:
        console.warn('Unknown primitive type:', (primitive as any).type)
        return null
    }
  }
  
  /**
   * Create a filled polygon mesh.
   * 
   * Note: The original game uses Y-down coordinates (0 at top, 224 at bottom).
   * Three.js uses Y-up coordinates internally for Shape geometry.
   * We handle this by using an orthographic camera with flipped top/bottom,
   * which means we can use the coordinates directly.
   */
  private createPolygonMesh(prim: PolygonPrimitive): THREE.Mesh {
    const vertices = prim.vertices
    const offsetX = prim.offsetX || 0
    const offsetY = prim.offsetY || 0
    
    // Handle degenerate cases
    if (vertices.length < 2) {
      // Single vertex - render as a point
      const [x, y] = vertices[0] || [0, 0]
      const geometry = new THREE.PlaneGeometry(1, 1)
      const material = new THREE.MeshBasicMaterial({
        color: this.getColor(prim.color),
        side: THREE.DoubleSide
      })
      const mesh = new THREE.Mesh(geometry, material)
      // Position = vertex position + offset
      mesh.position.set(x + offsetX + 0.5, y + offsetY + 0.5, 0)
      mesh.userData = { primitive: prim }
      return mesh
    }
    
    if (vertices.length === 2) {
      // Two vertices - render as a thin line (rectangle)
      // Apply offset to vertex positions
      const x1 = vertices[0][0] + offsetX
      const y1 = vertices[0][1] + offsetY
      const x2 = vertices[1][0] + offsetX
      const y2 = vertices[1][1] + offsetY
      const dx = x2 - x1
      const dy = y2 - y1
      const len = Math.sqrt(dx * dx + dy * dy)
      
      // Create rectangle at origin, then position at midpoint
      const geometry = new THREE.PlaneGeometry(len, 1)
      const material = new THREE.MeshBasicMaterial({
        color: this.getColor(prim.color),
        side: THREE.DoubleSide
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0)
      // atan2 gives angle from positive X axis
      // With Y-flipped camera, rotation direction is inverted, so no negation needed
      mesh.rotation.z = Math.atan2(dy, dx)
      mesh.userData = { primitive: prim }
      return mesh
    }
    
    // For 3+ vertices, create a filled polygon
    const shape = new THREE.Shape()
    
    // Start at first vertex (vertices already include local coords, offset applied via position)
    shape.moveTo(vertices[0][0], vertices[0][1])
    
    // Draw lines to remaining vertices
    for (let i = 1; i < vertices.length; i++) {
      shape.lineTo(vertices[i][0], vertices[i][1])
    }
    
    shape.closePath()
    
    const geometry = new THREE.ShapeGeometry(shape)
    const material = new THREE.MeshBasicMaterial({
      color: this.getColor(prim.color),
      side: THREE.DoubleSide
    })
    
    const mesh = new THREE.Mesh(geometry, material)
    
    // Apply primitive offset
    mesh.position.set(offsetX, offsetY, 0)
    
    // Store primitive info for later updates
    mesh.userData = { primitive: prim }
    
    return mesh
  }
  
  /**
   * Create an ellipse mesh.
   */
  private createEllipseMesh(prim: EllipsePrimitive): THREE.Mesh {
    const offsetX = prim.offsetX || 0
    const offsetY = prim.offsetY || 0
    
    // Create ellipse at origin, apply center + offset via position
    const curve = new THREE.EllipseCurve(
      0, 0,                // Center at origin
      prim.rx, prim.ry,    // Radii
      0, Math.PI * 2,      // Full ellipse
      false,               // Clockwise
      0                    // Rotation
    )
    
    const points = curve.getPoints(32)
    const shape = new THREE.Shape(points)
    const geometry = new THREE.ShapeGeometry(shape)
    
    const material = new THREE.MeshBasicMaterial({
      color: this.getColor(prim.color),
      side: THREE.DoubleSide
    })
    
    const mesh = new THREE.Mesh(geometry, material)
    
    // Position = center + offset
    mesh.position.set(prim.cx + offsetX, prim.cy + offsetY, 0)
    
    mesh.userData = { primitive: prim }
    
    return mesh
  }
  
  /**
   * Create a point (single pixel) mesh.
   */
  private createPointMesh(prim: PointPrimitive): THREE.Mesh {
    const offsetX = prim.offsetX || 0
    const offsetY = prim.offsetY || 0
    
    // Render as a 1x1 square
    const geometry = new THREE.PlaneGeometry(1, 1)
    const material = new THREE.MeshBasicMaterial({
      color: this.getColor(prim.color),
      side: THREE.DoubleSide
    })
    
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(
      prim.x + offsetX + 0.5,
      prim.y + offsetY + 0.5,
      0
    )
    
    mesh.userData = { primitive: prim }
    
    return mesh
  }
  
  /**
   * Update all mesh colors based on current palette.
   */
  updateColors(): void {
    for (const group of this.shapeGroups.values()) {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.userData.primitive) {
          const prim = obj.userData.primitive as Primitive
          const material = obj.material as THREE.MeshBasicMaterial
          material.color = this.getColor(prim.color)
        }
      })
    }
  }
  
  /**
   * Draw a shape at the specified position.
   * Returns the shape group for further manipulation.
   */
  drawShape(shapeId: number, x: number, y: number): THREE.Group | null {
    const original = this.shapeGroups.get(shapeId)
    if (!original) {
      console.warn(`Shape ${shapeId} not found`)
      return null
    }
    
    // Clone the shape group for this draw call
    const clone = original.clone(true)
    clone.name = `drawn_${shapeId}_${Date.now()}`  // Unique name for tracking
    clone.position.set(x + VIEWPORT_X, y + VIEWPORT_Y, 0)
    clone.visible = true
    
    // Store the clearScreen state at draw time for correct palette lookup
    clone.userData.clearScreenAtDraw = this.clearScreen
    
    // Update cloned materials with current palette colors
    clone.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData.primitive) {
        const prim = obj.userData.primitive as Primitive
        const material = (obj.material as THREE.MeshBasicMaterial).clone()
        material.color = this.getColorForClearScreen(prim.color, this.clearScreen)
        obj.material = material
      }
    })
    
    this.scene.add(clone)
    this.drawnShapes.push(clone)
    
    // If drawn with clearScreen != 0, this becomes part of the background (auxPage)
    if (this.clearScreen !== 0) {
      this.auxShapes.push(clone)
    }
    
    return clone
  }
  
  /**
   * Draw a scaled shape.
   */
  drawShapeScale(
    shapeId: number, 
    x: number, 
    y: number, 
    zoom: number,
    originX: number,
    originY: number
  ): THREE.Group | null {
    const group = this.drawShape(shapeId, x, y)
    if (!group) return null
    
    // Zoom is relative to 512 base (512 = 1.0x)
    const scale = (zoom + 512) / 512
    
    // Scale around the origin point
    group.position.x += originX * (1 - scale)
    group.position.y += originY * (1 - scale)
    group.scale.set(scale, scale, 1)
    
    return group
  }
  
  /**
   * Draw a scaled and rotated shape.
   */
  drawShapeScaleRotate(
    shapeId: number,
    x: number,
    y: number,
    zoom: number,
    originX: number,
    originY: number,
    rotationA: number,
    rotationB: number,
    rotationC: number
  ): THREE.Group | null {
    const group = this.drawShapeScale(shapeId, x, y, zoom, originX, originY)
    if (!group) return null
    
    // Apply rotation (angle A is the main rotation in degrees)
    // The rotation matrix in the original uses angles a, b, c for a 3D-like effect
    // For 2D, we'll just use the primary rotation angle
    const rotationRad = (rotationA * Math.PI) / 180
    group.rotation.z = -rotationRad // Negative because Y is flipped
    
    return group
  }
  
  /**
   * Clear the back page - implements auxPage restore/clear logic.
   * Called by markCurPos and refreshScreen.
   * 
   * When clearScreen == 0: Keep background shapes (auxPage), clear only foreground
   * When clearScreen != 0: Clear everything including background
   */
  clearDrawnShapes(): void {
    if (this.clearScreen === 0) {
      // Restore auxPage: keep background shapes, remove foreground shapes
      const foregroundShapes = this.drawnShapes.filter(
        obj => !this.auxShapes.includes(obj)
      )
      
      for (const obj of foregroundShapes) {
        this.scene.remove(obj)
        this.disposeObject(obj)
      }
      
      // drawnShapes now only contains background shapes
      this.drawnShapes = [...this.auxShapes]
    } else {
      // Clear everything including background
      for (const obj of this.drawnShapes) {
        this.scene.remove(obj)
        this.disposeObject(obj)
      }
      this.drawnShapes = []
      this.auxShapes = []
    }
  }
  
  /**
   * Dispose of a Three.js object and its resources.
   */
  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  }
  
  /**
   * Update colors on all drawn shapes with current palette.
   * Uses the clearScreen state that was active when each shape was drawn.
   */
  updateDrawnShapeColors(): void {
    for (const group of this.drawnShapes) {
      // Get the clearScreen state that was active when this shape was drawn
      const clearScreenAtDraw = group.userData.clearScreenAtDraw ?? this.clearScreen
      
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.userData.primitive) {
          const prim = obj.userData.primitive as Primitive
          const material = obj.material as THREE.MeshBasicMaterial
          material.color = this.getColorForClearScreen(prim.color, clearScreenAtDraw)
        }
      })
    }
  }
  
  /**
   * Force clear all shapes including background (for full reset).
   */
  clearAllShapes(): void {
    for (const obj of this.drawnShapes) {
      this.scene.remove(obj)
      this.disposeObject(obj)
    }
    this.drawnShapes = []
    this.auxShapes = []
  }
  
  /**
   * Dispose of all resources.
   */
  dispose(): void {
    this.clearAllShapes()
    
    for (const group of this.shapeGroups.values()) {
      this.scene.remove(group)
      this.disposeObject(group)
    }
    
    this.shapeGroups.clear()
  }
}
