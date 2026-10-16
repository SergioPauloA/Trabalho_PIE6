# SuperValidade API

API sem login em **Fastify + TypeScript**, com **Prisma ORM 7** e **PostgreSQL 17**. Validações em Zod, Swagger interativo e testes com banco real.

## Executar tudo pelo Docker

Com Docker Desktop aberto, na pasta `backend/`:

```sh
docker compose up --build -d --wait
docker compose --profile tools run --rm seed
```

O Compose sobe o PostgreSQL, aplica as migrações e só então inicia a API. O seed é opcional. Não é necessário instalar Node ou PostgreSQL na máquina para essa opção.

- Swagger Docker: [http://localhost:3334/docs/](http://localhost:3334/docs/)
- API Docker: `http://localhost:3334`
- PostgreSQL Docker: `localhost:55433`

As portas são diferentes da execução nativa, para permitir testar ambos sem conflito. Altere `API_PORT` e `POSTGRES_PORT` no ambiente se necessário. O frontend que usar essa instância deve definir `VITE_API_URL=http://localhost:3334`.

```sh
docker compose logs --tail 50 api
docker compose --profile test run --build --rm test
docker compose down
```

O teste usa outro PostgreSQL, isolado em memória, sem acessar o banco da aplicação. `down` para os serviços e preserva o volume de dados da aplicação; não use `down -v` se quiser manter os cadastros. O container da API executa como usuário `node`, sem privilégios de root; ferramentas de migração/teste ficam em outro estágio da imagem.

Para conferir chamadas HTTP reais, com a API Docker iniciada e Node disponível na máquina:

```sh
npm run test:http
```

O script testa GET, POST, PATCH, PUT e OPTIONS, além de rejeições esperadas (400/409 e DELETE 404), e cria registros identificados como `HTTP-SMOKE`. Usa `API_URL` se informado; por padrão acessa a porta 3334.

## Executar localmente

Requisitos: Node.js 22.12 ou superior, npm e PostgreSQL 17 (local ou Docker).

Na pasta `backend/`:

```powershell
npm ci
Copy-Item .env.example .env
```

Copie o exemplo somente se ainda não tiver `.env`. Ele contém credenciais **locais de desenvolvimento**, porta do banco `55432`, porta da API `3333` e origens React/Vite permitidas.

**Windows com PostgreSQL instalado:**

```powershell
.\scripts\local-db.ps1
```

O script cria uma instância exclusiva em `../.local/postgres`, sem alterar serviços ou bancos existentes. O caminho padrão é `C:\Program Files\PostgreSQL\17\bin`; use `-PgBin` para outro caminho. Ele cria `supervalidade` e `supervalidade_test`. Para parar: `.\scripts\local-db.ps1 -Action stop`.

Para banco externo, ajuste `DATABASE_URL` e `TEST_DATABASE_URL`. Para executar a API nativa usando o banco Docker, use a porta `55433` na URL do banco; o banco de testes deve ser criado separadamente ou use o perfil Docker de testes acima.

Depois:

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

- API: [http://localhost:3333](http://localhost:3333)
- Swagger: [http://localhost:3333/docs/](http://localhost:3333/docs/)
- Saúde e banco: [http://localhost:3333/health](http://localhost:3333/health)
- [Guia dos endpoints e exemplos](docs/API.md)

O seed cria duas categorias, produtos, lotes, movimentações em dois meses, promoções encerradas, um lote em atenção e outro vencido; depois executa o ETL. Reexecutar preserva os registros existentes, sem duplicar movimentações. As datas dos lotes de exemplo são relativas à primeira execução do seed.

## Comandos

| Comando | Finalidade |
|---|---|
| `npm run dev` | API com recarga durante o desenvolvimento |
| `npm run build` | Limpar o build anterior e compilar apenas `src/` |
| `npm run typecheck` | Verificar tipos da aplicação, scripts, seed e testes |
| `npm start` | Executar a versão compilada |
| `npm test` | Aplicar migrações no banco de testes e rodar testes de integração |
| `npm run test:http` | Fazer requisições HTTP reais contra a API Docker |
| `npm run db:generate` | Gerar o cliente Prisma após mudar o schema |
| `npm run db:migrate` | Aplicar migrações versionadas |
| `npm run db:seed` | Criar os dados de demonstração e carregar o modelo analítico |
| `npm run etl` | Executar manualmente uma carga ETL |
| `npm run docs:export` | Atualizar `docs/openapi.json` a partir das rotas |
| `npm run db:studio` | Inspecionar os registros no Prisma Studio |

`npm test` exige que o nome do banco de `TEST_DATABASE_URL` termine em `_test`. Os testes criam registros exclusivos e não apagam tabelas operacionais. Há testes de concorrência, idempotência, regras de validade, persistência, relatórios, rollback de ETL, Swagger e CORS.

## Organização

```text
src/
  app.ts          Configuração Fastify, documentação, CORS e erros
  routes/
    catalog.ts    Categorias e produtos
    inventory.ts  Lotes, movimentações, configurações e painel
    promotions.ts Promoções e pós-promoção
    reports.ts    ETL e consultas OLAP
    shared.ts     Tipos e utilitários de paginação/período
  server.ts       Configuração e inicialização HTTP
  db.ts           Prisma com adaptador PostgreSQL
  schemas.ts      Contratos de entrada e saída em Zod
  domain.ts       Estoque, promoções, datas e regras transacionais
  analytics.ts    Consultas OLAP parametrizadas
  etl/
    service.ts    Extração, transformação e carga atômica
    cli.ts        Execução manual da carga
prisma/
  schema.prisma   Modelos operacionais e analíticos
  migrations/     Estrutura, índices e restrições do banco
  seed.ts         Dados demonstrativos
tests/            Testes HTTP usando Fastify.inject e PostgreSQL real
```

## Banco e consistência

Operacional: `Category`, `Product`, `Lot`, `Promotion`, `Movement`, `Settings`. Analítico: `DimDate`, `DimProduct`, `DimLot`, `DimPromotion`, `FactMovement`. `EtlRun` registra as cargas.

- Vendas, descartes, abertura/encerramento de promoção e correções do lote usam transações e bloqueio `FOR UPDATE` do lote.
- A baixa e a gravação da movimentação são confirmadas juntas. `requestKey` único evita duplicações por repetição de requisição.
- Um índice parcial garante apenas uma promoção ativa por lote. Restrições SQL também protegem saldos, preços e a associação entre promoção e lote.
- Quantidade inicial e produto do lote não são editáveis. Outros dados do lote só podem ser corrigidos antes de qualquer movimentação ou promoção.
- Não há exclusão de registros com histórico. Produtos podem ser inativados; promoções podem ser encerradas.
- As migrações SQL contêm restrições complementares ao schema Prisma. Use `migrate deploy`; `db push` não substitui essas migrações.

## ETL e OLAP

O ETL faz uma carga completa, adequada ao volume acadêmico: extrai um snapshot consistente da operação, valida referências, calcula receita/perda e publica dimensões e fatos na mesma transação. Falhas preservam a publicação anterior; cargas concorrentes recebem conflito. A fato tem uma linha por movimentação, com o mesmo ID de origem. A carga não altera o estoque.

As dimensões são **tipo 1**: a próxima carga reflete nomes/categorias atuais. Valores financeiros permanecem os registrados na movimentação. A dimensão `none` representa movimentações sem promoção.

O painel de estoque consulta a operação imediatamente. As análises de vendas e perdas refletem a última carga concluída e retornam `lastEtlAt`. Antes da primeira carga, esse campo é `null` e os totais são zero. Há agrupamentos dia/mês/categoria/produto/lote e filtros combinados para detalhamento.

Escopo atual: vendas manuais, um estabelecimento, unidades inteiras, ETL manual e API local. Importação CSV, integração com caixa, envio de e-mail e agendamento ficam para evolução. O backend está pronto para integração; não há frontend React implementado nesta entrega.

## Dependências e organização

- IDs dos registros: `@default(uuid())` no Prisma, persistidos como `uuid` no PostgreSQL. [Referência Prisma](https://docs.prisma.io/docs/orm/reference/prisma-schema-reference).
- Chaves de requisição e IDs nos testes: `randomUUID()` nativo de `node:crypto`; não é necessário instalar `uuid`. No navegador, use `crypto.randomUUID()`. [Referência Node](https://nodejs.org/download/release/v22.18.0/docs/api/webcrypto.html).
- O Fastify já fornece logging estruturado; Zod valida os contratos; o adaptador `@prisma/adapter-pg` conecta ao PostgreSQL. `npm ci` instala as versões do lockfile.
- `dist/` contém apenas a aplicação compilada e pode ser regenerada. Os antigos `dist/tests`, `dist/scripts` e `dist/prisma` não fazem parte do build de execução.
- `tests/`, `scripts/`, `docs/` e `prisma/migrations/` são usados. `node_modules/` é necessário à execução local. `.local/` contém o banco nativo e está ignorado pelo Git; removê-lo apagaria seus dados locais.

Esta estrutura atende ao MVP acadêmico. O ETL ainda faz carga completa em memória e as dimensões são tipo 1; volumes grandes e requisitos de histórico de classificação pedem uma evolução específica desse módulo.
