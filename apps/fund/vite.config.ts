import { defineConfig, type Plugin } from 'vite'

// The funding page is fully static: it talks only to the user's wallet (TON Connect),
// never to the GlanceCart API. So it can be hosted for free (GitHub Pages) or served
// by the API under /fund/. Relative base makes both work.
//
// TON Connect wallets fetch tonconnect-manifest.json over public HTTPS. When
// FUND_PUBLIC_URL is set at build time (e.g. https://<user>.github.io/<repo>/),
// the manifest is emitted next to index.html with that URL.
function tonConnectManifest(): Plugin {
  return {
    name: 'tonconnect-manifest',
    generateBundle() {
      const url = process.env.FUND_PUBLIC_URL?.replace(/\/?$/, '/')
      if (!url) return
      this.emitFile({
        type: 'asset',
        fileName: 'tonconnect-manifest.json',
        source: JSON.stringify({ url, name: 'GlanceCart', iconUrl: `${url}icon.png` }, null, 2),
      })
    },
  }
}

export default defineConfig({ base: './', build: { target: 'es2022' }, plugins: [tonConnectManifest()] })
