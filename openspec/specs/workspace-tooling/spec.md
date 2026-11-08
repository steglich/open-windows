# workspace-tooling Specification

## Purpose

Define como o monorepo é organizado e como as tarefas de desenvolvimento, build e teste de todos os projetos são executadas a partir da raiz.

## Requirements

### Requirement: Monorepo com aplicações independentes
O repositório SHALL conter o servidor e o frontend como projetos separados de um único workspace, com dependências instaladas por um único comando na raiz.

#### Scenario: Instalação a partir da raiz
- **WHEN** um desenvolvedor executa o comando de instalação na raiz de um clone novo do repositório
- **THEN** as dependências do servidor e do frontend ficam disponíveis sem instalação adicional em cada projeto

### Requirement: Tarefas orquestradas pelo Turborepo
O repositório SHALL expor na raiz os scripts `dev`, `build` e `test`, e cada um MUST executar a tarefa correspondente de todos os projetos por meio do Turborepo.

#### Scenario: Build de todos os projetos
- **WHEN** um desenvolvedor executa o script `build` na raiz
- **THEN** o servidor e o frontend são compilados e o comando termina com sucesso

#### Scenario: Testes de todos os projetos
- **WHEN** um desenvolvedor executa o script `test` na raiz
- **THEN** os testes do servidor e do frontend são executados uma única vez e o comando termina ao final deles

### Requirement: Desenvolvimento simultâneo
O script `dev` da raiz SHALL iniciar o servidor e o frontend ao mesmo tempo e MUST mantê-los em execução até ser interrompido.

#### Scenario: Subir o ambiente completo
- **WHEN** um desenvolvedor executa o script `dev` na raiz
- **THEN** o WebSocket do servidor aceita conexões e o frontend fica acessível no navegador

### Requirement: Execução de um único projeto
O workspace SHALL permitir executar qualquer tarefa em apenas um dos projetos, a partir da raiz.

#### Scenario: Subir apenas o servidor
- **WHEN** um desenvolvedor executa a tarefa `dev` filtrada para o servidor
- **THEN** somente o servidor é iniciado

### Requirement: Cache de build
Os resultados de build SHALL ser reaproveitados pelo Turborepo quando as entradas de um projeto não tiverem mudado.

#### Scenario: Build repetido sem alterações
- **WHEN** um desenvolvedor executa `build` duas vezes seguidas sem alterar arquivos
- **THEN** a segunda execução é atendida pelo cache para todos os projetos
