import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/TacticusDamageCalc/',
  build: {
    // Increase chunk size warning limit (default is 500KB)
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor libraries
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-state': ['zustand'],
          'vendor-ui': ['lucide-react'],
          // Split large data files
          'data-bosses': ['./src/assets/data/guildBossUnits.json'],
          'data-characters': ['./src/assets/data/characters.json'],
          'data-abilities': ['./src/assets/data/abilities.json'],
          'data-items': ['./src/assets/data/items.json'],
        },
      },
    },
  },
})
