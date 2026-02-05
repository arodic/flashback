/**
 * OpcodeInterpreter - Executes cutscene commands
 * 
 * Interprets the CMD bytecode commands and coordinates with
 * the Canvas2DRenderer to produce the visual output.
 */

import type { Cutscene, Command, Color, Frame } from './types'
import { Canvas2DRenderer } from './Canvas2DRenderer'

export interface InterpreterState {
  currentSubscene: number
  currentFrame: number
  totalFrames: number
  paletteBuffer: Color[]  // 32-color runtime palette (two 16-color slots)
  clearScreen: number     // 0 = preserve background, non-0 = clear to black
  isPlaying: boolean
}

export class OpcodeInterpreter {
  private cutscene: Cutscene
  private renderer: Canvas2DRenderer
  private state: InterpreterState
  private onFrameChange?: (state: InterpreterState) => void
  
  constructor(cutscene: Cutscene, renderer: Canvas2DRenderer) {
    this.cutscene = cutscene
    this.renderer = renderer
    
    // Initialize 32-color palette buffer (two 16-color slots)
    const initialPalette = this.createEmptyPalette()
    
    // Initialize state
    this.state = {
      currentSubscene: 0,
      currentFrame: 0,
      totalFrames: this.countTotalFrames(),
      paletteBuffer: initialPalette,
      clearScreen: 1,  // Start with clear mode (use colors 0-15)
      isPlaying: false
    }
    
    // Set initial palette
    this.renderer.setPalette(this.state.paletteBuffer)
    this.renderer.setClearScreen(this.state.clearScreen)
  }
  
  private createEmptyPalette(): Color[] {
    // Create 32-color palette (two 16-color slots)
    const palette: Color[] = []
    for (let i = 0; i < 32; i++) {
      palette.push({ r: 0, g: 0, b: 0 })
    }
    return palette
  }
  
  private countTotalFrames(): number {
    let total = 0
    for (const subscene of this.cutscene.script.subscenes) {
      total += subscene.frames.length
    }
    return total
  }
  
  /**
   * Set callback for frame changes.
   */
  setOnFrameChange(callback: (state: InterpreterState) => void): void {
    this.onFrameChange = callback
  }
  
  /**
   * Get current interpreter state.
   */
  getState(): InterpreterState {
    return { ...this.state }
  }
  
  /**
   * Execute a single command.
   */
  private executeCommand(cmd: Command): void {
    switch (cmd.op) {
      case 'markCurPos':
        // Frame boundary - clear back buffer for next frame
        // In original engine, this displays current frame then clears for next
        this.renderer.clearDrawnShapes()
        break
        
      case 'refreshScreen':
        // clearMode controls both clearing and which palette half to use:
        // - clearMode != 0: clear to black, use colors 0-15
        // - clearMode == 0: preserve auxPage (background), use colors 16-31
        this.state.clearScreen = cmd.clearMode ?? 0
        this.renderer.setClearScreen(this.state.clearScreen)
        if (this.state.clearScreen !== 0) {
          this.renderer.clearDrawnShapes()
        }
        break
        
      case 'drawShape':
        if (cmd.shapeId !== undefined) {
          this.renderer.drawShape(cmd.shapeId, cmd.x ?? 0, cmd.y ?? 0)
        }
        break
        
      case 'drawShapeScale':
        if (cmd.shapeId !== undefined) {
          this.renderer.drawShapeScale(
            cmd.shapeId,
            cmd.x ?? 0,
            cmd.y ?? 0,
            cmd.zoom ?? 0,
            cmd.originX ?? 0,
            cmd.originY ?? 0
          )
        }
        break
        
      case 'drawShapeScaleRotate':
        if (cmd.shapeId !== undefined) {
          this.renderer.drawShapeScaleRotate(
            cmd.shapeId,
            cmd.x ?? 0,
            cmd.y ?? 0,
            cmd.zoom ?? 0,
            cmd.originX ?? 0,
            cmd.originY ?? 0,
            cmd.rotationA ?? 0,
            cmd.rotationB ?? 180,
            cmd.rotationC ?? 90
          )
        }
        break
        
      case 'setPalette':
        if (cmd.paletteNum !== undefined) {
          const palettes = this.cutscene.palettes
          if (cmd.paletteNum < palettes.length) {
            const srcPalette = palettes[cmd.paletteNum]
            // bufferNum is XORed with 1 in original engine:
            // bufferNum=0 -> writes to slot 1 (colors 16-31)
            // bufferNum=1 -> writes to slot 0 (colors 0-15)
            const destSlot = ((cmd.bufferNum ?? 0) ^ 1) & 1
            const destOffset = destSlot * 16
            
            // Copy 16 colors to the appropriate slot
            for (let i = 0; i < 16 && i < srcPalette.length; i++) {
              this.state.paletteBuffer[destOffset + i] = srcPalette[i]
            }
            
            this.renderer.setPalette(this.state.paletteBuffer)
          }
        }
        break
        
      case 'waitForSync':
        // In real-time playback this would wait, but for frame-by-frame
        // we handle timing in the player
        break
        
      case 'copyScreen':
        // Buffer copy operation - for now just continue
        break
        
      case 'refreshAll':
        // Refresh and handle keys - just continue for now
        break
        
      case 'nop':
      case 'skip3':
        // No operation
        break
        
      case 'drawCaptionText':
      case 'drawTextAtPos':
        // Text rendering - not implemented yet
        // Would need font data from the game
        break
        
      case 'handleKeys':
        // Input handling - not applicable for viewer
        break
        
      default:
        console.warn('Unknown opcode:', cmd.op)
    }
  }
  
