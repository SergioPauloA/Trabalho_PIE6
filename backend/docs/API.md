# Contrato da API para a equipe

Base local: `http://localhost:3333`. Base Docker: `http://localhost:3334`. Sem autenticação. Envie `Content-Type: application/json` nos pedidos com corpo. O Swagger `/docs/` contém os campos de entrada, respostas e exemplos de uso interativo. O arquivo [openapi.json](openapi.json) pode ser importado no Postman/Insomnia ou usado para gerar tipos TypeScript.

## Convenções

- IDs são UUIDs. Campos terminados em `Cents` são **centavos inteiros**: `1000 = R$ 10,00`.
- Quantidades são unidades inteiras positivas, até 1.000.000 por operação; custos/preços unitários até 10.000.000 centavos.
- `expiresAt` de entrada e filtros `from`/`to`: `YYYY-MM-DD`. Datas de criação/movimentação: ISO 8601 UTC. A validade e os dias de análise seguem `America/Sao_Paulo`; o dia do vencimento ainda permite venda.
- Listas operacionais: `page=1&pageSize=20`, com máximo de 100 itens por página e `page` até 1.000.000. Resposta: `{ data: [...], pagination: { page, pageSize, total, totalPages } }`.
- Erros: `{ error: { code, message, details? } }`. HTTP `400` entrada inválida; `404` inexistente; `409` conflito de negócio/concorrência; `422` referência/preço inválido; `500` falha interna; `503` banco indisponível no health.
- Não envie saldo, preço aplicado ou totais calculados na venda. A API calcula a baixa e usa a promoção ativa automaticamente.

## Endpoints

| Método | Rota | Uso |
|---|---|---|
| GET | `/health` | Verifica API e banco |
| GET | `/openapi.json` | Contrato completo |
| GET | `/docs/` | Swagger interativo |
| GET | `/api/categories` | Categorias paginadas |
| POST | `/api/categories` | Criar: `{ name }` |
| PATCH | `/api/categories/:id` | Renomear: `{ name }` |
| GET | `/api/products` | Produtos; filtros `search`, `categoryId`, `active=true/false` |
| GET | `/api/products/:id` | Produto e categoria |
| POST | `/api/products` | Criar: `{ name, sku, categoryId, barcode?, active? }` |
| PATCH | `/api/products/:id` | Editar campos; `active:false` inativa |
| GET | `/api/lots` | Lotes; filtros `search`, `productId`, `categoryId`, `status` |
| GET | `/api/lots/:id` | Lote, saldo, quantidades vendida/descartada e situação |
| POST | `/api/lots` | Criar lote conforme exemplo abaixo |
| PATCH | `/api/lots/:id` | Corrigir `code`, `expiresAt`, `unitCostCents`, `unitPriceCents` antes de haver histórico |
| POST | `/api/lots/:id/sales` | Venda: `{ quantity, requestKey }` |
| POST | `/api/lots/:id/discards` | Descarte: `{ quantity, requestKey, reason }` |
| GET | `/api/movements` | Histórico; filtros `lotId`, `promotionId`, `type`, `from`, `to` |
| POST | `/api/promotions` | Abrir: `{ lotId, discountPercent }`; desconto inteiro de 1 a 99 |
| GET | `/api/promotions` | Promoções; filtros `lotId`, `status=ACTIVE/CLOSED` |
| GET | `/api/promotions/:id` | Promoção com lote e produto |
| POST | `/api/promotions/:id/close` | Encerrar; sem corpo; repetir preserva o mesmo encerramento |
| GET | `/api/promotions/:id/results` | Resultado da promoção e saldo atual |
| GET | `/api/settings` | Prazo de alerta vigente |
| PUT | `/api/settings` | Alterar: `{ alertDays: 10 }`; entre 0 e 365 |
| GET | `/api/dashboard/stock` | Lotes/unidades totais, vencidos, em atenção e promoções ativas |
| POST | `/api/etl/runs` | Executar ETL síncrono; sem corpo; retorna 201 após conclusão |
| GET | `/api/etl/runs` | Histórico paginado das cargas |
| GET | `/api/etl/runs/:id` | Situação, contagem e erro de uma carga |
| GET | `/api/analytics/summary` | Totais analíticos filtrados |
| GET | `/api/analytics/groups` | Agregações para tabelas e gráficos |

`status` do lote: `OK` (fora da janela), `ATTENTION` (vence de hoje até o prazo), `EXPIRED` (venceu antes de hoje), `EMPTY` (saldo zero). O saldo zero tem precedência. `type` da movimentação: `SALE` ou `DISCARD`.

## Exemplo de fluxo

1. `POST /api/categories` com `{ "name": "Laticínios" }`. Guarde `id` como `categoryId`.
2. `POST /api/products`:

```json
{ "name": "Iogurte natural 170g", "sku": "IOG-001", "categoryId": "UUID_DA_CATEGORIA" }
```

3. `POST /api/lots` (use uma validade futura no dia da demonstração):

