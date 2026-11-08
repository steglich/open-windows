# Spec Delta

## MODIFIED Requirements

### Requirement: Conexões WebSocket
O servidor SHALL aceitar várias conexões WebSocket simultâneas na porta definida pela variável `PORT`, usando `8090` quando ela não estiver definida.

#### Scenario: Porta padrão
- **WHEN** o servidor é iniciado sem a variável `PORT` e um cliente se conecta à porta `8090`
- **THEN** a conexão é estabelecida

#### Scenario: Porta configurada
- **WHEN** o servidor é iniciado com `PORT=9090` e um cliente se conecta à porta `9090`
- **THEN** a conexão é estabelecida
