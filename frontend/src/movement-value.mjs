// Mesmo arredondamento da API: valor de cada movimentação ao centavo, meio centavo para cima.
// Contas em inteiros (kg × centavos) para não herdar erro de ponto flutuante.
export function movementValueCents(tonnes, centsPerTonne) {
  return Math.floor((Math.round(tonnes * 1000) * centsPerTonne + 500) / 1000);
}
