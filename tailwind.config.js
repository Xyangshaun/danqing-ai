/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#1a1a1a',
          800: '#2d2d2d',
          700: '#404040',
          600: '#595959',
          500: '#737373',
        },
        rice: {
          50: '#fdfcf9',
          100: '#f9f6f0',
          200: '#f5f2eb',
          300: '#ede8df',
        },
        cinnabar: '#c41e3a',
        stone: '#2e5fa1',
        gold: '#d4af37',
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', 'serif'],
        sans: ['"Noto Sans SC"', 'sans-serif'],
      },
      animation: {
        'ink-spread': 'inkSpread 3s ease-out forwards',
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.6s ease-out forwards',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        inkSpread: {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '50%': { opacity: '0.8' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
