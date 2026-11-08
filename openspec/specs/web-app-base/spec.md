# web-app-base Specification

## Purpose

Define a base da aplicação Angular do homebroker, integrada ao monorepo e pronta para receber as telas em uma change futura.

## Requirements

### Requirement: Aplicação Angular no monorepo
O repositório SHALL conter uma aplicação Angular que compila e executa seus testes pelas tarefas do workspace.

#### Scenario: Build da aplicação
- **WHEN** o build do frontend é executado pelo workspace
- **THEN** a compilação termina com sucesso e gera os arquivos estáticos da aplicação

#### Scenario: Testes da aplicação
- **WHEN** os testes do frontend são executados pelo workspace
- **THEN** os testes iniciais passam e o comando termina ao final deles

### Requirement: Página inicial
A aplicação SHALL exibir no navegador uma página inicial que a identifica como o homebroker.

#### Scenario: Abrir a aplicação
- **WHEN** um desenvolvedor abre a aplicação em execução no navegador
- **THEN** a página exibe o nome do homebroker, sem o conteúdo de exemplo gerado pelo Angular
