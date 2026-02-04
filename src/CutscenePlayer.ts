/**
 * CutscenePlayer - Main orchestrator for cutscene playback
 * 
 * Sets up the Three.js scene with orthographic camera and
 * coordinates the ShapeRenderer and OpcodeInterpreter.
 */

import * as THREE from 'three'
import type { Cutscene } from './types'
import { SCREEN_WIDTH, SCREEN_HEIGHT, VIEWPORT_X, VIEWPORT_Y, VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from './types'
import { ShapeRenderer } from './ShapeRenderer'
import { OpcodeInterpreter, InterpreterState } from './OpcodeInterpreter'

export interface PlayerOptions {
  container: HTMLElement
  scale?: number
}

export class CutscenePlayer {
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private renderer: THREE.WebGLRenderer
  private shapeRenderer: ShapeRenderer
  private interpreter: OpcodeInterpreter | null = null
  private container: HTMLElement
  private scale: number
  private animationId: number | null = null
  private isPlaying: boolean = false
  private frameInterval: number = 1000 / 12  // ~12 FPS for cutscenes
  private lastFrameTime: number = 0
  private stateChangeCallback: ((state: InterpreterState) => void) | null = null
  
  constructor(options: PlayerOptions) {
    this.container = options.container
    this.scale = options.scale ?? 2
    
    // Create scene
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x000000)
    
    // Create orthographic camera matching original screen dimensions
    // Three.js Y-axis points up, but Flashback Y-axis points down
    // We'll flip the camera to match
    const width = SCREEN_WIDTH
    const height = SCREEN_HEIGHT
    
    this.camera = new THREE.OrthographicCamera(
      0,          // left
      width,      // right
      0,          // top (flipped)
      height,     // bottom (flipped)
      0.1,
      1000
    )
    this.camera.position.z = 100
    
    // Create WebGL renderer
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: false,  // Pixel-perfect rendering
      preserveDrawingBuffer: true  // For screenshots
    })
    this.renderer.setSize(width * this.scale, height * this.scale)
    this.renderer.setPixelRatio(1)  // Disable device pixel ratio scaling
    
    this.container.appendChild(this.renderer.domElement)
    
    // Create shape renderer
    this.shapeRenderer = new ShapeRenderer(this.scene)
    
    // Add viewport border for visualization
    this.addViewportBorder()
  }
  
  /**
   * Add a visual border around the cutscene viewport.
   */
  private addViewportBorder(): void {
    const points = [
      new THREE.Vector3(VIEWPORT_X, VIEWPORT_Y, 0),
      new THREE.Vector3(VIEWPORT_X + VIEWPORT_WIDTH, VIEWPORT_Y, 0),
      new THREE.Vector3(VIEWPORT_X + VIEWPORT_WIDTH, VIEWPORT_Y + VIEWPORT_HEIGHT, 0),
      new THREE.Vector3(VIEWPORT_X, VIEWPORT_Y + VIEWPORT_HEIGHT, 0),
      new THREE.Vector3(VIEWPORT_X, VIEWPORT_Y, 0)
    ]
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({ 
      color: 0x00d9ff,
      opacity: 0.3,
      transparent: true
    })
    const line = new THREE.Line(geometry, material)
    line.name = 'viewport_border'
    this.scene.add(line)
  }
  
  /**
   * Load a cutscene from JSON data.
   */
  loadCutscene(cutscene: Cutscene): void {
    // Clean up previous cutscene
    if (this.interpreter) {
      this.stop()
      this.shapeRenderer.dispose()
    }
    
    // Load shapes into renderer
    this.shapeRenderer.loadShapes(cutscene.shapes)
    
    // Create interpreter
    this.interpreter = new OpcodeInterpreter(cutscene, this.shapeRenderer)
    
    // Register state change callback if one was set before loading
    if (this.stateChangeCallback) {
      this.interpreter.setOnFrameChange(this.stateChangeCallback)
    }
    
    // Render first frame
    this.interpreter.renderCurrentFrame()
    this.render()
  }
  
  /**
   * Set callback for state changes.
   * Can be called before loadCutscene - callback will be registered when interpreter is created.
   */
  onStateChange(callback: (state: InterpreterState) => void): void {
    this.stateChangeCallback = callback
    // If interpreter already exists, set it now
    this.interpreter?.setOnFrameChange(callback)
  }
  
  /**
   * Get current state.
   */
  getState(): InterpreterState | null {
    return this.interpreter?.getState() ?? null
  }
  
  /**
   * Render the scene.
   */
  private render(): void {
    this.renderer.render(this.scene, this.camera)
  }
  
  /**
   * Animation loop for playback.
   */
  private animate = (time: number): void => {
    if (!this.isPlaying) return
    
    this.animationId = requestAnimationFrame(this.animate)
    
    // Frame timing
    if (time - this.lastFrameTime >= this.frameInterval) {
      this.lastFrameTime = time
      
      const state = this.interpreter?.getState()
      if (state && state.currentFrame < state.totalFrames - 1) {
        this.interpreter?.nextFrame()
        this.render()
      } else {
        // End of cutscene - loop back to beginning
        this.interpreter?.reset()
        this.render()
      }
    }
  }
  
  /**
   * Start playback.
   */
  play(): void {
    if (this.isPlaying) return
    
    this.isPlaying = true
    this.lastFrameTime = performance.now()
    this.animationId = requestAnimationFrame(this.animate)
  }
  
  /**
   * Stop playback.
   */
  stop(): void {
    this.isPlaying = false
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }
  
  /**
   * Toggle play/pause.
   */
  togglePlay(): boolean {
    if (this.isPlaying) {
      this.stop()
    } else {
      this.play()
    }
    return this.isPlaying
  }
  
  /**
   * Go to next frame.
   */
  nextFrame(): void {
    this.stop()
    this.interpreter?.nextFrame()
    this.render()
  }
  
  /**
   * Go to previous frame.
   */
  prevFrame(): void {
    this.stop()
    this.interpreter?.prevFrame()
    this.render()
  }
  
  /**
   * Go to specific frame.
   */
  goToFrame(frame: number): void {
    this.stop()
    this.interpreter?.goToFrame(frame)
    this.render()
  }
  
  /**
   * Reset to beginning.
   */
  reset(): void {
    this.stop()
    this.interpreter?.reset()
    this.render()
  }
  
  /**
   * Get canvas for screenshot.
   */
  getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement
  }
  
  /**
   * Take a screenshot as data URL.
   */
  screenshot(): string {
    this.render()
    return this.renderer.domElement.toDataURL('image/png')
  }
  
  /**
   * Set playback speed (frames per second).
   */
  setFPS(fps: number): void {
    this.frameInterval = 1000 / fps
  }
  
  /**
   * Resize the renderer.
   */
  resize(scale: number): void {
    this.scale = scale
    this.renderer.setSize(SCREEN_WIDTH * scale, SCREEN_HEIGHT * scale)
    // Reset CSS scaling
    this.renderer.domElement.style.width = ''
    this.renderer.domElement.style.height = ''
    this.render()
  }
  
  /**
   * Set pixelated mode - render at native resolution, CSS scale to display size.
   */
  setPixelated(enabled: boolean, displayScale: number = 3): void {
    if (enabled) {
      // Render at native resolution
      this.renderer.setSize(SCREEN_WIDTH, SCREEN_HEIGHT)
      // CSS scale up to display size
      this.renderer.domElement.style.width = `${SCREEN_WIDTH * displayScale}px`
      this.renderer.domElement.style.height = `${SCREEN_HEIGHT * displayScale}px`
    } else {
      // Render at full resolution
      this.renderer.setSize(SCREEN_WIDTH * displayScale, SCREEN_HEIGHT * displayScale)
      this.renderer.domElement.style.width = ''
      this.renderer.domElement.style.height = ''
    }
    this.render()
  }
  
  /**
   * Clean up resources.
   */
  dispose(): void {
    this.stop()
    this.shapeRenderer.dispose()
    this.renderer.dispose()
    this.container.removeChild(this.renderer.domElement)
  }
}
