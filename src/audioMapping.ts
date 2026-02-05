/**
 * Audio Mapping - Maps cutscene names to their PRF and MIDI files
 * 
 * Based on REminiscence's _musicTableDOS and PrfPlayer::_names arrays.
 * The PRF files contain instrument mappings and reference the MIDI file.
 */

/**
 * Mapping of cutscene names to their PRF filenames.
 * PRF files contain the instrument configuration and MIDI filename.
 */
const cutscenePrfMap: Record<string, string> = {
  // Main intro sequence
  'intro1': 'INTROL3',
  'intro2': 'INTROL3',
  
  // Opening/start
  'debut': 'REVEIL3',
  
  // Object pickup
  'objet': 'OBJET3',
  
  // ID card
  'carte': 'OBJET3',
  
  // Generator
  'gen': 'RECHAGE3',
  
  // Fall scene
  'chute': 'CHUTEVI3',
  
  // Disintegration
  'desinteg': 'DESINTE3',
  
  // Hologram
  'holoseq': 'HOLO3',
  
  // Bridge
  'pont': 'PONT3',
  
  // Elevator  
  'asc': 'MISSION3',
  
  // Metro
  'metro': 'DONNER3',
  
  // Mission briefing
  'missions': 'MISSION3',
  
  // Memory scene
  'memo': 'MEMORY3',
  
  // Taxi
  'taxi': 'TAXI3',
  
  // Travel
  'voyage': 'VOYAGE3',
  
  // Teleporter  
  'teleport': 'TELEPOR3',
  
  // Lift
  'lift': 'LIFT3',
  
  // Aliens meeting
  'espions': 'DONNER3',
  
  // Login
  'log': 'MISSION3',
  
  // Ending
  'fin': 'END31',
  
  // Generator explosion
  'genexp': 'GENERAT3',
  
  // Game over
  'over': 'GAMEOVE3',
  
  // Lock
  'serrure': 'MISSION3',
  
  // Map
  'map': 'MISSION3',
  
  // Score display
  'score': 'MISSION3',
  
  // Camera
  'camera': 'CAPTURE3',
  
  // Bridge entry
  'alimpont': 'PONT3',
  
  // Recharge
  'recharge': 'RECHARG3',
  
  // Mission validation
  'misvalid': 'MISVALI3',
}

/**
 * Get the PRF filename for a cutscene (without extension).
 * Returns null if no mapping exists.
 */
export function getPrfName(cutsceneName: string): string | null {
  const name = cutsceneName.toLowerCase()
  return cutscenePrfMap[name] ?? null
}

/**
 * Get the MIDI filename for a cutscene (without extension).
 * This is now derived from the PRF file, but we keep this for backward compatibility.
 */
export function getMidiName(cutsceneName: string): string | null {
  // The MIDI name is stored inside the PRF file
  // For now, return the PRF name - the loader will extract the MIDI name
  return getPrfName(cutsceneName)
}
