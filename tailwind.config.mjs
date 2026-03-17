/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f4f8',
          100: '#d9e2ec',
          200: '#bcccdc',
          300: '#9fb3c8',
          400: '#829ab1',
          500: '#627d98',
          600: '#486581',
          700: '#334e68',
          800: '#1b2a4a',
          900: '#0a1628',
          950: '#060e1a',
        },
        gold: {
          50: '#fef9e7',
          100: '#fdf0c4',
          200: '#fce588',
          300: '#fad54d',
          400: '#f7c325',
          500: '#d4a017',
          600: '#b8860b',
          700: '#946b09',
          800: '#7a580e',
          900: '#654812',
        },
      },
      fontFamily: {
        heading: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
