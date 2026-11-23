// Production entry: runs the mock store (internal only) and the public API in one container.
import { spawn } from 'node:child_process'

const procs = [
  ['store', ['--filter', '@glancecart/mock-store', 'start'], { STORE_PORT: '8788' }],
  ['api', ['--filter', '@glancecart/api', 'start'], { STORE_URL: 'http://127.0.0.1:8788' }],
].map(([name, args, env]) => {
  const p = spawn('pnpm', args, { stdio: 'inherit', env: { ...process.env, ...env } })
  p.on('exit', code => {
    console.error(`${name} exited with ${code}; stopping container`)
    process.exit(code ?? 1)
  })
  return p
})
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => procs.forEach(p => p.kill(sig)))
