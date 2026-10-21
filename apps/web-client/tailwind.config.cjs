const { heroui } = require('@heroui/react');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        toka: {
          navy: '#002A5E',
          deep: '#00194C',
          ink: '#1C244B',
          slate: '#334155',
          mist: '#F5F6F8',
          steel: '#8FAAC3',
        },
      },
    },
  },
  darkMode: 'class',
  plugins: [
    heroui({
      themes: {
        light: {
          layout: {
            radius: {
              small: '8px',
              medium: '11px',
              large: '16px',
            },
          },
          colors: {
            background: '#F5F6F8',
            foreground: '#1C244B',
            divider: 'rgba(0, 42, 94, 0.12)',
            focus: '#002A5E',
            primary: {
              50: '#E7EEF6',
              100: '#C5D4E8',
              200: '#8FAAC3',
              300: '#5C7EA3',
              400: '#2E5484',
              500: '#002A5E',
              600: '#002454',
              700: '#00194C',
              800: '#001238',
              900: '#000C24',
              DEFAULT: '#002A5E',
              foreground: '#FFFFFF',
            },
          },
        },
      },
    }),
  ],
};
