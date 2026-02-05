/**
 * PrfParser - Parse Flashback .PRF (Profile) files
 * 
 * PRF files define the instrument configuration for a music track:
 * - Which .INS instrument to use for each of 16 slots
 * - Note and velocity offsets per slot
 * - MIDI program number mapping (adlibPrograms)
 * - Track-to-channel mapping (hwChannelNum)
 * - Reference to the MIDI file
 * 
 * Full file structure (753 bytes / 0x2F1):
 *   Offset 0:     instruments[16][30] = 480 bytes
 *   Offset 480:   adlibNotes[16] = 32 bytes (int16 each)
 *   Offset 512:   adlibVelocities[16] = 32 bytes (int16 each)
 *   Offset 544:   timerTicks = 4 bytes (uint32)
 *   Offset 548:   timerMod = 2 bytes (uint16)
 *   Offset 550:   midiFilename[20] = 20 bytes
 *   Offset 570:   adlibDoNotesLookup = 2 bytes (uint16)
 *   Offset 572:   adlibPrograms[16] = 32 bytes (uint16 each)
 *   Offset 604:   mt32Programs[16] = 32 bytes (uint16 each)
 *   Offset 636:   mt32Velocities[16] = 32 bytes (uint16 each)
 *   Offset 668:   mt32Notes[16] = 32 bytes (uint16 each)
 *   Offset 700:   hwChannelNum[16] = 16 bytes
 *   Offset 716:   mt32ProgramNum[16] = 16 bytes
 *   Offset 732:   loopFlag[16] = 16 bytes
 *   Offset 748:   totalDurationTicks = 4 bytes (uint32)
 *   Offset 752:   mt32DoChannelsLookup = 1 byte
 */

export interface PrfData {
  /** Instrument names for each of 16 slots (without .INS extension) */
  instruments: (string | null)[]
  /** Note offset for each slot (AdLib mode) */
  adlibNotes: number[]
  /** Velocity offset for each slot (AdLib mode) */
  adlibVelocities: number[]
  /** Timer ticks value */
  timerTicks: number
  /** Timer mod value */
  timerMod: number
  /** MIDI filename (without path) */
  midiFilename: string
  /** Whether to apply notes lookup by instrument_num vs track_index */
  adlibDoNotesLookup: number
  /** MIDI program numbers - used to map program change events to instrument slots */
  adlibPrograms: number[]
  /** Hardware channel number for each track (maps track index to output channel) */
  hwChannelNum: number[]
  /** Loop flag for each track */
  loopFlag: number[]
  /** Total duration in ticks */
  totalDurationTicks: number
}

const INSTRUMENT_NAME_LEN = 30
const MIDI_FILENAME_LEN = 20
const NUM_CHANNELS = 16

/**
 * Parse a PRF file buffer.
 */
export function parsePrf(buffer: ArrayBuffer): PrfData {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  
  
  // Read 16 instrument names (30 bytes each = 480 bytes)
  const instruments: (string | null)[] = []
  for (let i = 0; i < NUM_CHANNELS; i++) {
    const offset = i * INSTRUMENT_NAME_LEN
    const name = readString(bytes, offset, INSTRUMENT_NAME_LEN)
    instruments.push(name || null)
  }
  
  // Offset 480 (0x1E0): adlibNotes - 16 * int16 = 32 bytes
  const adlibNotes: number[] = []
  for (let i = 0; i < NUM_CHANNELS; i++) {
    adlibNotes.push(view.getInt16(480 + i * 2, true))
  }
  
  // Offset 512 (0x200): adlibVelocities - 16 * int16 = 32 bytes
  const adlibVelocities: number[] = []
  for (let i = 0; i < NUM_CHANNELS; i++) {
    adlibVelocities.push(view.getInt16(512 + i * 2, true))
  }
  
  // Offset 544 (0x220): timerTicks - uint32
  const timerTicks = view.getUint32(544, true)
  
  // Offset 548 (0x224): timerMod - uint16
  const timerMod = view.getUint16(548, true)
  
  // Offset 550 (0x226): MIDI filename - 20 bytes
  const midiFilename = readString(bytes, 550, MIDI_FILENAME_LEN) || ''
  
  // Offset 570 (0x23A): adlibDoNotesLookup - uint16
  const adlibDoNotesLookup = view.getUint16(570, true)
  
  // Offset 572 (0x23C): adlibPrograms - 16 * uint16 = 32 bytes
  // Maps MIDI program numbers to instrument slots
  const adlibPrograms: number[] = []
  for (let i = 0; i < NUM_CHANNELS; i++) {
    adlibPrograms.push(view.getUint16(572 + i * 2, true))
  }
  
  // Skip MT32 data (offsets 604-699)
  // Offset 604: mt32Programs[16] - 32 bytes
  // Offset 636: mt32Velocities[16] - 32 bytes
  // Offset 668: mt32Notes[16] - 32 bytes
  
  // Offset 700 (0x2BC): hwChannelNum - 16 bytes
  // Maps track index to hardware/output channel
  const hwChannelNum: number[] = []
  for (let i = 0; i < NUM_CHANNELS; i++) {
    hwChannelNum.push(view.getUint8(700 + i))
  }
  
  // Offset 716: mt32ProgramNum - 16 bytes (skip)
  
  // Offset 732 (0x2DC): loopFlag - 16 bytes
  const loopFlag: number[] = []
  for (let i = 0; i < NUM_CHANNELS; i++) {
    loopFlag.push(view.getUint8(732 + i))
  }
  
  // Offset 748 (0x2EC): totalDurationTicks - uint32
  const totalDurationTicks = buffer.byteLength >= 752 ? view.getUint32(748, true) : 0
  
  
  return {
    instruments,
    adlibNotes,
    adlibVelocities,
    timerTicks,
    timerMod,
    midiFilename,
    adlibDoNotesLookup,
    adlibPrograms,
    hwChannelNum,
    loopFlag,
    totalDurationTicks,
  }
}

/**
 * Read a null-terminated string from a byte array.
 */
function readString(bytes: Uint8Array, offset: number, maxLen: number): string | null {
  let end = offset
  while (end < offset + maxLen && bytes[end] !== 0) {
    end++
  }
  if (end === offset) return null
  
  const slice = bytes.slice(offset, end)
  return String.fromCharCode(...slice).trim()
}