```json
{
  "code": "LT-001",
  "productId": "UUID_DO_PRODUTO",
  "expiresAt": "2026-12-31",
  "initialQuantity": 100,
  "unitCostCents": 500,
  "unitPriceCents": 1000
}
```

4. `POST /api/promotions`:

```json
{ "lotId": "UUID_DO_LOTE", "discountPercent": 30 }
```

O retorno traz `unitPriceCents: 700`. O arredondamento é feito para o centavo mais próximo.

5. Venda em `POST /api/lots/UUID_DO_LOTE/sales`:

```json
{ "quantity": 60, "requestKey": "11111111-1111-4111-8111-111111111111" }
```

6. Descarte em `POST /api/lots/UUID_DO_LOTE/discards`:

```json
{ "quantity": 10, "requestKey": "22222222-2222-4222-8222-222222222222", "reason": "Embalagem avariada" }
```

Cada operação retorna `{ movement, balance, replayed }`. **Gere `requestKey` com `crypto.randomUUID()` uma vez por ação** e reutilize essa chave em tentativas da mesma ação. Gere outra para uma nova venda/descarte. Repetir a chave e o conteúdo devolve a movimentação existente; usar a mesma chave com outros dados retorna `409`. O `balance` retornado é o saldo atual, inclusive em repetição.

7. Consulte `/api/promotions/UUID_DA_PROMOCAO/results`: 60 vendidas, 10 descartadas, saldo 30, receita `42000`, perda `5000` e `sellThroughPercent: 60`.
8. Encerre em `POST /api/promotions/UUID_DA_PROMOCAO/close`. O lote permanece com saldo. Vendas posteriores usam o preço normal ou uma nova promoção.
9. Execute `POST /api/etl/runs` e consulte `/api/analytics/summary?lotId=UUID_DO_LOTE`.

No pós-promoção, `remainingFromPromotion` representa a quantidade que sobrou daquela promoção. `currentLotBalance` acompanha o estoque atual, que pode mudar depois do encerramento. Apenas as movimentações registradas enquanto a promoção estava ativa compõem seu resultado.

## Painel e OLAP

`/api/dashboard/stock` retorna `date`, `alertDays`, `activeLots`, `totalUnits`, `expiredLots`, `expiredUnits`, `attentionLots`, `attentionUnits`, `activePromotions`. Os lotes com saldo zero não entram nas contagens de estoque.

Filtros analíticos: `from`, `to` (inclusive), `categoryId`, `productId`, `lotId`, `promotionId`, `type`. Podem ser combinados. Para agrupamentos, acrescente `groupBy=day|month|category|product|lot` (padrão `month`).

```text
/api/analytics/groups?groupBy=month
/api/analytics/groups?groupBy=product&categoryId=UUID_DA_CATEGORIA
/api/analytics/groups?groupBy=lot&productId=UUID_DO_PRODUTO
/api/analytics/summary?from=2026-10-01&to=2026-10-31
```

Indicadores retornados: `soldQuantity`, `promotionalUnits`, `discardedQuantity`, `revenueCents` (todas as vendas), `promotionalRevenueCents` (só promoções), `lossCents`. Receita não é lucro. `promotionalUnits` é a métrica operacional de produtos “salvos”, sem afirmar causalidade econômica.

O resumo retorna os indicadores e `lastEtlAt`. O agrupamento retorna `{ lastEtlAt, groupBy, data: [{ key, label, ...indicadores }] }`. Grupos sem movimentações não aparecem; o frontend pode preencher dias/meses vazios com zero. Os endpoints analíticos não usam a paginação operacional.

Após vendas/descartes, atualize as consultas operacionais no TanStack Query. Após concluir o ETL, atualize as consultas analíticas. No primeiro acesso sem carga, `lastEtlAt` é `null`.

## Exemplo React/TypeScript

```tsx
const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

async function registrarVenda(lotId: string, quantity: number, requestKey: string) {
  const response = await fetch(`${baseUrl}/api/lots/${lotId}/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity, requestKey }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? 'Não foi possível registrar.');
  return data;
}

// Crie antes da tentativa e preserve se houver falha de rede:
const requestKey = crypto.randomUUID();
await registrarVenda(lotId, 60, requestKey);
```

Para chamadas de leitura, use `fetch` com TanStack Query. Para outros endereços/portas do React, inclua a origem em `CORS_ORIGINS` no `.env` do backend e reinicie a API.

## Divisão da integração

- **Pessoa 1:** produtos/lotes para componentes, `/dashboard/stock`, `/analytics/*` e `/settings`.
- **Pessoa 2:** base da API, migrações, validação, controle transacional e manutenção dos contratos.
- **Pessoa 3:** `/promotions/*`, `/lots/:id/sales`, `/lots/:id/discards` e `/movements` para o pós-promoção.
- **Pessoa 4:** `/etl/runs`, `/analytics/*`, `src/etl/`, `src/analytics.ts` e modelos analíticos do Prisma para evoluir a análise.
