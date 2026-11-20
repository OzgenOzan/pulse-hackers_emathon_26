import { defineConfig, type Plugin } from 'vite';

/** The public Pages build must not turn up in search results. */
const noindex: Plugin = {
  name: 'pages-noindex',
  transformIndexHtml: {
    order: 'post',
    handler: html => html.replace('<head>', '<head>\n    <meta name="robots" content="noindex">'),
  },
};

export default defineConfig(({ mode }) => ({
  ...(mode === 'pages' ? {
    base: './',
    worker: { format: 'es' as const },
    plugins: [noindex],
    build: { outDir: 'dist-pages' },
  } : {}),
  optimizeDeps: { exclude: ['pyodide'] },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8000' } },
}));
