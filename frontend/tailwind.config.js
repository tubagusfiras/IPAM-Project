/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark mode - dari monitoring v2
        dark: {
          bg:       '#080d1a',
          bg2:      '#0d1526',
          bg3:      '#111d33',
          accent:   '#52a0ff',
          accent2:  '#38e8c6',
          accent3:  '#f97316',
          success:  '#22c55e',
          warning:  '#f59e0b',
          danger:   '#ef4444',
          text:     '#e2eaf7',
        },
        // Light mode - dari monitoring v2
        light: {
          bg:       '#dce4f0',
          bg2:      '#e6edf7',
          bg3:      '#d2daea',
          accent:   '#2563b1',
          accent2:  '#0d9488',
          accent3:  '#ea6c10',
          success:  '#16a34a',
          warning:  '#d97706',
          danger:   '#dc2626',
          text:     '#0f1923',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        'sm':  '6px',
        'DEFAULT': '10px',
        'lg':  '14px',
        'xl':  '18px',
        '2xl': '24px',
      },
      boxShadow: {
        'soft': '0 2px 12px rgba(0,0,0,0.07)',
        'card': '0 4px 24px rgba(0,0,0,0.4)',
        'lg':   '0 12px 48px rgba(0,0,0,0.6)',
        'light-card': '0 2px 12px rgba(0,0,0,0.07)',
        'light-lg':   '0 8px 32px rgba(0,0,0,0.11)',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(.4,0,.2,1)',
      },
    },
  },
  plugins: [],
}
