import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5190,
    strictPort: false,
    proxy: {
      // Same unified FoodFlow backend as the other three panels.
      '/api': {
        target: 'http://localhost:5100',
        changeOrigin: true
      }
    }
  }
});
