/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        arabic: ['"Noto Sans Arabic"', 'sans-serif'],
        sans: ['"Noto Sans Arabic"', 'sans-serif'],
      },
      colors: {
        background: '#0a0b0d',
        surface: '#12141a',
        card: '#1a1d26',
        border: '#2a2d3a',
        'glass-border': 'rgba(201, 165, 90, 0.15)',
        accent: {
          DEFAULT: '#c9a55a',
          light: '#dbbe80',
          dark: '#a8843e',
        },
        text: {
          DEFAULT: '#e8e8ec',
          muted: '#8b8fa4',
        },
        success: '#34d399',
        warning: '#f59e0b',
        danger: '#f87171',
        info: '#60a5fa',
      },
      backgroundImage: {
        'gradient-gold': 'linear-gradient(135deg, #c9a55a 0%, #a8843e 100%)',
        'gradient-surface': 'linear-gradient(180deg, #12141a 0%, #0a0b0d 100%)',
      },
      boxShadow: {
        gold: '0 0 20px rgba(201, 165, 90, 0.15)',
        'gold-sm': '0 0 10px rgba(201, 165, 90, 0.08)',
        'gold-soft': '0 10px 20px -5px rgba(201, 165, 90, 0.15)',
        premium: '0 20px 40px -15px rgba(0, 0, 0, 0.5)',
        card: '0 4px 24px rgba(0, 0, 0, 0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-in': 'slideIn 0.25s ease-out',
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideIn: { from: { transform: 'translateX(12px)', opacity: '0' }, to: { transform: 'translateX(0)', opacity: '1' } },
      },
    },
  },
  plugins: [],
}
