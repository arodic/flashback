/**
 * MidiPlayer - OPL3 FM synthesis MIDI player using libadlmidi-js
 * 
 * Plays Flashback music with authentic sound by loading:
 * 1. PRF file - instrument configuration for each MIDI channel
 * 2. INS files - custom AdLib instrument patches
 * 3. MIDI file - the actual music data
 * 
 * The instruments are injected into the OPL3 synthesizer before playback.
 */

// @ts-ignore - libadlmidi-js doesn't have perfect TS types
import { AdlMidi } from 'libadlmidi-js/nuked'

import { parsePrf, type PrfData } from './PrfParser'
import { parseIns, type InsData } from './InsParser'
import { insToOpl3 } from './InsToOpl3'

/**
 * Volume models available in libADLMIDI.
 * These affect how MIDI velocity/volume is interpreted.
 */
export const VolumeModel = {
  AUTO: 0,           // Automatic choice by bank
  GENERIC: 1,        // Linearized scaling (most standard)
  NATIVE_OPL3: 2,    // Native OPL3 logarithmic scale (CMF)
  DMX: 3,            // DMX/Miles Sound System
  APOGEE: 4,         // Apogee Sound System
  SB16_9X: 5,        // SB16 driver approximation
  DMX_FIXED: 6,      // DMX with AM voice bug fixed
  APOGEE_FIXED: 7,   // Apogee with AM voice bug fixed
} as const

export type VolumeModelType = typeof VolumeModel[keyof typeof VolumeModel]

export interface MidiPlayerState {
  loaded: boolean
  playing: boolean
  position: number
  duration: number
  error: string | null
}

export interface ChannelInfo {
  channel: number
  instrumentName: string | null
  muted: boolean
  octaveOffset: number
}

export interface MidiPlayerOptions {
  /** Base path for PRF/INS/MIDI files */
  basePath?: string
}

export class MidiPlayer {
  private synth: AdlMidi | null = null
  private basePath: string
  private initialized: boolean = false
  private initializing: boolean = false
  private loaded: boolean = false
  private loadError: string | null = null
  private currentPrfName: string | null = null
  private pendingLoad: string | null = null
  private stateCallback: ((state: MidiPlayerState) => void) | null = null
  private channelCallback: ((channels: ChannelInfo[]) => void) | null = null
  private unsubscribePlaybackState: (() => void) | null = null
  private unsubscribePlaybackEnded: (() => void) | null = null
  
  // Channel tracking
  private channelInstruments: (string | null)[] = new Array(16).fill(null)
  private channelOctaveOffsets: number[] = new Array(16).fill(0)
  private mutedChannels: Set<number> = new Set()
  
  // Current loaded data
  private currentPrf: PrfData | null = null
  private availableInstruments: string[] = []
  
  constructor(options: MidiPlayerOptions = {}) {
    this.basePath = options.basePath ?? './DATA/'
  }
  
  /**
   * Initialize the OPL3 synthesizer.
   * Must be called after a user gesture (browser audio policy).
   */
  async init(): Promise<boolean> {
    if (this.initialized) return true
    if (this.initializing) return false
    
    this.initializing = true
    
    try {
      this.synth = new AdlMidi()
      await this.synth.init()
      
      // Use Native OPL3 volume model for authentic logarithmic scaling
      this.synth.setVolumeModel(VolumeModel.NATIVE_OPL3)
      
      // Disable deep vibrato/tremolo - these can cause artifacts
      this.synth.setVibrato(false)
      this.synth.setTremolo(false)
      
      this.initialized = true
      this.initializing = false
      return true
      
    } catch (err) {
      console.error('Failed to initialize OPL3 synth:', err)
      this.loadError = 'Audio requires user interaction'
      this.initializing = false
      this.notifyState()
      return false
    }
  }
  
  /**
   * Try to initialize audio (call this on user interaction).
   */
  async ensureInitialized(): Promise<boolean> {
    if (this.initialized) return true
    return this.init()
  }
  
  /**
   * Load any pending music that was requested before init.
   */
  async loadPendingMusic(): Promise<boolean> {
    if (!this.initialized || !this.pendingLoad) return false
    
    const prfName = this.pendingLoad
    this.pendingLoad = null
    return this.loadForCutscene(prfName)
  }
  
  /**
   * Check if there's pending music to load.
   */
  hasPendingMusic(): boolean {
    return this.pendingLoad !== null
  }
  
  /**
   * Check if music is currently loaded and ready to play.
   */
  isLoaded(): boolean {
    return this.loaded
  }
  
