import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { env } from './config/env.js'
import { documentScanRouter } from './routes/documentScan.js'

export const app = express()

app.disable('x-powered-by')
app.use(helmet())
app.use(cors({ origin: env.WEB_ORIGIN }))
app.use('/api/documents', documentScanRouter)
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'miellis-api' })
})

app.use((_request, response) => {
  response.status(404).json({ message: 'Recurso não encontrado.' })
})