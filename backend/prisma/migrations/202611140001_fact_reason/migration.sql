-- Motivo do descarte no fato analítico, para analisar perdas por motivo.
-- Preenchido na próxima carga ETL; vendas permanecem com NULL.
ALTER TABLE "FactMovement" ADD COLUMN "reason" VARCHAR(300);
