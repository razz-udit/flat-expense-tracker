import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || (process.env.RENDER ? 'https://flat-expense-tracker-backend.onrender.com' : 'http://127.0.0.1:8000'),
        changeOrigin: true
      },
      '/uploads': {
        target: process.env.VITE_BACKEND_URL || (process.env.RENDER ? 'https://flat-expense-tracker-backend.onrender.com' : 'http://127.0.0.1:8000'),
        changeOrigin: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
        }
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true
  }
})
