# Mercelume Web

Frontend React + TypeScript (TSX), Vite, Tailwind CSS e TanStack Query. Interface responsiva, sem login, com dados persistidos pela API Fastify/PostgreSQL.

## Desenvolvimento com backend no Docker

Na pasta `backend`:

```sh
docker compose up --build -d --wait
```

Na pasta `frontend` (Node 22.12 ou superior):

```sh
npm ci
npm run dev
```

Abra http://localhost:5173. A porta deve estar livre; pare o servidor do HTML antigo se ainda estiver ocupada. O Vite encaminha `/api` e `/health` para `http://127.0.0.1:3334`. Não é necessário adicionar `?api=` à URL. Para usar a API nativa, copie `.env.example` para `.env` e defina `API_PROXY_TARGET=http://127.0.0.1:3333`.

`VITE_API_URL` é opcional para uma API hospedada separadamente. Nesse caso, permita a origem do frontend em `CORS_ORIGINS` no backend. Nunca coloque credenciais de banco em variáveis `VITE_*`.

## Toda a aplicação no Docker

Na pasta `backend`:

```sh
docker compose --profile web up --build -d --wait
```

O perfil `web` serve a versão compilada do React em http://localhost:5173. Nginx encaminha as chamadas para a API pela rede do Compose. Não execute Vite e o container web na mesma porta ao mesmo tempo. `FRONTEND_PORT` pode alterar a porta do container.

## Funcionalidades

- Painel: estoque operacional, lotes em risco e receita/perdas da última consolidação.
- Produtos e categorias: criação, edição, ativação e inativação de produtos.
- Estoque: cadastro, filtros, paginação, detalhes e correção de lotes sem histórico.
- Promoções: criação, encerramento, consulta de ativas/encerradas e resultados.
- Vendas e descartes: preço definido pelo backend, motivo obrigatório no descarte e chave de idempotência preservada para repetição após falha de rede.
- Histórico: filtros por lote, tipo e período; preço ou custo registrado em cada movimento.
- Análises: resumo, agrupamento por dia/mês/categoria/produto/lote, roll-up e execução/histórico do ETL.
- Configurações: prazo de alerta salvo no banco.

As tabelas são paginadas no servidor. Os seletores carregam todas as páginas para não esconder registros após os primeiros 100 itens. Estados de carregamento, vazio e erro são apresentados sem dados fictícios. A análise financeira é uma fotografia da última carga; use **Atualizar análises** após novas movimentações.

## Validação

```sh
npm run build
npm test
```

O build verifica TypeScript. Os testes verificam a chave de idempotência das movimentações. Para validar a integração manualmente: crie categoria, produto e lote; abra uma promoção; venda e descarte toneladas (por exemplo, entrada de 0,250 t, venda de 0,100 t e descarte de 0,025 t deixam saldo de 0,125 t); confira saldo e histórico; encerre a promoção e confira seu resultado; atualize as análises e recarregue a página para conferir a persistência.

Quantidades exibidas em toneladas com três casas decimais; custos e preços em R$/t. Os formulários aceitam incrementos de 0,001 t (1 kg). A interface envia `quantityUnit: "t"` à API v2. O HTML histórico na raiz permanece como protótipo da regra antiga.
