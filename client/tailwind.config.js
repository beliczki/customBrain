/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: 'var(--surface)',
        'surface-el': 'var(--surface-elevated)',
        accent: 'var(--accent-blue)',
        'accent-dark': 'var(--accent-blue-dark)',
        'txt': 'var(--text-primary)',
        'txt-sec': 'var(--text-secondary)',
        'txt-ter': 'var(--text-tertiary)',
      },
      backgroundColor: {
        primary: 'var(--primary-bg)',
      },
      borderColor: {
        subtle: 'var(--border-subtle)',
        solid: 'var(--border-solid)',
      },
    },
  },
  plugins: [],
};
