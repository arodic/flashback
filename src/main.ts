/**
 * Flashback Cutscene Viewer - Entry Point
 */

import { CutscenePlayer } from './CutscenePlayer'
import type { Cutscene } from './types'

async function loadCutscene(name: string): Promise<Cutscene> {
  const response = await fetch(`/data/${name}.json`)
  if (!response.ok) {
    throw new Error(`Failed to load cutscene: ${name}`)
  }
  return response.json()
}

// Wait for DOM
document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('canvas-container')
  const btnPrev = document.getElementById('btn-prev')
  const btnPlay = document.getElementById('btn-play') as HTMLButtonElement
  const btnNext = document.getElementById('btn-next')
  const frameInfo = document.getElementById('frame-info')
  const cutsceneSelect = document.getElementById('cutscene-select') as HTMLSelectElement
  const nativeResCheckbox = document.getElementById('native-res') as HTMLInputElement
  
  if (!container || !btnPrev || !btnPlay || !btnNext || !frameInfo || !cutsceneSelect || !nativeResCheckbox) {
    console.error('Required DOM elements not found')
    return
  }
  
  // Create player
  const player = new CutscenePlayer({
    container,
    scale: 3
  })
  
  // Handle native resolution toggle (pixelated mode)
  nativeResCheckbox.addEventListener('change', () => {
    player.setPixelated(nativeResCheckbox.checked, 3)
  })
  
  // Update frame info display
  player.onStateChange((state) => {
    frameInfo.textContent = `Frame: ${state.currentFrame + 1} / ${state.totalFrames}`
    btnPlay.textContent = state.isPlaying ? '⏸ Pause' : '▶ Play'
  })
  
  async function loadAndPlay(cutsceneName: string) {
    try {
      frameInfo!.textContent = 'Loading...'
      const cutscene = await loadCutscene(cutsceneName)
      
      console.log('Loaded cutscene:', cutscene.name)
      console.log('Shapes:', cutscene.shapes.length)
      console.log('Palettes:', cutscene.palettes.length)
      console.log('Subscenes:', cutscene.script.subscenes.length)
      
      let totalFrames = 0
      for (const sub of cutscene.script.subscenes) {
        totalFrames += sub.frames.length
      }
      console.log('Total frames:', totalFrames)
      
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
  
  // Handle cutscene selection change
  cutsceneSelect.addEventListener('change', () => {
    player.stop()
    loadAndPlay(cutsceneSelect.value)
  })
  
  // Button handlers
  btnPrev.addEventListener('click', () => {
    player.prevFrame()
  })
  
  btnPlay.addEventListener('click', () => {
    const isPlaying = player.togglePlay()
    btnPlay.textContent = isPlaying ? '⏸ Pause' : '▶ Play'
  })
  
  btnNext.addEventListener('click', () => {
    player.nextFrame()
  })
  
  // Keyboard controls
  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowLeft':
        player.prevFrame()
        break
      case 'ArrowRight':
        player.nextFrame()
        break
      case ' ':
        e.preventDefault()
        player.togglePlay()
        break
      case 'Home':
        player.reset()
        break
    }
  })
})
