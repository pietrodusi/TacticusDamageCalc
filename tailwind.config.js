/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warhammer 40K inspired color palette
        imperial: {
          gold: '#D4AF37',
          red: '#8B0000',
          blue: '#1E3A5F',
        },
        chaos: {
          black: '#1a1a2e',
          purple: '#4a0080',
          red: '#8B0000',
        },
        xenos: {
          green: '#2D5A27',
          blue: '#0077B6',
        },
        rarity: {
          common: '#9CA3AF',
          uncommon: '#22C55E',
          rare: '#3B82F6',
          epic: '#A855F7',
          legendary: '#F59E0B',
        }
      },
      fontFamily: {
        display: ['Cinzel', 'serif'],
        body: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
