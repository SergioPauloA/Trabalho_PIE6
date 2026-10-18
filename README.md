# Mercelume

Controle de estoque em toneladas, validades, promoções e perdas, com ETL e consultas OLAP. Acesso direto, sem login.

- `frontend/`: aplicação React + TypeScript e Tailwind CSS, responsiva e integrada à API.
- `PIE6.html`: protótipo original preservado como referência histórica, identificado como versão antiga. Contém dados demonstrativos em unidades e integração parcial à API antiga; a aplicação atual está em `frontend/`.
- `backend/`: API Fastify + TypeScript, Prisma ORM e PostgreSQL, implementada para consumo do frontend React.
- [Guia de execução do backend](backend/README.md).
- [Contratos e exemplos para a equipe](backend/docs/API.md).
- [Contrato OpenAPI](backend/docs/openapi.json), também disponível em `/openapi.json` e no Swagger `/docs/`.

A interface React consome os endpoints de cadastros, estoque, movimentações, promoções, pós-promoção, indicadores operacionais, configurações, carga ETL e consultas analíticas. A interface exibe os registros do banco, incluindo dados demonstrativos quando uma carga opcional é executada; os estados vazios indicam quando ainda não existem registros.

## Executar a aplicação

Inicie a API e o banco: `cd backend` e `docker compose up --build -d --wait`. Em outro terminal, entre em `frontend`, execute `npm ci` e `npm run dev`. Abra [http://localhost:5173](http://localhost:5173). O frontend já encaminha as chamadas para a API Docker na porta 3334.

Para executar também o frontend no Docker, use `docker compose --profile web up --build -d --wait` na pasta `backend`. Não inicie o Vite simultaneamente na mesma porta. Consulte o [guia do frontend](frontend/README.md).

Para iniciar API e banco pelo Docker: na pasta `backend/`, execute `docker compose up --build -d --wait`. O Swagger fica em [http://localhost:3334/docs/](http://localhost:3334/docs/).

## Carga de produtos

Para adicionar 24 produtos comuns e entradas de estoque de exemplo, execute na
pasta `backend`:

```sh
docker compose --profile tools run --build --rm seed npm run db:seed:catalog
```

Quantidades, preços e validades são demonstrativos. Repetir o comando não duplica
cadastros nem altera saldos. Para cadastrar apenas produtos e categorias, acrescente
`-- --catalog-only`. Veja os [dados e instruções da carga](backend/prisma/catalog/README.md).

## Contribuições

**Sergio Paulo de Andrade**: ideação de telas e design.

Lucas de Lima Nascimento: base da API, contratos de integração, banco e regras de estoque. Os módulos de promoções e análise estão disponíveis para integração e evolução pelas demais frentes.

Breno Dos Santos: integração das telas de descontos e promoções, venda manual, encerramento de promoções e histórico de movimentações com os endpoints da API, preservando o preço promocional calculado pelo backend, o registro das vendas e o histórico operacional.

André Alves da Silva: ETL e OLAP. Revisão e evolução do modelo analítico, da carga ETL e das consultas: roll-up dia > mês > ano em uma consulta (`/api/analytics/rollup`), dados de exemplo para o painel (`npm run db:seed:olap`) e teste de integração do roll-up.

## Controle em toneladas e migração

Quantidades, saldos, vendas, descartes e análises usam toneladas com até três casas decimais (`0,250 t = 250 kg`). Preços e custos são por tonelada (R$/t). Lotes são mantidos para separar entradas e validades.

A migração `202610180001_tonnes` limpa, uma única vez, os antigos dados de teste de estoque/lotes, promoções, movimentações, cargas ETL e dimensões/fatos analíticos. Essa limpeza foi autorizada porque as unidades antigas não têm peso cadastrado. Produtos, categorias e configurações são preservados. Não há conversão automática de unidades para toneladas. Novas execuções do Compose preservam os registros em toneladas.

O Compose aplica a migração antes de iniciar a API. Para começar com o estoque vazio, não execute os seeds opcionais. O contrato da API passa a exigir `quantityUnit: "t"` ao criar lotes, vender ou descartar.
