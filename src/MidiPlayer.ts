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
 * MIDI analysis result for understanding file structure.
 */
interface MidiAnalysis {
  /** Number of tracks in the file */
  trackCount: number
  /** Note ranges per channel */
  channelNotes: Map<number, { minNote: number, maxNote: number }>
  /** Program changes per channel: channel -> program number */
  channelPrograms: Map<number, number>
  /** Tracks that have note events, mapped to their primary channel */
  trackChannels: Map<number, number>
}

/**
 * Analyze MIDI file structure to understand channel usage.
 */
function analyzeMidi(midiData: ArrayBuffer): MidiAnalysis {
  const channelNotes = new Map<number, { minNote: number, maxNote: number }>()
  const channelPrograms = new Map<number, number>()
  const trackChannels = new Map<number, number>()
  
  const view = new DataView(midiData)
  let pos = 0
  
  // Check for MThd header
  const header = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
  if (header !== 'MThd') {
    console.warn('Invalid MIDI file header')
    return { trackCount: 0, channelNotes, channelPrograms, trackChannels }
  }
  
  const headerLen = view.getUint32(4)
  
  pos = 8 + headerLen
  let trackIndex = 0
  
  // Process tracks
  while (pos < midiData.byteLength) {
    const trackHeader = String.fromCharCode(
      view.getUint8(pos), view.getUint8(pos + 1), view.getUint8(pos + 2), view.getUint8(pos + 3)
    )
    
    if (trackHeader !== 'MTrk') break
    
    const trackLen = view.getUint32(pos + 4)
    let trackPos = pos + 8
    const trackEnd = trackPos + trackLen
    let runningStatus = 0
    
    // Track which channel this track primarily uses
    const trackChannelCounts = new Map<number, number>()
    
    while (trackPos < trackEnd) {
      // Read variable-length delta time
      let b: number
      do {
        b = view.getUint8(trackPos++)
      } while (b & 0x80)
      
      // Read event
      let status = view.getUint8(trackPos)
      if (status < 0x80) {
        status = runningStatus
      } else {
        runningStatus = status
        trackPos++
      }
      
      const eventType = status & 0xF0
      const channel = status & 0x0F
      
      if (eventType === 0x90 || eventType === 0x80) {
        // Note On or Note Off
        const note = view.getUint8(trackPos++)
        const velocity = view.getUint8(trackPos++)
        
        // Only track Note On with velocity > 0
        if (eventType === 0x90 && velocity > 0) {
          const existing = channelNotes.get(channel)
          if (existing) {
            existing.minNote = Math.min(existing.minNote, note)
            existing.maxNote = Math.max(existing.maxNote, note)
          } else {
            channelNotes.set(channel, { minNote: note, maxNote: note })
          }
          
          // Count channel usage in this track
          trackChannelCounts.set(channel, (trackChannelCounts.get(channel) || 0) + 1)
        }
      } else if (eventType === 0xC0) {
        // Program Change
        const program = view.getUint8(trackPos++)
        channelPrograms.set(channel, program)
      } else if (eventType === 0xA0 || eventType === 0xB0 || eventType === 0xE0) {
        trackPos += 2
      } else if (eventType === 0xD0) {
        trackPos += 1
      } else if (status === 0xFF) {
        // Meta event
        trackPos++ // meta type
        let len = 0
        do {
          b = view.getUint8(trackPos++)
          len = (len << 7) | (b & 0x7F)
        } while (b & 0x80)
        trackPos += len
      } else if (status === 0xF0 || status === 0xF7) {
        // SysEx
        let len = 0
        do {
          b = view.getUint8(trackPos++)
          len = (len << 7) | (b & 0x7F)
        } while (b & 0x80)
        trackPos += len
      }
    }
    
    // Determine primary channel for this track
    if (trackChannelCounts.size > 0) {
      let maxCount = 0
      let primaryChannel = 0
      for (const [ch, count] of trackChannelCounts) {
        if (count > maxCount) {
          maxCount = count
          primaryChannel = ch
        }
      }
      trackChannels.set(trackIndex, primaryChannel)
    }
    
    pos = trackEnd
    trackIndex++
  }
  
  return { trackCount: trackIndex, channelNotes, channelPrograms, trackChannels }
}

