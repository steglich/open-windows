# Spec Delta

## MODIFIED Requirements

### Requirement: Atualização do estado em tempo real
A cada mensagem `quotes`, `book` ou `positions`, a aplicação SHALL substituir o valor anterior dos mesmos itens pelos valores recebidos e refletir a mudança na tela sem recarregar a página. Uma mensagem `quotes` MUST ser aplicada ao estado em uma única atualização.

#### Scenario: Nova cotação
- **WHEN** a aplicação recebe uma mensagem `quotes` com a cotação de `PETR4`
- **THEN** a cotação de `PETR4` é substituída e as cotações dos ativos ausentes da mensagem permanecem iguais

#### Scenario: Nova carteira
- **WHEN** a aplicação recebe uma mensagem `positions`
- **THEN** a carteira inteira é substituída pela recebida