  /**
   * Execute all commands in a frame.
   */
  private executeFrame(frame: Frame): void {
    for (const cmd of frame.commands) {
      this.executeCommand(cmd)
    }
  }
  
  /**
   * Render the current frame.
   */
  renderCurrentFrame(): void {
    // Find the frame to render
    const { frame } = this.getFrameAt(this.state.currentFrame)
    if (frame) {
      // Execute commands in the frame
      // Note: refreshScreen command will handle clearing
      this.executeFrame(frame)
      
      // Update colors on drawn shapes with final palette state
      // This is needed because shapes may be drawn before setPalette commands
      this.renderer.updateDrawnShapeColors()
    }
    
    this.onFrameChange?.(this.getState())
  }
  
  /**
   * Get frame at a global frame index.
   */
  private getFrameAt(globalIndex: number): { subscene: number; frame: Frame | null } {
    let index = globalIndex
    
    for (let s = 0; s < this.cutscene.script.subscenes.length; s++) {
      const subscene = this.cutscene.script.subscenes[s]
      if (index < subscene.frames.length) {
        return { subscene: s, frame: subscene.frames[index] }
      }
      index -= subscene.frames.length
    }
    
    return { subscene: 0, frame: null }
  }
  
  /**
   * Go to next frame.
   */
  nextFrame(): void {
    if (this.state.currentFrame < this.state.totalFrames - 1) {
      this.state.currentFrame++
      this.renderCurrentFrame()
    }
  }
  
  /**
   * Go to previous frame.
   */
  prevFrame(): void {
    if (this.state.currentFrame > 0) {
      this.state.currentFrame--
      // Need to rebuild from start for previous frame due to state dependencies
      this.rebuildToFrame(this.state.currentFrame)
    }
  }
  
  /**
   * Rebuild state up to a specific frame.
   */
  private rebuildToFrame(targetFrame: number): void {
    // Reset state
    this.state.paletteBuffer = this.createEmptyPalette()
    this.state.clearScreen = 1
    this.renderer.clearAllShapes()  // Full clear including background
    this.renderer.setPalette(this.state.paletteBuffer)
    this.renderer.setClearScreen(this.state.clearScreen)
    
    // Execute all frames up to and including target
    // We need to properly track which shapes accumulate
    for (let f = 0; f <= targetFrame; f++) {
      const { frame } = this.getFrameAt(f)
      if (frame) {
        // Execute each command
        for (const cmd of frame.commands) {
          this.executeCommand(cmd)
        }
      }
    }
    
    // Update colors on drawn shapes with final palette state
    this.renderer.updateDrawnShapeColors()
    
    this.onFrameChange?.(this.getState())
  }
  
  /**
   * Go to a specific frame.
   */
  goToFrame(frameIndex: number): void {
    if (frameIndex >= 0 && frameIndex < this.state.totalFrames) {
      this.state.currentFrame = frameIndex
      this.rebuildToFrame(frameIndex)
    }
  }
  
  /**
   * Reset to first frame.
   */
  reset(): void {
    this.goToFrame(0)
  }
}
