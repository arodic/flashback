/**
 * CutsceneLoader - Loads Flashback cutscene data
 * 
 * Loads CMD and POL binary files and returns a Cutscene object.
 */

import type { Cutscene } from './types'
import { parseCMD, parsePOL } from './CutsceneParser'

export class CutsceneLoader {
  private basePath: string = ''

  /**
   * Set the base path for loading cutscene files.
   * Returns this for chaining.
   */
  setBasePath(path: string): this {
    this.basePath = path
    return this
  }

  /**
   * Load a cutscene by name.
   * 
   * @param name - Cutscene name (e.g., 'INTRO' or 'intro')
   * @param onLoad - Callback when loading completes
   * @param onProgress - Progress callback (called for each file)
   * @param onError - Error callback
   */
  load(
    name: string,
    onLoad: (cutscene: Cutscene) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void
  ): void {
    const upperName = name.toUpperCase()
    const cmdUrl = this.basePath + upperName + '.CMD'
    const polUrl = this.basePath + upperName + '.POL'

    // Track loading progress
    let cmdBuffer: ArrayBuffer | null = null
    let polBuffer: ArrayBuffer | null = null
    let loadedCount = 0

    const checkComplete = () => {
      if (cmdBuffer && polBuffer) {
        try {
          const cutscene = this.parse(cmdBuffer, polBuffer, upperName)
          onLoad(cutscene)
        } catch (e) {
          if (onError) {
            onError(e)
          } else {
            console.error('CutsceneLoader: Failed to parse cutscene:', e)
          }
        }
      }
    }

    const onFileLoaded = () => {
      loadedCount++
      if (onProgress) {
        // Synthetic progress event
        const event = new ProgressEvent('progress', {
          loaded: loadedCount,
          total: 2,
          lengthComputable: true
        })
        onProgress(event)
      }
    }

    // Load CMD file
    fetch(cmdUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        return response.arrayBuffer()
      })
      .then(buffer => {
        cmdBuffer = buffer
        onFileLoaded()
        checkComplete()
      })
      .catch(e => {
        if (onError) {
          onError(e)
        } else {
          console.error(`CutsceneLoader: Failed to load ${cmdUrl}:`, e)
        }
      })

    // Load POL file
    fetch(polUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        return response.arrayBuffer()
      })
      .then(buffer => {
        polBuffer = buffer
        onFileLoaded()
        checkComplete()
      })
      .catch(e => {
        if (onError) {
          onError(e)
        } else {
          console.error(`CutsceneLoader: Failed to load ${polUrl}:`, e)
        }
      })
  }

  /**
   * Load a cutscene asynchronously.
   * 
   * @param name - Cutscene name (e.g., 'INTRO' or 'intro')
   * @returns Promise resolving to the loaded Cutscene
   */
  loadAsync(name: string, onProgress?: (event: ProgressEvent) => void): Promise<Cutscene> {
    return new Promise((resolve, reject) => {
      this.load(name, resolve, onProgress, reject)
    })
  }

  /**
   * Parse CMD and POL buffers into a Cutscene object.
   * 
   * @param cmdBuffer - ArrayBuffer containing CMD data
   * @param polBuffer - ArrayBuffer containing POL data
   * @param name - Cutscene name for the result
   * @returns Parsed Cutscene object
   */
  parse(cmdBuffer: ArrayBuffer, polBuffer: ArrayBuffer, name: string): Cutscene {
    const script = parseCMD(cmdBuffer)
    const { shapes, palettes } = parsePOL(polBuffer)

    return {
      name,
      shapes,
      palettes,
      script
    }
  }
}
