# Tasks

## 1. Análise da referência visual

- [x] 1.1 Inventariar no projeto de referência os componentes visuais e interações de canvas, cartões, conexões, animações, drag-and-drop, sidebar, inspector, modais, logs, presets e importação/exportação; verificar que cada item possui destino ou exclusão explícita no novo produto.
- [x] 1.2 Mapear cada comportamento de produtor, fila, consumidor, timeout e falha da referência para SNS/SQS ou marcá-lo como não aplicável; verificar que o mapa não contém exchange, binding, routing key, ACK ou NACK como requisitos do novo projeto.
- [x] 1.3 Registrar os fluxos visuais de referência que serão usados para comparação manual durante o desenvolvimento; verificar que os fluxos cobrem publicação, entrega, consumo e erro.

## 2. Fundação do novo repositório AWS

- [x] 2.1 Inicializar o novo repositório como aplicação web client-side independente, com scripts de desenvolvimento, build e estrutura de módulos; verificar que instalação e comando de build funcionam no novo repositório.
- [x] 2.2 Criar a casca visual AWS com viewport, canvas, painel lateral, área de logs e contêineres de modal, inspirada na referência sem usar terminologia AMQP; verificar que a tela inicial exibe somente rótulos SNS/SQS.
- [x] 2.3 Definir tipos e serialização para topologia AWS, tópico SNS, fila SQS, assinatura, produtor, consumidor e mensagem; verificar com checagem de tipos e um JSON de topologia válido.

## 3. Motor AWS e regras de configuração

- [x] 3.1 Implementar validação de nomes FIFO, delay, visibility timeout, retenção, long polling, DLQ e compatibilidade FIFO; verificar que entradas inválidas não alteram a topologia e exibem o motivo.
- [x] 3.2 Implementar motor de publicação SNS, envio direto SQS, filtro de assinatura, raw delivery e animações de entrega; verificar um fan-out para duas filas e uma assinatura filtrada.
- [ ] 3.3 Implementar estados delayed, available, in-flight, deleted, redriven, expired e deduplicated com scheduler central; verificar transições por logs, métricas e animação.
- [x] 3.4 Implementar regras Standard/FIFO, MessageGroupId, deduplicação de cinco minutos e ordenação por grupo; verificar supressão de duplicata e bloqueio de grupo em voo.
- [ ] 3.5 Implementar polling, long polling simulado, DeleteMessage, ChangeMessageVisibility, reentrega, maxReceiveCount e redrive para DLQ; verificar que somente DeleteMessage conclui a mensagem e que timeout pode redirecioná-la.

## 4. Interface e cenários AWS

- [ ] 4.1 Implementar cartões, conexões, reposicionamento e animações para produtor, tópico, assinatura, fila e consumidor AWS; verificar criação, remoção e movimentação de cada tipo de nó.
- [ ] 4.2 Implementar editor e modais de tópico, fila, assinatura, produtor e consumidor com ações SQS de polling, exclusão e alteração de visibilidade; verificar todos os limites e mensagens definidos nos specs.
- [ ] 4.3 Implementar sidebar, inspector e filtros de log para atributos, receipt handle, ApproximateReceiveCount, métricas de disponibilidade, redrive, timeout, retenção e deduplicação; verificar uma mensagem disponível e uma em voo.
- [ ] 4.4 Criar presets SNS fan-out, filtro de atributo, FIFO/deduplicação e retry/redrive; verificar os resultados observáveis de cada preset contra os specs.
- [ ] 4.5 Implementar importação/exportação exclusiva do formato AWS e rejeição explícita de topologia AMQP; verificar reimportação do próprio arquivo e rejeição de arquivo de outro domínio.
- [ ] 4.6 Criar guia e README do novo repositório explicando SNS, SQS, limites didáticos e diferenças em relação a RabbitMQ; verificar que nenhum fluxo AMQP é apresentado como funcionalidade do produto.

## 5. Verificação integrada

- [ ] 5.1 Executar o build do novo repositório e validar manualmente publicação, delay, polling, visibility timeout, DeleteMessage, reentrega, retenção, DLQ, FIFO e filtros SNS; verificar que todos os fluxos completam sem erro no console.
- [ ] 5.2 Comparar os fluxos visuais selecionados com a referência e confirmar que a experiência é equivalente onde aplicável, com semântica AWS correta; verificar o registro da comparação para cada fluxo inventariado.

## Workflow follow-up

- Revisar os artefatos e a implementação antes de arquivar a mudança.
- Arquivar a mudança após todos os itens rastreados estarem concluídos.
