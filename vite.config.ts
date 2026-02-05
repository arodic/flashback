import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000
  },
  optimizeDeps: {
    // Exclude libadlmidi-js from pre-bundling - it's a WebAssembly module
    exclude: ['libadlmidi-js', 'libadlmidi-js/dosbox', 'libadlmidi-js/nuked']
  }
})
