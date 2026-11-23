// Points the packaged glasses app at a public API origin (e.g. a free Cloudflare
// quick tunnel). Updates app.json's network whitelist and apps/glasses/.env.production.
// Usage: node scripts/set-api-origin.mjs https://something.trycloudflare.com
import { readFileSync, writeFileSync } from 'node:fs'

const origin = process.argv[2]?.replace(/\/+$/, '')
if (!origin || !/^https:\/\/[a-z0-9.-]+$/i.test(origin)) {
  console.error('Usage: node scripts/set-api-origin.mjs https://<host>   (an HTTPS origin, no path)')
  process.exit(1)
}
const manifestPath = new URL('../apps/glasses/app.json', import.meta.url)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const net = manifest.permissions.find(p => p.name === 'network')
net.whitelist = [origin]
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
writeFileSync(
  new URL('../apps/glasses/.env.production', import.meta.url),
  `# Public (non-secret) URLs baked into the packaged .ehpk. Must match app.json's network whitelist.\nVITE_API_URL=${origin}\n`,
)
console.log(`Glasses app now uses ${origin}. Also set PUBLIC_URL=${origin} in .env, restart the API, then: pnpm --filter @glancecart/glasses pack`)