  /**
   * Load music for a cutscene using its PRF file.
   */
  async loadForCutscene(prfName: string): Promise<boolean> {
    this.stopAndReset()
    
    if (!this.initialized) {
      this.pendingLoad = prfName
      this.currentPrfName = prfName
      this.loadError = 'Click Play to enable audio'
      this.notifyState()
      return false
    }
    
    if (!this.synth) {
      console.error('Synth is null but initialized is true')
      return false
    }
    
    this.loaded = false
    this.loadError = null
    this.currentPrfName = prfName
    
    try {
      // 1. Load and parse PRF file
      const prfPath = `${this.basePath}${prfName.toUpperCase()}.PRF`
      const prfResponse = await fetch(prfPath)
      if (!prfResponse.ok) {
        throw new Error(`PRF file not found: ${prfPath}`)
      }
      
      const prfBuffer = await prfResponse.arrayBuffer()
      const prf = parsePrf(prfBuffer)
      this.currentPrf = prf
      
      // 2. Store channel instrument names and reset state
      this.channelInstruments = [...prf.instruments]
      this.channelOctaveOffsets = new Array(16).fill(0)
      this.mutedChannels.clear()
      
      // 3. Load MIDI file
      const midiFilename = prf.midiFilename.toUpperCase()
      const midiPath = `${this.basePath}${midiFilename}`
      const midiResponse = await fetch(midiPath)
      if (!midiResponse.ok) {
        throw new Error(`MIDI file not found: ${midiPath}`)
      }
      const midiBuffer = await midiResponse.arrayBuffer()
      
      // 4. Load available instruments for debug UI
      await this.loadAvailableInstruments()
      
      // 5. Load and inject instruments (simple slot→channel mapping)
      await this.loadAndInjectInstruments(prf)
      
      // Notify channel info
      this.notifyChannels()
      
      // 6. Load MIDI into synthesizer
      await this.synth.loadMidi(midiBuffer)
      
      this.loaded = true
      this.setupCallbacks()
      this.notifyState()
      return true
      
    } catch (err) {
      console.error(`Failed to load music for ${prfName}:`, err)
      this.loadError = err instanceof Error ? err.message : 'Failed to load music'
      this.currentPrfName = null
      this.notifyState()
      return false
    }
  }
  
  /**
   * Load INS files referenced by PRF and inject them into the synthesizer.
   * Uses simple slot→channel mapping: PRF slot N → MIDI channel N
   */
  private async loadAndInjectInstruments(prf: PrfData): Promise<void> {
    const instrumentCache = new Map<string, InsData>()
    
    // For each PRF slot with an instrument, inject it for that channel
    for (let slot = 0; slot < 16; slot++) {
      const insName = prf.instruments[slot]
      if (!insName) continue
      
      // Check cache first
      let insData = instrumentCache.get(insName)
      
      if (!insData) {
        const loaded = await this.loadInsFile(insName)
        if (!loaded) {
          console.warn(`INS file not found: ${insName}`)
          continue
        }
        insData = loaded
        instrumentCache.set(insName, insData)
      }
      
      // Get note and velocity offsets from PRF
      const noteOffset = (prf.adlibNotes[slot] || 0) + (this.channelOctaveOffsets[slot] * 12)
      const velocityOffset = prf.adlibVelocities[slot] || 0
      
      // Convert to OPL3 format
      const opl3Instrument = insToOpl3(insData, { noteOffset, velocityOffset })
      
      try {
        // Inject instrument for this slot/channel
        const bankId = { percussive: insData.mode !== 0, msb: 0, lsb: 0 }
        await this.synth!.setInstrument(bankId, slot, opl3Instrument as any)
      } catch (err) {
        console.warn(`Failed to inject instrument ${insName} for slot ${slot}:`, err)
      }
    }
  }
  
  /**
   * Load an INS file by name.
   */
  private async loadInsFile(insName: string): Promise<InsData | null> {
    // Try with exact name first, then without trailing 'a'
    const namesToTry = [insName.toUpperCase()]
    if (insName.toLowerCase().endsWith('a') && insName.length > 1) {
      namesToTry.push(insName.toUpperCase().slice(0, -1))
    }
    
    for (const name of namesToTry) {
      const insPath = `${this.basePath}${name}.INS`
      try {
        const response = await fetch(insPath)
        if (!response.ok) continue
        
        const buffer = await response.arrayBuffer()
        
        // INS files are exactly 80 bytes
        if (buffer.byteLength !== 80) continue
        
        // Validate: mode must be 0 (melodic) or 1 (percussion)
        const firstByte = new DataView(buffer).getUint8(0)
        if (firstByte > 1) continue
        
        return parseIns(buffer)
      } catch {
        continue
      }
    }
    
    return null
  }
  
