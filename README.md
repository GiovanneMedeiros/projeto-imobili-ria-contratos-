# Gerador de Contratos Miellis

Aplicação interna para gerar documentos a partir dos modelos aprovados pela Imobiliária Miellis. A estrutura está sendo construída em etapas; o conteúdo jurídico real deve ser fornecido pela imobiliária.

## Requisitos

- Node.js 22 ou superior
- npm 10 ou superior

Este workspace usa Node 22.23.3 (`.nvmrc`). Caso esteja usando a cópia local instalada neste Mac Intel, adicione-a ao `PATH` antes de usar npm:

```sh
export PATH="$HOME/.local/share/mellis-tools/node-v22.23.3-darwin-x64/bin:$PATH"
```

## Executar

```sh
npm install
npm run dev
```

Em outro terminal, inicie a API com `npm run dev:api`; alternativamente, use `npm run dev:all` quando as portas 5173 e 3333 estiverem livres.

O modo de demonstração pode ser habilitado com `VITE_DEMO_MODE=true`. Ele usa somente dados de desenvolvimento e não deve ser usado para contratos ou dados reais. Para autenticação real, configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env.local`.

## Estrutura

- `src/`: aplicação React, páginas, componentes, serviços e tipos do frontend.
- `server/`: API Express em TypeScript (`npm run dev:api`; health check em `/api/health`).
- `supabase/migrations/`: esquema SQL, políticas RLS, storage privado e histórico dos modelos.
- `public/miellis-logo.png`: logo oficial obtida no site da Imobiliária Miellis.

Nenhum contrato jurídico é incluído. O modelo demonstrativo, quando habilitado, é apenas texto técnico para testar substituição de placeholders.

## Supabase

1. Crie um projeto Supabase e configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env.local`.
2. Aplique as migrations em `supabase/migrations/` em ordem no SQL Editor do projeto. As migrations `202609280001_template_source_pdfs.sql` e `202609280002_template_pdf_fields.sql` habilitam o armazenamento privado do PDF original e das posições dos campos visuais; `202609280003_contract_drafts.sql` cria a tabela de rascunhos e `202609280004_contract_status_values.sql` amplia os status aceitos em `contracts` (convertendo `review` em `in_review`).
3. Convide colaboradores pelo Supabase Auth. O trigger cria o perfil como `broker`. Para o primeiro administrador, atualize `profiles.role` para `admin` no SQL Editor do projeto; depois, administradores existentes podem ajustar funções na área interna.
4. Defina `VITE_DEMO_MODE=false` e reinicie o Vite.

A chave `anon` é pública por projeto; o acesso é restringido por Auth e RLS. Nunca use a chave `service_role` no frontend. Antes de produção, configure SMTP, domínio autorizado, backup/retention e revise as políticas com o administrador do Supabase.