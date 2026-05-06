/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#0a0f1a',
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155',
        },
        accent: {
          DEFAULT: '#6366f1',
          50: '#eef2ff',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
        brand: {
          emerald: '#10b981',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
      },
      maxWidth: {
        prose: '70ch',
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: '70ch',
          },
        },
      },
    },
  },
  plugins: [],
};
