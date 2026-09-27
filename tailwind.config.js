/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        fedo: {
          bg: '#0a0a0f',
          surface: '#12121a',
          surfaceHover: '#1a1a24',
          border: '#2a2a3a',
          primary: '#00d4ff',
          primaryDim: '#00d4ff40',
          secondary: '#ff00aa',
          text: '#e8e8f0',
          textDim: '#8888a0',
          success: '#00ff88',
          warning: '#ffaa00',
          error: '#ff3355',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}