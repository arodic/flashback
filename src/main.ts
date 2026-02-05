/**
 * Flashback Cutscene Viewer - Entry Point
 */

import { CutscenePlayer, VolumeModel, ChannelInfo } from './CutscenePlayer'
import { CutsceneLoader } from './CutsceneLoader'
import type { Cutscene } from './types'

// Volume model names for display
const volumeModelNames: Record<number, string> = {
  [VolumeModel.AUTO]: 'Auto',
  [VolumeModel.GENERIC]: 'Generic (Linear)',
  [VolumeModel.NATIVE_OPL3]: 'Native OPL3',
  [VolumeModel.DMX]: 'DMX',
  [VolumeModel.APOGEE]: 'Apogee',
  [VolumeModel.SB16_9X]: 'SB16 9X',
  [VolumeModel.DMX_FIXED]: 'DMX Fixed',
  [VolumeModel.APOGEE_FIXED]: 'Apogee Fixed',
}

// Create loader instance with path to DATA directory
const cutsceneLoader = new CutsceneLoader().setBasePath('/DATA/')

async function loadCutscene(name: string): Promise<Cutscene> {
  return cutsceneLoader.loadAsync(name)
}

// Wait for DOM
document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('canvas-container')
  const btnPrev = document.getElementById('btn-prev')
  const btnPlay = document.getElementById('btn-play') as HTMLButtonElement
  const btnNext = document.getElementById('btn-next')
  const frameInfo = document.getElementById('frame-info')
  const audioInfo = document.getElementById('audio-info')
  const cutsceneSelect = document.getElementById('cutscene-select') as HTMLSelectElement
  const channelRows = document.getElementById('channel-rows')
  
  if (!container || !btnPrev || !btnPlay || !btnNext || !frameInfo || !cutsceneSelect) {
    console.error('Required DOM elements not found')
    return
  }
  
  // Create player (renders at native 256x224, CSS scaled 3x for display)
  const player = new CutscenePlayer({
    container,
    displayScale: 3,
    midiBasePath: '/DATA/',
    enableAudio: true
  })
  
  // Update frame info display
  player.onStateChange((state) => {
    frameInfo.textContent = `Frame: ${state.currentFrame + 1} / ${state.totalFrames}`
    btnPlay.textContent = state.isPlaying ? '⏸ Pause' : '▶ Play'
  })
  
  // Update MIDI/audio info display
  player.onMidiStateChange((state) => {
    if (audioInfo) {
      if (state.loaded) {
        const currentTime = formatTime(state.position)
        const duration = formatTime(state.duration)
        audioInfo.textContent = `OPL3: ${currentTime} / ${duration}`
        audioInfo.classList.remove('no-audio')
        audioInfo.classList.add('midi')
      } else {
        audioInfo.textContent = state.error || 'No audio'
        audioInfo.classList.add('no-audio')
        audioInfo.classList.remove('midi')
      }
    }
  })
  
  // Instrument mapper
  let availableInstruments: string[] = []
  
  function updateInstrumentMapper(channels: ChannelInfo[]) {
    if (!channelRows) return
    
    // Get available instruments from player
    availableInstruments = player.getAvailableInstruments()
    
    channelRows.innerHTML = ''
    
    for (const ch of channels) {
      // Skip channels with no activity
      if (!ch.instrumentName) continue
      
      const row = document.createElement('div')
      row.className = 'channel-row'
      if (ch.muted) row.classList.add('muted')
      row.dataset.channel = String(ch.channel)
      
      // Mute checkbox
      const muteCheckbox = document.createElement('input')
      muteCheckbox.type = 'checkbox'
      muteCheckbox.checked = !ch.muted
      muteCheckbox.title = 'Enable/disable channel'
      muteCheckbox.addEventListener('change', () => {
        if (muteCheckbox.checked) {
          player.unmuteChannel(ch.channel)
        } else {
          player.muteChannel(ch.channel)
        }
        row.classList.toggle('muted', !muteCheckbox.checked)
      })
      
      // Channel number
      const chNum = document.createElement('span')
      chNum.className = 'ch-num'
      chNum.textContent = String(ch.channel)
      
      // Instrument dropdown
      const instSelect = document.createElement('select')
      instSelect.title = 'Change instrument'
      
      // Add options
      for (const inst of availableInstruments) {
        const option = document.createElement('option')
        option.value = inst
        option.textContent = inst
        if (inst.toLowerCase() === ch.instrumentName?.toLowerCase()) {
          option.selected = true
        }
        instSelect.appendChild(option)
      }
      
      instSelect.addEventListener('change', async () => {
        const success = await player.setChannelInstrument(ch.channel, instSelect.value)
        if (!success) {
          // Revert to previous
          instSelect.value = ch.instrumentName || ''
        }
      })
      
      // Octave offset
      const octaveInput = document.createElement('input')
      octaveInput.type = 'number'
      octaveInput.min = '-4'
      octaveInput.max = '4'
      octaveInput.value = String(ch.octaveOffset || 0)
      octaveInput.title = 'Octave offset'
      
      octaveInput.addEventListener('change', async () => {
        const offset = parseInt(octaveInput.value) || 0
        await player.setChannelOctaveOffset(ch.channel, offset)
      })
      
      row.appendChild(muteCheckbox)
      row.appendChild(chNum)
      row.appendChild(instSelect)
      row.appendChild(octaveInput)
      
      channelRows.appendChild(row)
    }
  }
  
  function formatTime(seconds: number): string {
    if (!isFinite(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  
  async function loadAndPlay(cutsceneName: string) {
    try {
      frameInfo!.textContent = 'Loading...'
      if (audioInfo) {
        audioInfo.textContent = 'Loading audio...'
        audioInfo.classList.add('no-audio')
        audioInfo.classList.remove('midi')
      }
      
      const cutscene = await loadCutscene(cutsceneName)
      
      let totalFrames = 0
      for (const sub of cutscene.script.subscenes) {
        totalFrames += sub.frames.length
      }
      
      player.loadCutscene(cutscene)
      
      const state = player.getState()
      if (state) {
        frameInfo!.textContent = `Frame: ${state.currentFrame + 1} / ${state.totalFrames}`
      }
    } catch (error) {
      console.error('Failed to load cutscene:', error)
      frameInfo!.textContent = 'Failed to load cutscene data'
    }
  }
  
  // Load initial cutscene
  await loadAndPlay(cutsceneSelect.value)
  
  // Handle cutscene selection change (user gesture - good time to init audio)
  cutsceneSelect.addEventListener('change', async () => {
    player.stop()
    // This is a user gesture, so ensure audio is initialized
    await player.ensureAudioInitialized()
    await loadAndPlay(cutsceneSelect.value)
  })
  
  // Button handlers
  btnPrev.addEventListener('click', () => {
    player.prevFrame()
  })
  
  btnPlay.addEventListener('click', async () => {
    // Ensure audio is initialized on user gesture
    await player.ensureAudioInitialized()
    const isPlaying = await player.togglePlay()
    btnPlay.textContent = isPlaying ? '⏸ Pause' : '▶ Play'
  })
  
  btnNext.addEventListener('click', () => {
    player.nextFrame()
  })
  
  // Keyboard controls
  document.addEventListener('keydown', async (e) => {
    switch (e.key) {
      case 'ArrowLeft':
        player.prevFrame()
        break
      case 'ArrowRight':
        player.nextFrame()
        break
      case ' ':
        e.preventDefault()
        await player.ensureAudioInitialized()
        await player.togglePlay()
        break
      case 'Home':
        player.reset()
        break
      // Volume model shortcuts (0-7)
      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7': {
        const model = parseInt(e.key) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
        player.setVolumeModel(model)
        if (audioInfo) {
          audioInfo.textContent = `Vol: ${volumeModelNames[model]}`
        }
        break
      }
    }
  })
  
  
  // Update instrument mapper when channels change
  player.onChannelChange((channels) => {
    updateInstrumentMapper(channels)
  })
})
