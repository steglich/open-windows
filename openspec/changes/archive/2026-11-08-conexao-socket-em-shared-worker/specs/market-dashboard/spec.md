# Spec Delta

## MODIFIED Requirements

### Requirement: Painel de status da conexão
O painel de status SHALL mostrar em texto o estado atual da conexão e MUST mostrar o código e a mensagem do erro informado pelo servidor enquanto ele estiver exposto.

#### Scenario: Conexão estabelecida
- **WHEN** o estado da conexão é `connected`
- **THEN** o painel indica que a aplicação está conectada

#### Scenario: Tentando reconectar
- **WHEN** o estado da conexão é `reconnecting`
- **THEN** o painel indica que a aplicação está tentando reconectar

#### Scenario: Erro do servidor
- **WHEN** existe um erro exposto com `code` e `message`
- **THEN** o painel exibe o código e o texto do erro

#### Scenario: Conexão indisponível no navegador
- **WHEN** o estado da conexão é `unavailable`
- **THEN** o painel indica que este navegador não permite a conexão com o mercado
