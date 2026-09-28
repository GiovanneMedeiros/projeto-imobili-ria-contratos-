import { app } from './app.js'
import { env } from './config/env.js'

app.listen(env.PORT, () => {
  console.info(`Miellis API disponível na porta ${env.PORT}`)
})