/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#111111',
        card: '#1a1a1a',
        border: '#2a2a2a',
        green: { DEFAULT: '#00c9a7', dark: '#00a88a' },
        yellow: { DEFAULT: '#f59e0b', dark: '#d97706' },
        red: { DEFAULT: '#ef4444', dark: '#dc2626' },
        blue: { DEFAULT: '#3b82f6', dark: '#2563eb' },
        purple: { DEFAULT: '#8b5cf6', dark: '#7c3aed' },
      },
      fontFamily: { sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Helvetica Neue', 'sans-serif'] },
    },
  },
  plugins: [],
}
