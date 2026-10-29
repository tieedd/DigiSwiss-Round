/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        digi: {
          dark: '#080d1a',
          card: '#0f172a',
          border: '#1e293b',
          blue: '#00e5ff',
          orange: '#ff6d00'
        }
      }
    },
  },
  plugins: [],
}
