import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000
  },
  build: {
    outDir: '.',
    emptyOutDir: false,  // Don't delete source files
  },
  optimizeDeps: {
    // Exclude libadlmidi-js from pre-bundling - it's a WebAssembly module
    exclude: ['libadlmidi-js', 'libadlmidi-js/dosbox', 'libadlmidi-js/nuked']
  }
})
