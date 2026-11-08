# Spec Delta

## MODIFIED Requirements

### Requirement: Reprodutibilidade por seed
Com a mesma seed, o mesmo volume e o mesmo intervalo de ciclo, o servidor MUST produzir os mesmos dados para cada ativo em cada ciclo de mercado, inclusive todos os timestamps, independentemente de quais canais os clientes assinam. A quantidade e a ordem das mensagens entregues não fazem parte dessa garantia.

#### Scenario: Duas execuções com a mesma seed
- **WHEN** dois servidores são iniciados com `SEED=42` e cada um tem um cliente assinando todos os canais
- **THEN** as mensagens de um mesmo canal, ativo e `timestamp` são idênticas nos dois servidores, assim como as respostas às mesmas consultas

#### Scenario: Assinaturas diferentes não alteram os dados
- **WHEN** dois servidores são iniciados com `SEED=42`, um com cliente assinando o `book` de todos os ativos e outro sem assinaturas de `book`
- **THEN** as cotações de um mesmo ativo e `timestamp` são idênticas nos dois servidores
