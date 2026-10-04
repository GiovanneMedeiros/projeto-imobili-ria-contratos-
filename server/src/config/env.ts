import 'dotenv/config'
import { z } from 'zod'

const environmentSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3333),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
})

export const env = environmentSchema.parse(process.env)