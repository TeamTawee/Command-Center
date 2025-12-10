// ในไฟล์ vite.config.js

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // เปลี่ยนเป็นชื่อ Repository ของคุณ! (มี / หน้าและหลัง)
  base: '/Command-Center/', 
})