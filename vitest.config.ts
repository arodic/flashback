import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  publicDir: 'public',
  test: {
    browser: {
      enabled: true,
      provider: playwright({
        launch: {
          headless: true,
        }
      }),
      instances: [
        { browser: 'chromium' }
      ],
    },
    include: ['src/**/*.test.ts'],
    testTimeout: 60000,
  },
})