/**
 * Calculate the octave-wrap offset needed for high notes.
 * OPL3 only supports octaves 0-7 (3-bit block register).
 * Notes in octave 8+ wrap around in the original hardware.
 * 
 * @param maxNote - The highest note played on a channel
 * @returns Note offset to apply to wrap high octaves correctly
 */
function calculateOctaveWrapOffset(maxNote: number): number {
  const octave = Math.floor(maxNote / 12)
  if (octave <= 7) {
    // Note is within OPL3 range, no wrapping needed
    return 0
  }
  
  // Calculate how many octaves to wrap down
  // Octave 8 -> 0, octave 9 -> 1, etc. (8 octaves = 96 semitones)
  const wrapOctaves = Math.floor(octave / 8) * 8
  return -wrapOctaves * 12
}

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
  private pendingLoad: string | null = null  // PRF to load after init
  private stateCallback: ((state: MidiPlayerState) => void) | null = null
  private channelCallback: ((channels: ChannelInfo[]) => void) | null = null
  private unsubscribePlaybackState: (() => void) | null = null
  private unsubscribePlaybackEnded: (() => void) | null = null
  
  // Channel tracking
  private channelInstruments: (string | null)[] = new Array(16).fill(null)
  private channelOctaveOffsets: number[] = new Array(16).fill(0)
  private mutedChannels: Set<number> = new Set()
  
  // Current loaded data (for instrument remapping)
  private currentPrf: PrfData | null = null
  private currentMidiAnalysis: MidiAnalysis | null = null
  private availableInstruments: string[] = []
  
  constructor(options: MidiPlayerOptions = {}) {
    this.basePath = options.basePath ?? '/DATA/'
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
      
      // The nuked profile already has the paths configured
      // Don't pass any arguments - let it use its built-in URLs
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
   * Call this after ensureInitialized() succeeds.
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
   * This loads instruments from INS files and the MIDI from the PRF configuration.
   * 
   * Call ensureInitialized() first if this is a user gesture context.
   */
  async loadForCutscene(prfName: string): Promise<boolean> {
    // Always stop any current playback first
    this.stopAndReset()
    
    // If not initialized, we can't load - just remember what to load
    if (!this.initialized) {
      this.pendingLoad = prfName
      this.currentPrfName = prfName
      this.loadError = 'Click Play to enable audio'
      this.notifyState()
      return false
    }
    
    if (!this.synth) {
      console.error('Synth is null but initialized is true - this should not happen')
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
      
      // 2. Store channel instrument names and reset octave offsets
      this.channelInstruments = [...prf.instruments]
      this.channelOctaveOffsets = new Array(16).fill(0)
      this.mutedChannels.clear()
      
      // 3. Load MIDI file FIRST to analyze note ranges
      const midiFilename = prf.midiFilename.toUpperCase()
      const midiPath = `${this.basePath}${midiFilename}`
      
      const midiResponse = await fetch(midiPath)
      if (!midiResponse.ok) {
        throw new Error(`MIDI file not found: ${midiPath}`)
      }
      
      const midiBuffer = await midiResponse.arrayBuffer()
      
      // 4. Analyze MIDI file structure
      const midiAnalysis = analyzeMidi(midiBuffer)
      this.currentMidiAnalysis = midiAnalysis
      
      // 5. Load available instruments for UI
      await this.loadAvailableInstruments()
      
      // 6. Load and inject instruments based on PRF and MIDI analysis
      await this.loadAndInjectInstruments(prf, midiAnalysis)
      
      // Notify channel info
      this.notifyChannels()
      
      // 7. Load MIDI into synthesizer
      await this.synth!.loadMidi(midiBuffer)
      
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
   * 
   * REminiscence processes MIDI by track index, not channel. Each track uses
   * instrument[track_index] initially. We need to map this to libadlmidi-js
   * which uses standard MIDI channels.
   * 
   * Strategy:
   * - For each MIDI channel that has notes, determine which PRF instrument slot to use
   * - If adlibPrograms contains program numbers, use those for mapping
   * - Otherwise, assume track N → channel N → instrument N
   * 
   * @param prf - Parsed PRF data with instrument names and offsets
   * @param midiAnalysis - MIDI structure analysis
   */
  private async loadAndInjectInstruments(
    prf: PrfData, 
    midiAnalysis: MidiAnalysis
  ): Promise<void> {
    const instrumentCache = new Map<string, InsData>()
    
    // Build program → instrument slot mapping from adlibPrograms
    // adlibPrograms[slot] contains the MIDI program number for that slot
    const programToSlot = new Map<number, number>()
    for (let slot = 0; slot < 16; slot++) {
      if (prf.adlibPrograms && prf.adlibPrograms[slot] !== undefined) {
        const prog = prf.adlibPrograms[slot]
        programToSlot.set(prog, slot)
      }
    }
    
    
    // Determine which instrument slot each MIDI channel should use
    // In REminiscence, track index determines instrument (initially track N → instrument N)
    // Track N typically outputs to channel N (or hwChannelNum[N])
    
    // For each channel that has notes in the MIDI, figure out the instrument
    for (const [channel, noteRange] of midiAnalysis.channelNotes) {
      // Find which track uses this channel
      let instrumentSlot = channel // Default: channel N uses instrument N
      
      // Check if this channel had a program change
      const program = midiAnalysis.channelPrograms.get(channel)
      if (program !== undefined && programToSlot.has(program)) {
        instrumentSlot = programToSlot.get(program)!
      } else {
        // No program change, or program not in mapping
        // Use track→channel mapping to find the track, then use track index as slot
        for (const [track, trackChannel] of midiAnalysis.trackChannels) {
          if (trackChannel === channel) {
            instrumentSlot = track
            break
          }
        }
      }
      
      const insName = prf.instruments[instrumentSlot]
      if (!insName) {
        console.warn(`No instrument in slot ${instrumentSlot} for channel ${channel}`)
        continue
      }
      
      // Check cache first
      let insData = instrumentCache.get(insName)
      
      if (!insData) {
        // Load INS file - try with exact name first, then without trailing 'a'
        // Some PRF files reference e.g. "elpiano1a" but file is "ELPIANO1.INS"
        const namesToTry = [insName.toUpperCase()]
        if (insName.toLowerCase().endsWith('a') && insName.length > 1) {
          namesToTry.push(insName.toUpperCase().slice(0, -1))
        }
        
        let buffer: ArrayBuffer | null = null
        let loadedPath: string | null = null
        
        for (const name of namesToTry) {
          const insPath = `${this.basePath}${name}.INS`
          try {
            const response = await fetch(insPath)
            if (!response.ok) continue
            
            
            buffer = await response.arrayBuffer()
            
            // INS files are exactly 80 bytes
            if (buffer.byteLength !== 80) {
              buffer = null
              continue
            }
            
            // Validate: mode must be 0 (melodic) or 1 (percussion)
            const firstByte = new DataView(buffer).getUint8(0)
            if (firstByte > 1) {
              buffer = null
              continue
            }
            
            loadedPath = insPath
            break
          } catch {
            continue
          }
        }
        
        if (!buffer) {
          console.warn(`INS file not found (tried: ${namesToTry.join(', ')}): ${insName}`)
          continue
        }
        
        try {
          insData = parseIns(buffer)
          instrumentCache.set(insName, insData)
        } catch (err) {
          console.warn(`Failed to parse INS ${loadedPath}:`, err)
          continue
        }
      }
      
      // Get note and velocity offsets from PRF for this slot
      let noteOffset = prf.adlibNotes[instrumentSlot] || 0
      const velocityOffset = prf.adlibVelocities[instrumentSlot] || 0
      
      // Check if this channel needs octave-wrap correction
      const octaveWrapOffset = calculateOctaveWrapOffset(noteRange.maxNote)
      if (octaveWrapOffset !== 0) {
        noteOffset += octaveWrapOffset
      }
      
      // Convert to OPL3 format with offsets
      const opl3Instrument = insToOpl3(insData, { noteOffset, velocityOffset })
      
      try {
        // Inject instrument for this MIDI channel
        // Use channel as program number since libadlmidi-js maps channels to programs
        const bankId = { percussive: insData.mode !== 0, msb: 0, lsb: 0 }
        await this.synth!.setInstrument(bankId, channel, opl3Instrument as any)
      } catch (err) {
        console.warn(`Failed to inject instrument ${insName}:`, err)
      }
    }
    
    // Update channel instrument names for UI
    for (const [channel] of midiAnalysis.channelNotes) {
      let instrumentSlot = channel
      const program = midiAnalysis.channelPrograms.get(channel)
      if (program !== undefined && programToSlot.has(program)) {
        instrumentSlot = programToSlot.get(program)!
      } else {
        for (const [track, trackChannel] of midiAnalysis.trackChannels) {
          if (trackChannel === channel) {
            instrumentSlot = track
            break
          }
        }
      }
      this.channelInstruments[channel] = prf.instruments[instrumentSlot]
    }
  }
  
  /**
   * Stop playback and reset state completely.
   * Call this when switching cutscenes.
   */
  stopAndReset(): void {
    if (this.synth) {
      this.synth.stop()
      this.synth.panic() // Stop all sounds immediately
      this.synth.resetState() // Reset controllers
    }
    this.loaded = false
    this.currentPrfName = null
  }
  
  private setupCallbacks(): void {
    if (!this.synth) return
    
    // Clean up old callbacks
    this.unsubscribePlaybackState?.()
    this.unsubscribePlaybackEnded?.()
    
    // Set up new callbacks
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
      // Set channel volume to 0
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
      // Restore channel volume to max
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
    // Try to get list from known instruments in PRF + some common ones
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
      // Check if the file exists
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
    if (channel < 0 || channel > 15 || !this.synth || !this.currentMidiAnalysis) {
      return false
    }
    
    try {
      // Load the INS file
      const namesToTry = [instrumentName.toUpperCase()]
      if (instrumentName.toLowerCase().endsWith('a') && instrumentName.length > 1) {
        namesToTry.push(instrumentName.toUpperCase().slice(0, -1))
      }
      // Also try adding 'a' if not present
      if (!instrumentName.toLowerCase().endsWith('a')) {
        namesToTry.push(instrumentName.toUpperCase() + 'A')
      }
      
      let buffer: ArrayBuffer | null = null
      
      for (const name of namesToTry) {
        try {
          const response = await fetch(`${this.basePath}${name}.INS`)
          if (!response.ok) continue
          
          buffer = await response.arrayBuffer()
          if (buffer.byteLength !== 80) {
            buffer = null
            continue
          }
          
          const firstByte = new DataView(buffer).getUint8(0)
          if (firstByte > 1) {
            buffer = null
            continue
          }
          
          break
        } catch {
          continue
        }
      }
      
      if (!buffer) {
        return false
      }
      
      const insData = parseIns(buffer)
      
      // Get the program number this channel uses
      const programNumber = this.currentMidiAnalysis.channelPrograms.get(channel) ?? channel
      
      // Apply octave offset
      const octaveOffset = this.channelOctaveOffsets[channel] || 0
      const noteOffset = (this.currentPrf?.adlibNotes[channel] || 0) + (octaveOffset * 12)
      const velocityOffset = this.currentPrf?.adlibVelocities[channel] || 0
      
      // Convert to OPL3 format
      const opl3Instrument = insToOpl3(insData, { noteOffset, velocityOffset })
      
      // Inject the instrument
      const bankId = { percussive: insData.mode !== 0, msb: 0, lsb: 0 }
      await this.synth.setInstrument(bankId, programNumber, opl3Instrument as any)
      
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
   * Set the volume model. Different models interpret MIDI velocity differently.
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
   * Requires music to be loaded so instruments are set up.
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
