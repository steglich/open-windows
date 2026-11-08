# simulation-generation Specification

## Purpose

Define o volume padrão dos dados simulados e como reproduzi-los exatamente por meio de uma seed fixa, para uso em testes e demonstrações.

## Requirements

### Requirement: Volume padrão
Sem configuração adicional, o servidor SHALL gerar 500 ativos, 50 níveis de book por lado, 10.000 ordens, 300 posições e cinco pregões completos de candles de 1 minuto, além do pregão corrente.

#### Scenario: Partida padrão
- **WHEN** o servidor é iniciado sem configuração e um cliente consulta os dados
- **THEN** o `welcome` lista 500 ativos, cada lado do book tem 50 níveis, a consulta de ordens informa `total` igual a 10.000 e a carteira tem 300 posições

### Requirement: Seed configurável
O servidor SHALL aceitar pela variável `SEED` um inteiro entre `0` e `4294967295`. Com qualquer outro valor, MUST encerrar a partida com uma mensagem de erro, sem aceitar conexões.

#### Scenario: Seed inválida
- **WHEN** o servidor é iniciado com `SEED=abc`
- **THEN** o processo termina com erro informando que a seed é inválida

### Requirement: Reprodutibilidade por seed
Com a mesma seed, o mesmo volume e o mesmo intervalo de ciclo, o servidor MUST produzir os mesmos dados para cada ativo em cada ciclo de mercado, inclusive todos os timestamps, independentemente de quais canais os clientes assinam. A quantidade e a ordem das mensagens entregues não fazem parte dessa garantia.

#### Scenario: Duas execuções com a mesma seed
- **WHEN** dois servidores são iniciados com `SEED=42` e cada um tem um cliente assinando todos os canais
- **THEN** as mensagens de um mesmo canal, ativo e `timestamp` são idênticas nos dois servidores, assim como as respostas às mesmas consultas

#### Scenario: Assinaturas diferentes não alteram os dados
- **WHEN** dois servidores são iniciados com `SEED=42`, um com cliente assinando o `book` de todos os ativos e outro sem assinaturas de `book`
- **THEN** as cotações de um mesmo ativo e `timestamp` são idênticas nos dois servidores

### Requirement: Dados diferentes sem seed
Sem a variável `SEED`, o servidor SHALL gerar dados diferentes a cada execução e MUST usar o relógio real nos timestamps.

#### Scenario: Duas execuções sem seed
- **WHEN** o servidor é iniciado duas vezes sem `SEED`
- **THEN** os preços gerados nas duas execuções são diferentes

### Requirement: Dados prontos antes das conexões
O servidor MUST concluir a geração dos dados antes de aceitar a primeira conexão.

#### Scenario: Primeira consulta após conectar
- **WHEN** um cliente recebe `welcome` e consulta candles de qualquer ativo
- **THEN** a resposta já contém o histórico completo
