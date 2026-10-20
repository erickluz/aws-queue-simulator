# Proposal

## Why

O simulador RabbitMQ existente fornece uma referência visual eficaz para ensinar mensageria, mas seu domínio AMQP não representa os serviços gerenciados da AWS. Um novo repositório, dedicado a SNS e SQS, permitirá reaproveitar a experiência visual enquanto ensina corretamente as semânticas de publicação, filas e consumo da AWS.

## What Changes

- Criar uma aplicação client-side independente, em um novo repositório, dedicada exclusivamente à simulação visual de SNS e SQS.
- Usar o projeto RabbitMQ apenas como referência para layout, canvas, animações, editor de topologia, métricas, logs, presets e importação/exportação.
- Modelar produtores, tópicos SNS, filas SQS, assinaturas e consumidores com terminologia e comportamentos AWS.
- Simular propriedades de tópicos e filas Standard/FIFO, filtros de assinatura, delay, polling, visibility timeout, DeleteMessage, reentrega, retenção, deduplicação e redrive para DLQ.
- **BREAKING** Não incluir RabbitMQ, AMQP, exchanges, bindings, ACK/NACK ou compatibilidade/importação de topologias do projeto de referência.

## Capabilities

### New Capabilities

- `aws-messaging-topology`: cria e visualiza produtores, tópicos SNS, filas SQS e assinaturas em uma topologia AWS exclusiva.
- `aws-message-lifecycle`: simula publicação, entrega, polling, invisibilidade, exclusão, reentrega, expiração, retenção e redrive de mensagens SQS.

### Modified Capabilities

- Nenhuma.

## Impact

- O projeto de referência é analisado somente para orientar interface e interações; nenhum código ou compatibilidade dele faz parte do produto novo.
- O novo repositório terá modelo de domínio, motor de simulação, presets, renderização, modais, painel de métricas, logs e serialização próprios.
- Não exige conta AWS, SDK, credenciais, chamadas de rede ou serviços provisionados.
