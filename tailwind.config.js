/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // เปลี่ยนจาก Sarabun เป็น Prompt
        sans: ["Prompt", "sans-serif"],
      },
    },
  },
  plugins: [],
}