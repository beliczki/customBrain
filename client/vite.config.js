import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/capture': 'http://localhost:3000',
      '/search': 'http://localhost:3000',
      '/recent': 'http://localhost:3000',
      '/stats': 'http://localhost:3000',
      '/export': 'http://localhost:3000',
    },
  },
});
