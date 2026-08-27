import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
<<<<<<< HEAD
  // Setting base to './' allows the app to be deployed to a subdirectory
  // (like https://username.github.io/repo-name/) without breaking asset links.
  base: './', 
=======
  // Setting base to '/' for root deployment on Netlify
  base: '/',
>>>>>>> old-slicer/ai-beat-patterns
});