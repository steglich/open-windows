# Spec Delta

## REMOVED Requirements

### Requirement: Sem conexão com o servidor nesta etapa
**Reason**: O requisito valia somente até uma change futura definir o consumo do WebSocket, que é o objetivo desta change.
**Migration**: O comportamento da conexão passa a ser definido pela capability `market-data-client`, inclusive a abertura da página com o servidor desligado.