  /**
   * Stop playback and reset state completely.
   */
  stopAndReset(): void {
    if (this.synth) {
      this.synth.stop()
      this.synth.panic()
      this.synth.resetState()
    }
    this.loaded = false
    this.currentPrfName = null
  }
  
  private setupCallbacks(): void {
    if (!this.synth) return
    
    this.unsubscribePlaybackState?.()
    this.unsubscribePlaybackEnded?.()
    
    this.unsubscribePlaybackState = this.synth.onPlaybackState(() => {
      this.notifyState()
    })
    
    this.unsubscribePlaybackEnded = this.synth.onPlaybackEnded(() => {
      this.notifyState()
    })
  }
  
  /**
   * Set state change callback.
   */
  onStateChange(callback: (state: MidiPlayerState) => void): void {
    this.stateCallback = callback
  }
  
  /**
   * Set channel info change callback.
   */
  onChannelChange(callback: (channels: ChannelInfo[]) => void): void {
    this.channelCallback = callback
  }
  
  /**
   * Get channel info for all 16 MIDI channels.
   */
  getChannels(): ChannelInfo[] {
    return this.channelInstruments.map((name, i) => ({
      channel: i,
      instrumentName: name,
      muted: this.mutedChannels.has(i),
      octaveOffset: this.channelOctaveOffsets[i] || 0,
    }))
  }
  
  /**
   * Get list of available instrument names.
   */
  getAvailableInstruments(): string[] {
    return this.availableInstruments
  }
  
  /**
   * Mute a MIDI channel.
   */
  muteChannel(channel: number): void {
    if (channel < 0 || channel > 15) return
    this.mutedChannels.add(channel)
    if (this.synth) {
      this.synth.controlChange(channel, 7, 0)
    }
    this.notifyChannels()
  }
  
  /**
   * Unmute a MIDI channel.
   */
  unmuteChannel(channel: number): void {
    if (channel < 0 || channel > 15) return
    this.mutedChannels.delete(channel)
    if (this.synth) {
      this.synth.controlChange(channel, 7, 127)
    }
    this.notifyChannels()
  }
  
  /**
   * Toggle mute state for a channel.
   */
  toggleMuteChannel(channel: number): boolean {
    if (this.mutedChannels.has(channel)) {
      this.unmuteChannel(channel)
      return false
    } else {
      this.muteChannel(channel)
      return true
    }
  }
  
  /**
   * Load list of available INS files.
   */
  private async loadAvailableInstruments(): Promise<void> {
    const instrumentSet = new Set<string>()
    
    // Add instruments from current PRF
    if (this.currentPrf) {
      for (const name of this.currentPrf.instruments) {
        if (name) {
          instrumentSet.add(name.toLowerCase())
        }
      }
    }
    
    // Try to discover more by checking known instrument names
    const knownInstruments = [
      'elpiano1', 'elpiano1a', 'elbass8', 'hartbeat', 'hihat4', 'sdrsyn01',
      'marimba2', 'kjm', 'brss1a', 'flute1', 'flute1a', 'brass02', 'brass3',
      'string2', 'synth1', 'piano3', 'pianobel', 'harp', 'keybrd9', 'orgpedal',
      'acguit1a', 'acousti', 'baselc01', 'drmlog01', 'guit-sus'
    ]
    
    for (const name of knownInstruments) {
      try {
        const response = await fetch(`${this.basePath}${name.toUpperCase()}.INS`, { method: 'HEAD' })
        if (response.ok) {
          instrumentSet.add(name.toLowerCase())
        }
      } catch {
        // Ignore
      }
    }
    
    this.availableInstruments = Array.from(instrumentSet).sort()
  }
  
  /**
   * Change the instrument for a specific MIDI channel.
   */
  async setChannelInstrument(channel: number, instrumentName: string): Promise<boolean> {
    if (channel < 0 || channel > 15 || !this.synth) {
      return false
    }
    
    try {
      const insData = await this.loadInsFile(instrumentName)
      if (!insData) return false
      
      // Apply octave offset
      const noteOffset = (this.currentPrf?.adlibNotes[channel] || 0) + (this.channelOctaveOffsets[channel] * 12)
      const velocityOffset = this.currentPrf?.adlibVelocities[channel] || 0
      
      // Convert to OPL3 format
      const opl3Instrument = insToOpl3(insData, { noteOffset, velocityOffset })
      
      // Inject the instrument
      const bankId = { percussive: insData.mode !== 0, msb: 0, lsb: 0 }
      await this.synth.setInstrument(bankId, channel, opl3Instrument as any)
      
      // Update tracking
      this.channelInstruments[channel] = instrumentName.toLowerCase()
      this.notifyChannels()
      
      return true
    } catch {
      return false
    }
  }
  
