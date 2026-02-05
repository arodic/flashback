/**
 * InsToOpl3 - Convert Flashback .INS format to libadlmidi-js Instrument format
 * 
 * Maps the custom AdLib instrument format used by Flashback to the
 * libadlmidi-js Instrument interface for OPL3 synthesis.
 */

import type { InsData, InsOperator } from './InsParser'

/**
 * OPL3 operator parameters (matches libadlmidi-js Operator type)
 */
export interface Opl3Operator {
  am: boolean           // Amplitude modulation (tremolo)
  vibrato: boolean      // Vibrato (frequency modulation)
  sustaining: boolean   // Sustaining (EG type)
  ksr: boolean          // Key scale rate
  freqMult: number      // Frequency multiplier (0-15)
  keyScaleLevel: number // Key scale level (0-3)
  totalLevel: number    // Total level / attenuation (0-63, 0 = loudest)
  attack: number        // Attack rate (0-15)
  decay: number         // Decay rate (0-15)
  sustain: number       // Sustain level (0-15, 0 = loudest)
  release: number       // Release rate (0-15)
  waveform: number      // Waveform select (0-7)
}

/**
 * Complete OPL3 instrument definition (matches libadlmidi-js Instrument type)
 */
export interface Opl3Instrument {
  version: number       // Instrument version (0)
  is4op: boolean
  isPseudo4op: boolean
  isBlank: boolean
  rhythmMode: number    // Rhythm mode (0-7, 0 = melodic)
  feedback1: number     // Voice 1 feedback (0-7)
  connection1: number   // Voice 1 connection (0 = FM, 1 = additive)
  feedback2: number     // Voice 2 feedback (0-7, 4-op only)
  connection2: number   // Voice 2 connection (4-op only)
  noteOffset1: number
  noteOffset2: number
  velocityOffset: number
  secondVoiceDetune: number
  percussionKey: number // Percussion key number (for rhythm mode)
  delayOnMs: number
  delayOffMs: number
  operators: [Opl3Operator, Opl3Operator, Opl3Operator, Opl3Operator]
}

/**
 * Create a default (silent) operator.
 */
function defaultOperator(): Opl3Operator {
  return {
    am: false,
    vibrato: false,
    sustaining: false,
    ksr: false,
    freqMult: 0,
    keyScaleLevel: 0,
    totalLevel: 63, // Maximum attenuation (silent)
    attack: 0,
    decay: 0,
    sustain: 0,
    release: 0,
    waveform: 0,
  }
}

/**
 * Convert an INS operator to OPL3 format.
 */
function convertOperator(ins: InsOperator, waveSelect: number): Opl3Operator {
  return {
    am: ins.amplitudeVibrato,
    vibrato: ins.frequencyVibrato,
    sustaining: ins.sustainSound,
    ksr: ins.envelopeScaling,
    freqMult: ins.frequencyMultiplier & 0x0F,
    keyScaleLevel: ins.keyScaling & 0x03,
    totalLevel: ins.outputLevel & 0x3F,
    attack: ins.attackRate & 0x0F,
    decay: ins.decayRate & 0x0F,
    sustain: ins.sustainLevel & 0x0F,
    release: ins.releaseRate & 0x0F,
    waveform: waveSelect & 0x07,
  }
}

/**
 * Options for converting INS to OPL3 format.
 */
export interface InsToOpl3Options {
  /** Note offset in semitones (from PRF adlibNotes) */
  noteOffset?: number
  /** Velocity offset (from PRF adlibVelocities) */
  velocityOffset?: number
}

/**
 * Convert a Flashback .INS instrument to libadlmidi-js format.
 * 
 * @param ins - Parsed INS data
 * @param options - Optional note/velocity offsets from PRF file
 */
export function insToOpl3(ins: InsData, options: InsToOpl3Options = {}): Opl3Instrument {
  // Convert operators
  const modulator = convertOperator(ins.modulator, ins.modulatorWaveSelect)
  const carrier = convertOperator(ins.carrier, ins.carrierWaveSelect)
  
  // In 2-op mode, operators are: [modulator, carrier, unused, unused]
  // libadlmidi-js expects: operators[0] = mod1, [1] = car1, [2] = mod2, [3] = car2
  
  // Note offset from PRF file - shifts the pitch by semitones
  // Negative values lower the pitch, positive values raise it
  const noteOffset = options.noteOffset ?? 0
  
  return {
    version: 0,
    is4op: false,
    isPseudo4op: false,
    isBlank: false,
    // Rhythm mode: 0 = melodic (pitch follows MIDI note)
    rhythmMode: 0,
    // Feedback is stored in modulator's feedbackStrength field
    feedback1: ins.modulator.feedbackStrength & 0x07,
    // Connection: frequencyModulation=true means FM (0), false means additive (1)
    connection1: ins.modulator.frequencyModulation ? 0 : 1,
    feedback2: 0,
    connection2: 0,
    noteOffset1: noteOffset,
    noteOffset2: 0,
    velocityOffset: options.velocityOffset ?? 0,
    secondVoiceDetune: 0,
    percussionKey: 0,
    delayOnMs: 0,
    delayOffMs: 0,
    operators: [modulator, carrier, defaultOperator(), defaultOperator()],
  }
}

/**
 * Create a default (empty) instrument.
 */
export function defaultInstrument(): Opl3Instrument {
  return {
    version: 0,
    is4op: false,
    isPseudo4op: false,
    isBlank: true,
    rhythmMode: 0,
    feedback1: 0,
    connection1: 0,
    feedback2: 0,
    connection2: 0,
    noteOffset1: 0,
    noteOffset2: 0,
    velocityOffset: 0,
    secondVoiceDetune: 0,
    percussionKey: 0,
    delayOnMs: 0,
    delayOffMs: 0,
    operators: [defaultOperator(), defaultOperator(), defaultOperator(), defaultOperator()],
  }
}
