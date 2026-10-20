# Spec Delta

## Purpose

Define uma topologia visual de mensageria AWS que permita aprender como SNS e SQS conectam produtores, tópicos, filas, assinaturas e consumidores sem usar serviços AWS reais.

## ADDED Requirements

### Requirement: Topologia AWS editável
O simulador SHALL permitir criar, editar, posicionar e remover produtores, tópicos SNS, filas SQS, assinaturas SNS-to-SQS e consumidores. Cada conexão visual SHALL usar a nomenclatura do serviço AWS que representa.

#### Scenario: Criar fluxo pub/sub
- **WHEN** o usuário cria um tópico SNS, duas filas SQS e uma assinatura para cada fila
- **THEN** o canvas mostra o produtor conectado ao tópico e o tópico conectado às duas filas por assinaturas distintas

#### Scenario: Remover recurso referenciado
- **WHEN** o usuário remove uma fila que é destino de uma assinatura
- **THEN** o simulador remove a assinatura associada e registra a alteração no log

### Requirement: Configuração de fila SQS
O simulador SHALL permitir configurar em cada fila o tipo Standard ou FIFO, atraso de entrega, tempo de visibilidade, retenção, long polling, política de redrive, fila de destino de DLQ e máximo de recebimentos. Os controles SHALL apresentar faixas e unidades compatíveis com o serviço AWS.

#### Scenario: Configurar limites de fila
- **WHEN** o usuário informa atraso entre 0 e 900 segundos, visibilidade entre 0 segundos e 12 horas, retenção entre 1 minuto e 14 dias e long polling entre 0 e 20 segundos
- **THEN** o simulador aceita os valores, os exibe na fila e aplica-os às mensagens posteriores

#### Scenario: Rejeitar configuração fora do intervalo
- **WHEN** o usuário tenta salvar uma propriedade de fila fora da faixa compatível
- **THEN** o simulador impede o salvamento e informa a faixa válida da propriedade

### Requirement: Semântica de filas Standard e FIFO
O simulador SHALL identificar visualmente o tipo de cada fila. Filas Standard SHALL ensinar entrega pelo menos uma vez e ordenação de melhor esforço; filas FIFO SHALL exigir nome terminado em `.fifo`, preservar ordem dentro de cada grupo de mensagens e usar deduplicação configurável.

#### Scenario: Nome inválido para fila FIFO
- **WHEN** o usuário tenta criar uma fila FIFO cujo nome não termina em `.fifo`
- **THEN** o simulador recusa a configuração e explica a convenção de nome do SQS FIFO

#### Scenario: Mensagens FIFO em grupos diferentes
- **WHEN** mensagens de dois grupos FIFO chegam intercaladas
- **THEN** o simulador preserva a ordem de cada grupo e pode exibir processamento alternado entre grupos

### Requirement: Configuração de tópico SNS
O simulador SHALL permitir criar tópicos SNS Standard e FIFO, configurar nome, deduplicação baseada em conteúdo para tópicos FIFO e visualizar suas assinaturas. Tópicos FIFO SHALL exigir nome terminado em `.fifo`.

#### Scenario: Criar tópico FIFO
- **WHEN** o usuário cria um tópico SNS FIFO com nome válido e deduplicação baseada em conteúdo ativada
- **THEN** o canvas identifica o tópico como FIFO e guarda a configuração para as publicações

#### Scenario: Nome inválido para tópico FIFO
- **WHEN** o usuário salva um tópico FIFO sem o sufixo `.fifo`
- **THEN** o simulador bloqueia o salvamento e apresenta o requisito de nome

### Requirement: Assinaturas SNS para SQS
O simulador SHALL permitir assinaturas de tópicos SNS para filas SQS, com filtro por atributos da mensagem, política de entrega e opção de entrega bruta. O sistema SHALL impedir uma assinatura FIFO incompatível com o tipo da fila de destino.

#### Scenario: Filtrar uma assinatura
- **WHEN** uma assinatura possui filtro para o atributo `eventType=order.created`
- **THEN** apenas mensagens publicadas com esse atributo são entregues à fila inscrita

#### Scenario: Assinatura FIFO incompatível
- **WHEN** o usuário conecta um tópico SNS FIFO a uma fila SQS Standard
- **THEN** o simulador impede a criação e informa que o destino precisa ser uma fila FIFO

### Requirement: Presets e portabilidade da topologia
O simulador SHALL fornecer cenários didáticos AWS e SHALL exportar e importar a topologia, incluindo propriedades de tópicos, filas, assinaturas, produtores e consumidores.

#### Scenario: Carregar cenário fan-out SNS
- **WHEN** o usuário seleciona o preset de notificações fan-out
- **THEN** o simulador carrega um produtor, um tópico SNS, múltiplas assinaturas e filas SQS com configurações visíveis

#### Scenario: Reimportar cenário exportado
- **WHEN** o usuário exporta uma topologia e depois importa o arquivo gerado
- **THEN** o simulador restaura os recursos, conexões e propriedades configuradas

### Requirement: Aplicação exclusiva de mensageria AWS
A aplicação SHALL apresentar somente recursos e linguagem de SNS e SQS. Ela SHALL usar o projeto de referência apenas como inspiração visual e não SHALL expor exchanges, bindings, routing keys, ACK/NACK, seleção de modo RabbitMQ ou importação de topologias AMQP.

#### Scenario: Abrir uma nova topologia
- **WHEN** o usuário abre a aplicação ou cria uma topologia vazia
- **THEN** o editor oferece somente produtor, tópico SNS, fila SQS, assinatura e consumidor

#### Scenario: Importar topologia de outro domínio
- **WHEN** o usuário tenta importar um arquivo que declara topologia AMQP ou RabbitMQ
- **THEN** a aplicação recusa o arquivo e explica que suporta somente o formato AWS próprio
