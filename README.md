# SuperValidade

Gestão de lotes, validades, promoções e perdas, com ETL e consultas OLAP. Acesso direto, sem login.

- `PIE6.html`: protótipo visual original.
- `backend/`: API Fastify + TypeScript, Prisma ORM e PostgreSQL, implementada para consumo do frontend React.
- [Guia de execução do backend](https://github.com/SergioPauloA/Trabalho_PIE6/blob/feat/etl-olap/backend/README.md).
- [Contratos e exemplos para a equipe](https://github.com/SergioPauloA/Trabalho_PIE6/blob/feat/etl-olap/backend/docs/API.md).
- [Contrato OpenAPI](https://github.com/SergioPauloA/Trabalho_PIE6/blob/feat/etl-olap/backend/docs/openapi.json), também disponível em `/openapi.json` e no Swagger `/docs/`.

A interface original ainda usa dados de demonstração; os componentes React devem consumir os endpoints documentados. O backend já contém cadastro, movimentações, promoções, pós-promoção, indicadores operacionais, carga ETL e consultas analíticas.

Para iniciar API e banco pelo Docker: na pasta `backend/`, execute `docker compose up --build -d --wait`. O Swagger fica em [http://localhost:3334/docs/](http://localhost:3334/docs/).

## Contribuições

Primeira etapa de prototipação: **Sergio Paulo de Andrade**, ideação de telas e design.

Lucas de Lima Nascimento: base da API, contratos de integração, banco e regras de estoque. Os módulos de promoções e análise estão disponíveis para integração e evolução pelas demais frentes.

Breno Dos Santos: integração das telas de descontos e promoções, venda manual, encerramento de promoções e histórico de movimentações com os endpoints da API, preservando o preço promocional calculado pelo backend, o registro das vendas e o histórico operacional.

André Alves da Silva: ETL e OLAP. Revisão e evolução do modelo analítico, da carga ETL e das consultas: roll-up dia > mês > ano em uma consulta (`/api/analytics/rollup`), dados de exemplo para o painel (`npm run db:seed:olap`) e teste de integração do roll-up.
