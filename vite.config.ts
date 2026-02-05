import { defineConfig } from 'vite'

export default defineConfig({
  base: './',  // Relative paths for subdirectory deployment (GitHub Pages, etc.)
  server: {
    port: 3000
  },
  build: {
    outDir: '.',
    emptyOutDir: false,  // Don't delete source files
    rollupOptions: {
      output: {
        // Stable filenames without hashes
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  },
  optimizeDeps: {
    // Exclude libadlmidi-js from pre-bundling - it's a WebAssembly module
    exclude: ['libadlmidi-js', 'libadlmidi-js/dosbox', 'libadlmidi-js/nuked']
  }
})
