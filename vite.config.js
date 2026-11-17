import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Serves /api/rpc during `npm run dev` using the same handler (in-memory storage).
const devApi = () => ({
  name: 'dev-api',
  configureServer(server) {
    server.middlewares.use('/api/rpc', async (req, res) => {
      let raw = ''; for await (const c of req) raw += c
      req.body = raw ? JSON.parse(raw) : {}
      res.status = c => { res.statusCode = c; return res }
      res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)) }
      const { default: handler } = await server.ssrLoadModule('/api/rpc.js')
      handler(req, res)
    })
  },
})
export default defineConfig({ plugins: [react(), devApi()] })
