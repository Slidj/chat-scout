import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import path from 'path';
import {defineConfig} from 'vite';

import { resolveMediaUrl } from './server';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      legacy({
        targets: ['chrome >= 39', 'ios >= 10', 'android >= 5'],
        additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      }),
      {
        name: 'api-media-resolver',
        configureServer(server) {
          server.middlewares.use('/api/resolve-media', async (req, res) => {
            const urlObj = new URL(req.url || '', 'http://localhost:3000');
            const targetUrl = urlObj.searchParams.get('url') || '';
            if (!targetUrl) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'Параметр url обов’язковий' }));
              return;
            }
            try {
              const result = await resolveMediaUrl(targetUrl);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