  /**
   * Set the octave offset for a channel (in octaves, e.g., -2, -1, 0, 1, 2).
   */
  async setChannelOctaveOffset(channel: number, octaveOffset: number): Promise<boolean> {
    if (channel < 0 || channel > 15) {
      return false
    }
    
    this.channelOctaveOffsets[channel] = octaveOffset
    
    // Re-inject the instrument with new offset
    const instrumentName = this.channelInstruments[channel]
    if (instrumentName) {
      await this.setChannelInstrument(channel, instrumentName)
    }
    
    this.notifyChannels()
    return true
  }
  
  private notifyChannels(): void {
    this.channelCallback?.(this.getChannels())
  }
  
  private async notifyState(): Promise<void> {
    if (!this.stateCallback) return
    const state = await this.getState()
    this.stateCallback(state)
  }
  
  /**
   * Get current player state.
   */
  async getState(): Promise<MidiPlayerState> {
    if (!this.synth || !this.loaded) {
      return {
        loaded: false,
        playing: false,
        position: 0,
        duration: 0,
        error: this.loadError
      }
    }
    
    try {
      const playback = await this.synth.getPlaybackState()
      return {
        loaded: true,
        playing: playback.playMode === 'play',
        position: playback.position,
        duration: playback.duration,
        error: null
      }
    } catch {
      return {
        loaded: this.loaded,
        playing: false,
        position: 0,
        duration: 0,
        error: this.loadError
      }
    }
  }
  
  /**
   * Check if currently playing.
   */
  async isPlaying(): Promise<boolean> {
    if (!this.synth || !this.loaded) return false
    const state = await this.synth.getPlaybackState()
    return state.playMode === 'play'
  }
  
  /**
   * Start playback.
   */
  play(): void {
    if (this.synth && this.loaded) {
      this.synth.play()
    }
  }
  
  /**
   * Stop playback.
   */
  stop(): void {
    if (this.synth) {
      this.synth.stop()
    }
  }
  
  /**
   * Seek to position in seconds.
   */
  seek(seconds: number): void {
    if (this.synth && this.loaded) {
      this.synth.seek(seconds)
    }
  }
  
  /**
   * Seek to a specific frame (for cutscene sync).
   */
  seekToFrame(frameIndex: number, fps: number): void {
    const seconds = frameIndex / fps
    this.seek(seconds)
  }
  
  /**
   * Enable/disable looping.
   */
  setLoop(enabled: boolean): void {
    if (this.synth) {
      this.synth.setLoop(enabled)
    }
  }
  
  /**
   * Get current position in seconds.
   */
  async getPosition(): Promise<number> {
    if (!this.synth || !this.loaded) return 0
    const state = await this.synth.getPlaybackState()
    return state.position
  }
  
  /**
   * Get duration in seconds.
   */
  async getDuration(): Promise<number> {
    if (!this.synth || !this.loaded) return 0
    const state = await this.synth.getPlaybackState()
    return state.duration
  }
  
  /**
   * Get current PRF file name.
   */
  getCurrentPrfName(): string | null {
    return this.currentPrfName
  }
  
  /**
   * Set the volume model.
   */
  setVolumeModel(model: VolumeModelType): void {
    if (this.synth) {
      this.synth.setVolumeModel(model)
    }
  }
  
  /**
   * Clean up resources.
   */
  dispose(): void {
    this.unsubscribePlaybackState?.()
    this.unsubscribePlaybackEnded?.()
    
    if (this.synth) {
      this.synth.stop()
      this.synth.panic()
      this.synth.close()
      this.synth = null
    }
    
    this.initialized = false
    this.loaded = false
    this.currentPrfName = null
  }
  
  /**
   * Trigger a note on a specific channel (for testing).
   */
  noteOn(channel: number, note: number, velocity: number = 100): void {
    if (!this.synth || !this.loaded) {
      console.warn('Cannot play note: synth not ready or no music loaded')
      return
    }
    this.synth.noteOn(channel, note, velocity)
  }
  
  /**
   * Stop a note on a specific channel (for testing).
   */
  noteOff(channel: number, note: number): void {
    if (!this.synth) return
    this.synth.noteOff(channel, note, 0)
  }
  
  /**
   * Stop all notes immediately.
   */
  allNotesOff(): void {
    if (this.synth) {
      this.synth.panic()
    }
  }
}
