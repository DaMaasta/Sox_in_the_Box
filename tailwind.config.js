/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        c: {
          bg:       'var(--c-bg)',
          surface:  'var(--c-surface)',
          'surface-2': 'var(--c-surface-2)',
          'surface-3': 'var(--c-surface-3)',
          'text-1': 'var(--c-text-1)',
          'text-2': 'var(--c-text-2)',
          'text-3': 'var(--c-text-3)',
          'text-4': 'var(--c-text-4)',
          border:   'var(--c-border)',
          'border-2': 'var(--c-border-2)',
          accent:   'var(--c-accent-bg)',
          'dark-btn': 'var(--c-dark-btn)',
          'dark-btn-text': 'var(--c-dark-btn-text)',
          brand:    'var(--c-brand)',
        },
      },
    },
  },
  plugins: [],
}
