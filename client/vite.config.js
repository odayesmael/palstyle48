import { defineConfig, splitVendorChunkPlugin } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    splitVendorChunkPlugin(), // splits node_modules into a separate cacheable chunk
  ],

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },

  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 600,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Each group cached independently — update one without busting others
        manualChunks: {
          'vendor-react':   ['react', 'react-dom', 'react-router-dom'],
          'vendor-zustand': ['zustand'],
          'vendor-lucide':  ['lucide-react'],
          'vendor-date':    ['date-fns'],
          'vendor-axios':   ['axios'],
        },
      },
    },
  },

  // Pre-bundle heavy deps on first dev server start — no waterfall on page load
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react-router-dom',
      'zustand', 'lucide-react', 'axios', 'date-fns',
    ],
  },
})
