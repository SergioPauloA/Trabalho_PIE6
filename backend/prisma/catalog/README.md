# Carga de produtos para o Mercelume

O arquivo `products.json` contém 24 produtos comuns em seis categorias. São nomes
genéricos de alimentos existentes, sem marcas e sem EANs inventados. Os SKUs
`MER-CAT-001` a `MER-CAT-024` são identificadores internos.

As quantidades, os custos, os preços e os prazos de validade são **demonstrativos**.
Não são cotações atuais, inventário físico ou informações de um fabricante.
Use dados do fornecedor e da entrada real para operação comercial.

## Carregar no Docker

Na pasta `backend`, com o ambiente iniciado:

```sh
docker compose --profile tools run --build --rm seed npm run db:seed:catalog
```

O comando cria categorias e produtos ausentes, além de uma entrada de estoque
para cada produto ativo. Os códigos dos lotes começam com `DEMO-CATALOGO-`.
As validades são calculadas a partir do dia da primeira carga no fuso de Brasília;
os prazos servem somente para demonstrar o painel e os alertas.

Para carregar apenas produtos e categorias, sem preços nem estoque de exemplo:

```sh
docker compose --profile tools run --build --rm seed npm run db:seed:catalog -- --catalog-only
```

Na execução nativa, configure `DATABASE_URL`, aplique as migrações e execute
`npm run db:seed:catalog` (ou acrescente `-- --catalog-only`). No seu servidor,
execute o mesmo comando apontando para o banco pretendido.

## Regras

- Quantidades em toneladas, com precisão de 0,001 t (1 kg).
- Custos e preços em centavos por tonelada. Exemplo: `650000` equivale a
  R$ 6.500,00/t. `initialQuantity: 0.500` equivale a 500 kg.
- Toda a carga é transacional. Uma falha desfaz somente as alterações daquela execução.
- Repetir o comando preserva nomes editados, inativações, preços, validades,
  saldos, vendas e descartes. Não duplica SKUs nem lotes e não repõe estoque.
- Produtos já inativos não recebem novos lotes. Cadastros preexistentes ficam preservados.
- A carga não cria promoções, vendas ou descartes. As análises terão resultados
  após registrar movimentações e usar **Atualizar análises** no site.
- Para uma nova entrada após consumir um lote, use **Novo lote** no site.

O JSON é o arquivo de entrada desse comando; não existe upload de JSON pela interface.
