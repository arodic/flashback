/**
 * InsParser - Parse Flashback .INS (Instrument) files
 * 
 * INS files are 80-byte AdLib/OPL2 instrument patches containing:
 * - Mode (melodic vs percussion)
 * - Channel number (for percussion)
 * - Wave select registers
 * - Two operators (modulator and carrier) with FM synthesis parameters
 */

export interface InsOperator {
  keyScaling: number        // 0-3
  frequencyMultiplier: number  // 0-15
  feedbackStrength: number  // 0-7 (only for modulator)
  attackRate: number        // 0-15
  sustainLevel: number      // 0-15
  sustainSound: boolean     // EG type
  decayRate: number         // 0-15
  releaseRate: number       // 0-15
  outputLevel: number       // 0-63
  amplitudeVibrato: boolean // AM
  frequencyVibrato: boolean // VIB
  envelopeScaling: boolean  // KSR
  frequencyModulation: boolean // Connection (FM vs additive)
}

export interface InsData {
  /** 0 = melodic, non-zero = percussion */
  mode: number
  /** Hardware channel for percussion (6-10) */
  channelNum: number
  /** Modulator wave select (0-7) */
  modulatorWaveSelect: number
  /** Carrier wave select (0-7) */
  carrierWaveSelect: number
  /** Modulator operator */
  modulator: InsOperator
  /** Carrier operator */
  carrier: InsOperator
}

/**
 * Parse an INS file buffer (80 bytes).
 * 
 * Based on REminiscence's loadIns() function in prf_player.cpp
 * 
 * File structure (80 bytes):
 *   Offset 0:     mode (1 byte)
 *   Offset 1:     channel number (1 byte)
 *   Offset 2-27:  modulator operator (26 bytes = 13 uint16 fields)
 *   Offset 28-53: carrier operator (26 bytes = 13 uint16 fields)
 *   Offset 54-73: padding (20 bytes)
 *   Offset 74:    modulator wave select (1 byte)
 *   Offset 75:    unused (1 byte)
 *   Offset 76:    carrier wave select (1 byte)
 *   Offset 77:    unused (1 byte)
 *   Offset 78-79: trailing uint16
 */
export function parseIns(buffer: ArrayBuffer): InsData {
  if (buffer.byteLength < 80) {
    throw new Error(`INS file too small: ${buffer.byteLength} bytes (expected 80)`)
  }
  
  const view = new DataView(buffer)
  
  // Byte 0: mode (0 = melodic, non-zero = percussion)
  const mode = view.getUint8(0)
  
  // Byte 1: channel number (for percussion, 6-10)
  const channelNum = view.getUint8(1)
  
  // Bytes 2-27: modulator operator (26 bytes)
  // Bytes 28-53: carrier operator (26 bytes)
  const modulator = parseOperator(view, 2)
  const carrier = parseOperator(view, 28)
  
  // Wave select is at the END of the file, not at bytes 2-3!
  // Byte 74: modulator wave select
  // Byte 76: carrier wave select
  // OPL3 supports 8 waveforms (0-7)
  const modulatorWaveSelect = view.getUint8(74) & 0x07
  const carrierWaveSelect = view.getUint8(76) & 0x07
  
  return {
    mode,
    channelNum,
    modulatorWaveSelect,
    carrierWaveSelect,
    modulator,
    carrier,
  }
}

/**
 * Parse a single operator from the INS data.
 * Each operator is 13 uint16 fields = 26 bytes.
 */
function parseOperator(view: DataView, offset: number): InsOperator {
  return {
    keyScaling: view.getUint16(offset + 0, true),
    frequencyMultiplier: view.getUint16(offset + 2, true),
    feedbackStrength: view.getUint16(offset + 4, true),
    attackRate: view.getUint16(offset + 6, true),
    sustainLevel: view.getUint16(offset + 8, true),
    sustainSound: view.getUint16(offset + 10, true) !== 0,
    decayRate: view.getUint16(offset + 12, true),
    releaseRate: view.getUint16(offset + 14, true),
    outputLevel: view.getUint16(offset + 16, true),
    amplitudeVibrato: view.getUint16(offset + 18, true) !== 0,
    frequencyVibrato: view.getUint16(offset + 20, true) !== 0,
    envelopeScaling: view.getUint16(offset + 22, true) !== 0,
    frequencyModulation: view.getUint16(offset + 24, true) !== 0,
  }
}
