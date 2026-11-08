# Spec Delta

## MODIFIED Requirements

### Requirement: Atualização do gráfico em tempo real
O gráfico SHALL refletir as mudanças nos candles do ativo selecionado sem recarregar a página e sem recriar o gráfico.

#### Scenario: Nova cotação do ativo selecionado
- **WHEN** chega uma cotação de `ALFA3` e nenhuma mensagem `candle` nova
- **THEN** os candles do gráfico permanecem iguais

#### Scenario: Novo candle em andamento do ativo selecionado
- **WHEN** chega uma mensagem `candle` de `ALFA3` que altera o candle em andamento
- **THEN** o último candle do gráfico muda e os demais permanecem iguais
