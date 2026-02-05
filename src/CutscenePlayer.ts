/**
 * CutscenePlayer - Main orchestrator for cutscene playback
 * 
 * Sets up a Canvas 2D context and coordinates the 
 * Canvas2DRenderer and OpcodeInterpreter. Also handles
 * MIDI audio playback synced with the cutscene using OPL3 synthesis.
 */

import type { Cutscene } from './types'
import { SCREEN_WIDTH, SCREEN_HEIGHT } from './types'
import { Canvas2DRenderer } from './Canvas2DRenderer'
import { OpcodeInterpreter, InterpreterState } from './OpcodeInterpreter'
import { MidiPlayer, MidiPlayerState, VolumeModel, VolumeModelType, ChannelInfo } from './MidiPlayer'

export { VolumeModel }
export type { VolumeModelType }
import { getPrfName } from './audioMapping'

export type { MidiPlayerState, ChannelInfo }

export interface PlayerOptions {
  container: HTMLElement
  displayScale?: number
  /** Base path for MIDI files (DATA directory) */
  midiBasePath?: string
  /** Whether to enable audio */
  enableAudio?: boolean
}

export class CutscenePlayer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private renderer: Canvas2DRenderer
  private interpreter: OpcodeInterpreter | null = null
  private container: HTMLElement
  private scale: number
  private animationId: number | null = null
  private isPlaying: boolean = false
  private frameInterval: number = 1000 / 12
  private lastFrameTime: number = 0
  private stateChangeCallback: ((state: InterpreterState) => void) | null = null
  
  // Audio support
  private midiPlayer: MidiPlayer
  private audioEnabled: boolean
  private midiStateCallback: ((state: MidiPlayerState) => void) | null = null
  private currentCutsceneName: string | null = null
  
  constructor(options: PlayerOptions) {
    this.container = options.container
    this.scale = options.displayScale ?? 3
    this.audioEnabled = options.enableAudio ?? true
    
    // Create canvas at native resolution
    this.canvas = document.createElement('canvas')
    this.canvas.width = SCREEN_WIDTH
    this.canvas.height = SCREEN_HEIGHT
    
    // CSS scale for display
    this.canvas.style.width = `${SCREEN_WIDTH * this.scale}px`
    this.canvas.style.height = `${SCREEN_HEIGHT * this.scale}px`
    this.canvas.style.imageRendering = 'pixelated'
    
    const ctx = this.canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Could not get 2D context')
    }
    this.ctx = ctx
    
    // Disable image smoothing for pixel-perfect rendering
    this.ctx.imageSmoothingEnabled = false
    
    this.container.appendChild(this.canvas)
    
    // Create renderer
    this.renderer = new Canvas2DRenderer()
    
    // Create MIDI player (OPL3 synthesis)
    this.midiPlayer = new MidiPlayer({
      basePath: options.midiBasePath ?? '/DATA/'
    })
    
    // Forward MIDI state changes
    this.midiPlayer.onStateChange((state) => {
      this.midiStateCallback?.(state)
    })
  }
  
  loadCutscene(cutscene: Cutscene): void {
    // Clean up previous cutscene
    if (this.interpreter) {
      this.stop()
      this.renderer.dispose()
    }
    
    // Stop and reset any playing audio BEFORE loading new cutscene
    // This ensures no audio bleeds between cutscenes
    this.midiPlayer.stopAndReset()
    
    // Notify that audio is not loaded (yet)
    this.midiStateCallback?.({
      loaded: false,
      playing: false,
      position: 0,
      duration: 0,
      error: null
    })
    
    // Recreate renderer
    this.renderer = new Canvas2DRenderer()
    
    // Load shapes into renderer
    this.renderer.loadShapes(cutscene.shapes)
    
    // Create interpreter
    this.interpreter = new OpcodeInterpreter(cutscene, this.renderer)
    
    // Register state change callback if one was set before loading
    if (this.stateChangeCallback) {
      this.interpreter.setOnFrameChange(this.stateChangeCallback)
    }
    
    // Render first frame
    this.interpreter.renderCurrentFrame()
    this.render()
    
    // Store cutscene name for audio loading
    this.currentCutsceneName = cutscene.name
    
    // Try to load music - will queue if audio not initialized yet
    if (this.audioEnabled && cutscene.name) {
      this.loadMusicForCutscene(cutscene.name)
    }
  }
  
  /**
   * Ensure audio is ready and load music for current cutscene.
   * Call this after a user gesture.
   */
  async initAudioAndLoadMusic(): Promise<boolean> {
    const initialized = await this.midiPlayer.ensureInitialized()
    if (!initialized) return false
    
    // If there's pending music, load it now
    if (this.midiPlayer.hasPendingMusic()) {
      return this.midiPlayer.loadPendingMusic()
    }
    
    // Otherwise, try to load music for current cutscene
    if (this.currentCutsceneName) {
      const prfName = getPrfName(this.currentCutsceneName)
      if (prfName && !this.midiPlayer.isLoaded()) {
        return this.midiPlayer.loadForCutscene(prfName)
      }
    }
    
    return this.midiPlayer.isLoaded()
  }
  
  /**
   * Load music for a cutscene (PRF + INS + MIDI).
   */
  private async loadMusicForCutscene(cutsceneName: string): Promise<void> {
    const prfName = getPrfName(cutsceneName)
    if (prfName) {
      try {
        await this.midiPlayer.loadForCutscene(prfName)
      } catch (err) {
        console.error(`Music load failed for ${cutsceneName}:`, err)
        // Notify error state
        this.midiStateCallback?.({
          loaded: false,
          playing: false,
          position: 0,
          duration: 0,
          error: err instanceof Error ? err.message : 'Failed to load music'
        })
      }
    } else {
      // Notify no audio
      this.midiStateCallback?.({
        loaded: false,
        playing: false,
        position: 0,
        duration: 0,
        error: null
      })
    }
  }
  
  onStateChange(callback: (state: InterpreterState) => void): void {
    this.stateChangeCallback = callback
    this.interpreter?.setOnFrameChange(callback)
  }
  
  /**
   * Set callback for MIDI state changes.
   */
  onMidiStateChange(callback: (state: MidiPlayerState) => void): void {
    this.midiStateCallback = callback
  }
  
  /**
   * Get current MIDI state.
   */
  async getMidiState(): Promise<MidiPlayerState> {
    return this.midiPlayer.getState()
  }
  
  /**
   * Check if audio is available for current cutscene.
   */
  hasAudio(): boolean {
    return this.midiPlayer.isLoaded()
  }
  
  /**
   * Get the name of the currently loaded cutscene.
   */
  getCurrentCutsceneName(): string | null {
    return this.currentCutsceneName
  }
  
  getState(): InterpreterState | null {
    return this.interpreter?.getState() ?? null
  }
  
  private render(): void {
    // Render shapes to buffer
    this.renderer.render()
    
    // Copy buffer to canvas
    this.ctx.putImageData(this.renderer.getImageData(), 0, 0)
  }
  
  private animate = (time: number): void => {
    if (!this.isPlaying) return
    
    this.animationId = requestAnimationFrame(this.animate)
    
    if (time - this.lastFrameTime >= this.frameInterval) {
      this.lastFrameTime = time
      
      const state = this.interpreter?.getState()
      if (state && state.currentFrame < state.totalFrames - 1) {
        this.interpreter?.nextFrame()
        this.render()
      } else {
        this.interpreter?.reset()
        this.render()
      }
    }
  }
  
  async play(): Promise<void> {
    if (this.isPlaying) return
    
    this.isPlaying = true
    this.lastFrameTime = performance.now()
    this.animationId = requestAnimationFrame(this.animate)
    
    // Start MIDI playback (ensure initialized on user gesture)
    if (this.audioEnabled) {
      const musicLoaded = await this.initAudioAndLoadMusic()
      if (musicLoaded) {
        this.midiPlayer.play()
      }
    }
  }
  
  stop(): void {
    this.isPlaying = false
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
    
    // Stop MIDI
    if (this.audioEnabled) {
      this.midiPlayer.stop()
    }
  }
  
  async togglePlay(): Promise<boolean> {
    if (this.isPlaying) {
      this.stop()
    } else {
      await this.play()
    }
    return this.isPlaying
  }
  
  nextFrame(): void {
    this.stop()
    this.interpreter?.nextFrame()
    this.render()
    this.syncMidiToFrame()
  }
  
  prevFrame(): void {
    this.stop()
    this.interpreter?.prevFrame()
    this.render()
    this.syncMidiToFrame()
  }
  
  goToFrame(frame: number): void {
    this.stop()
    this.interpreter?.goToFrame(frame)
    this.render()
    this.syncMidiToFrame()
  }
  
  reset(): void {
    this.stop()
    this.interpreter?.reset()
    this.render()
    
    // Reset MIDI to beginning
    if (this.audioEnabled) {
      this.midiPlayer.seek(0)
    }
  }
  
  /**
   * Sync MIDI position to current frame.
   */
  private syncMidiToFrame(): void {
    if (!this.audioEnabled || !this.midiPlayer.isLoaded()) return
    
    const state = this.interpreter?.getState()
    if (state) {
      const fps = 1000 / this.frameInterval
      this.midiPlayer.seekToFrame(state.currentFrame, fps)
    }
  }
  
  getCanvas(): HTMLCanvasElement {
    return this.canvas
  }
  
  screenshot(): string {
    this.render()
    return this.canvas.toDataURL('image/png')
  }
  
  setFPS(fps: number): void {
    this.frameInterval = 1000 / fps
  }
  
  setDisplayScale(scale: number): void {
    this.scale = scale
    this.canvas.style.width = `${SCREEN_WIDTH * scale}px`
    this.canvas.style.height = `${SCREEN_HEIGHT * scale}px`
    this.render()
  }
  
  /**
   * Enable or disable audio.
   */
  setAudioEnabled(enabled: boolean): void {
    this.audioEnabled = enabled
    if (!enabled) {
      this.midiPlayer.stop()
    } else if (this.isPlaying) {
      this.midiPlayer.play()
    }
  }
  
  /**
   * Check if audio is enabled.
   */
  isAudioEnabled(): boolean {
    return this.audioEnabled
  }
  
  /**
   * Set whether MIDI should loop.
   */
  setLoop(loop: boolean): void {
    this.midiPlayer.setLoop(loop)
  }
  
  /**
   * Set the volume model for MIDI playback.
   * Different models affect instrument balance.
   */
  setVolumeModel(model: VolumeModelType): void {
    this.midiPlayer.setVolumeModel(model)
  }
  
  /**
   * Set callback for channel info changes.
   */
  onChannelChange(callback: (channels: ChannelInfo[]) => void): void {
    this.midiPlayer.onChannelChange(callback)
  }
  
  /**
   * Get info for all MIDI channels.
   */
  getChannels(): ChannelInfo[] {
    return this.midiPlayer.getChannels()
  }
  
  /**
   * Ensure audio is initialized and music is loaded (call on user interaction).
   */
  async ensureAudioInitialized(): Promise<boolean> {
    return this.initAudioAndLoadMusic()
  }
  
  /**
   * Toggle mute state for a channel.
   */
  toggleMuteChannel(channel: number): boolean {
    return this.midiPlayer.toggleMuteChannel(channel)
  }
  
  /**
   * Mute a channel.
   */
  muteChannel(channel: number): void {
    this.midiPlayer.muteChannel(channel)
  }
  
  /**
   * Unmute a channel.
   */
  unmuteChannel(channel: number): void {
    this.midiPlayer.unmuteChannel(channel)
  }
  
  /**
   * Get available instruments.
   */
  getAvailableInstruments(): string[] {
    return this.midiPlayer.getAvailableInstruments()
  }
  
  /**
   * Set instrument for a channel.
   */
  async setChannelInstrument(channel: number, instrumentName: string): Promise<boolean> {
    return this.midiPlayer.setChannelInstrument(channel, instrumentName)
  }
  
  /**
   * Set octave offset for a channel.
   */
  async setChannelOctaveOffset(channel: number, offset: number): Promise<boolean> {
    return this.midiPlayer.setChannelOctaveOffset(channel, offset)
  }
  
  /**
   * Play a note on a specific channel (for testing instruments).
   */
  noteOn(channel: number, note: number, velocity: number = 100): void {
    this.midiPlayer.noteOn(channel, note, velocity)
  }
  
  /**
   * Stop a note on a specific channel.
   */
  noteOff(channel: number, note: number): void {
    this.midiPlayer.noteOff(channel, note)
  }
  
  /**
   * Stop all notes immediately.
   */
  allNotesOff(): void {
    this.midiPlayer.allNotesOff()
  }
  
  dispose(): void {
    this.stop()
    this.renderer.dispose()
    this.midiPlayer.dispose()
    this.container.removeChild(this.canvas)
  }
}
