# Spec Delta

## Purpose

Define o ciclo de vida observável das mensagens SQS da aplicação AWS independente, desde a publicação em SNS ou envio direto até consumo, exclusão, reentrega, expiração e envio a uma DLQ.

## ADDED Requirements

### Requirement: Publicação e envio direto
O simulador SHALL permitir que um produtor publique uma mensagem em tópico SNS ou envie diretamente a uma fila SQS. A mensagem SHALL conter corpo, atributos, timestamp e, quando o destino for FIFO, grupo e identificador de deduplicação ou conteúdo deduplicável.

#### Scenario: Fan-out por tópico SNS
- **WHEN** um produtor publica uma mensagem em tópico SNS com duas assinaturas elegíveis
- **THEN** o simulador anima uma entrega independente para cada fila inscrita e registra cada resultado

#### Scenario: Deduplicação FIFO
- **WHEN** uma segunda publicação FIFO usa o mesmo identificador de deduplicação dentro da janela simulada de cinco minutos
- **THEN** o simulador marca a publicação como deduplicada e não cria nova mensagem nas filas de destino

### Requirement: Atraso e disponibilidade
O simulador SHALL manter uma mensagem invisível para consumidores até transcorrer o atraso configurado na fila ou no envio. Durante esse período, a mensagem SHALL aparecer como pendente de disponibilidade e não poderá ser recebida.

#### Scenario: Mensagem com delay
- **WHEN** uma mensagem é enviada com atraso de 30 segundos
- **THEN** consumidores não a recebem antes de 30 segundos e a fila exibe a contagem regressiva de disponibilidade

### Requirement: Polling e visibilidade
O simulador SHALL representar o recebimento SQS como polling de uma fila por um consumidor. Ao receber uma mensagem, o sistema SHALL incrementar seu contador de recebimentos e ocultá-la por seu visibility timeout; o long polling configurado SHALL ser visível quando a fila está vazia.

#### Scenario: Consumidor recebe mensagem
- **WHEN** um consumidor ocioso faz polling e há mensagem disponível
- **THEN** o simulador entrega a mensagem, inicia o visibility timeout e apresenta o receipt handle simulado no inspetor

#### Scenario: Long polling sem mensagens
- **WHEN** um consumidor faz polling em fila vazia com long polling configurado
- **THEN** o simulador mostra o consumidor aguardando até o tempo configurado ou até a chegada de uma mensagem

### Requirement: Exclusão como confirmação de sucesso
O simulador SHALL concluir o processamento bem-sucedido somente quando o consumidor executar DeleteMessage simulado. A exclusão SHALL remover a mensagem definitivamente e atualizar métricas de mensagens recebidas e excluídas.

#### Scenario: Consumidor exclui mensagem
- **WHEN** o usuário confirma a conclusão do processamento de uma mensagem em voo
- **THEN** o simulador executa a exclusão simulada, remove a mensagem do fluxo e registra o evento como DeleteMessage

### Requirement: Reentrega após falha ou timeout
O simulador SHALL reexibir uma mensagem para novo polling quando o consumidor falhar, abandonar o processamento ou deixar expirar seu visibility timeout sem excluí-la. A interface SHALL mostrar o contador ApproximateReceiveCount e o histórico de tentativas.

#### Scenario: Expiração do visibility timeout
- **WHEN** um consumidor não exclui a mensagem antes do fim do visibility timeout
- **THEN** a mensagem volta a ficar disponível e pode ser entregue novamente com contador de recebimentos incrementado

#### Scenario: Alterar visibilidade durante processamento
- **WHEN** o usuário estende ou reduz o visibility timeout de uma mensagem recebida para um valor entre 0 segundos e 12 horas
- **THEN** o simulador atualiza a nova janela de invisibilidade e a exibe no inspetor

### Requirement: Redrive e dead-letter queue
O simulador SHALL mover uma mensagem para a DLQ configurada quando seu contador de recebimentos ultrapassar o maxReceiveCount da política de redrive. O sistema SHALL exigir compatibilidade entre os tipos Standard ou FIFO da fila de origem e da DLQ.

#### Scenario: Exceder máximo de recebimentos
- **WHEN** uma mensagem retorna à fila e seu contador de recebimentos excede o maxReceiveCount configurado
- **THEN** o simulador a anima para a DLQ, registra o motivo de redrive e atualiza métricas das duas filas

#### Scenario: DLQ incompatível
- **WHEN** o usuário configura uma DLQ FIFO para uma fila Standard, ou o inverso
- **THEN** o simulador rejeita a política de redrive e explica a incompatibilidade de tipos

### Requirement: Retenção e expiração
O simulador SHALL remover mensagens que permaneçam na fila além do período de retenção configurado. A expiração SHALL ser distinguida visualmente de uma exclusão pelo consumidor e de um redrive para DLQ.

#### Scenario: Retenção expirada
- **WHEN** uma mensagem disponível ou reentregável ultrapassa a retenção configurada
- **THEN** o simulador a remove, incrementa a métrica de expiradas e registra que ela expirou por retenção

### Requirement: Observabilidade do ciclo de vida
O simulador SHALL exibir métricas de mensagens enviadas, publicadas, disponíveis, atrasadas, em voo, recebidas, excluídas, redirecionadas, deduplicadas e expiradas. O inspetor SHALL mostrar corpo, atributos, origem, destino, grupo FIFO, timestamps e histórico.

#### Scenario: Inspecionar mensagem em voo
- **WHEN** o usuário seleciona uma mensagem recebida por consumidor
- **THEN** o inspetor mostra sua fila de origem, contador de recebimentos, visibility timeout restante e ações de excluir ou alterar visibilidade

#### Scenario: Filtrar eventos de ciclo de vida
- **WHEN** o usuário filtra o log por redrive, timeout ou deduplicação
- **THEN** o painel mostra apenas os eventos correspondentes mantendo seus dados de rastreio
