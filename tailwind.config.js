/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Every page already uses Tailwind's `teal-*` utilities for primary
      // buttons/links/accents (31+ call sites) — overriding the scale here
      // reskins the whole app consistently from one place, a deeper and
      // more desaturated "court" teal instead of stock Tailwind's brighter
      // cyan-leaning teal, aiming for the same clean/professional sports-
      // league feel as league.cdta.co.in without copying its actual design.
      colors: {
        teal: {
          50: '#eef7f6',
          100: '#d3ebe8',
          200: '#a8d8d2',
          300: '#74bfb5',
          400: '#479f93',
          500: '#2f8377',
          600: '#23695f',
          700: '#1c554d',
          800: '#17443d',
          900: '#123530',
        },
        // A single warm accent (tennis-ball gold) used sparingly — nav
        // active/hover underline, small highlights — so the theme isn't
        // monochrome without introducing a second full color scale.
        accent: {
          400: '#f2b84b',
          500: '#e6a532',
          600: '#c98a1f',
        },
      },
    },
  },
  plugins: [],
};
