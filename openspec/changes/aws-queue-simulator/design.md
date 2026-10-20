# Design

## Context

O repositório atual é uma SPA Vite/TypeScript que centraliza estado, animações e logs em um motor AMQP, com renderer, sidebar, modais e presets separados. Ele será analisado como referência de layout e interação. A implementação desta mudança ocorrerá em um novo repositório e não herdará o domínio, o motor ou os arquivos AMQP. Veja `proposal.md` para a motivação e os specs para o contrato comportamental.

## Goals / Non-Goals

**Goals:**

- Criar uma aplicação AWS-first independente, com interface inspirada no simulador de referência.
- Reproduzir a experiência visual útil: canvas, nós reposicionáveis, conexões animadas, editor, inspector, métricas, logs, presets e JSON de topologia.
- Converter o comportamento visual de produtor, fila, consumidor, timeout e falha para conceitos SNS/SQS corretos.
- Manter a simulação inteiramente client-side e repetível para fins didáticos.

**Non-Goals:**

- Portar, executar ou manter qualquer recurso RabbitMQ/AMQP no novo repositório.
- Oferecer modo de produto, compatibilidade, conversão ou importação de topologias RabbitMQ.
- Conectar à AWS, usar SDK, emular endpoints, IAM, KMS, políticas de recurso, quotas de conta ou cobrança.
- Prometer equivalência operacional completa com os serviços AWS.

## Decisions

### 1. Inicializar um repositório novo com domínio AWS exclusivo

O novo projeto terá tipos, estado, motor, presets e serialização próprios para `SnsTopic`, `SqsQueue`, `SnsSubscription`, produtor, consumidor e mensagem AWS. O repositório de referência será consultado somente para identificar estrutura visual e eventos de interface que devem ser recriados.

**Rationale:** elimina acoplamento a `TopologyState` e às invariantes AMQP, permitindo que todo nome e comportamento pertença a SNS/SQS.

**Alternatives considered:**
- Clonar o repositório e substituir AMQP gradualmente: rejeitado; preservaria arquivos, rótulos e caminhos incompatíveis no novo produto.
- Generalizar o modelo AMQP existente: rejeitado; aumentaria o escopo e continuaria misturando conceitos de serviços distintos.

### 2. Recriar a camada visual por contratos de UI, não por cópia do domínio

A análise do projeto de referência identificará canvas, cartões, conexões, drag-and-drop, animações de pacote, inspector, sidebar, modais, logs e presets. Esses comportamentos serão reimplementados no novo repositório com contratos de dados AWS; nenhum componente assumirá exchange, binding, routing key ou ACK/NACK.

**Rationale:** preserva a familiaridade da interface sem transportar semântica errada.

**Alternatives considered:**
- Copiar arquivos de UI e condicionar nomes AMQP: rejeitado; manteria vocabulário e fluxos indevidos.

### 3. Modelar SQS como uma máquina de estados temporizada

A mensagem terá estados `publishing`, `delayed`, `available`, `in-flight`, `deleted`, `redriven`, `expired` e `deduplicated`. Um scheduler central controlará delay, visibility timeout, reentrega, retenção e redrive. A recepção gera um receipt handle simulado; DeleteMessage é a única ação que encerra a mensagem com sucesso.

**Rationale:** torna visíveis as diferenças essenciais entre polling SQS e confirmação AMQP.

**Alternatives considered:**
- Tratar DeleteMessage como ACK: rejeitado; esconderia receipt handle e visibility timeout.
- Usar um timer independente por mensagem: rejeitado; dificultaria reload de preset, importação e consistência do canvas.

### 4. Modelar SNS por publicação e entrega independente em assinaturas

Publicar em um tópico SNS avaliará cada assinatura pelo filtro de atributos e criará uma cópia destinada à fila elegível. Raw delivery definirá corpo/atributos contra envelope didático. Tópicos e filas FIFO validarão sufixo `.fifo`, compatibilidade de destino, MessageGroupId e deduplicação de cinco minutos.

**Rationale:** representa fan-out e filtros SNS sem usar equivalentes falsos de exchange ou binding.

**Alternatives considered:**
- Usar routing keys para selecionar fila: rejeitado; filtros SNS são definidos por atributos de mensagem.

### 5. Tornar aproximações Standard e FIFO explícitas

Filas Standard indicarão entrega pelo menos uma vez e ordenação de melhor esforço, sem introduzir aleatoriedade automática. Filas FIFO manterão ordem por MessageGroupId e impedirão que uma próxima mensagem do mesmo grupo avance enquanto existir mensagem do grupo em voo; grupos distintos poderão progredir em paralelo.

**Rationale:** oferece demonstrações compreensíveis e reprodutíveis das garantias.

### 6. Validar entrada e importação antes de mutar o estado

Formulários e importação validarão nome FIFO, intervalos AWS didáticos, assinatura FIFO, DLQ compatível e referências da topologia. Operações inválidas informarão o motivo e não produzirão estado parcial.

**Rationale:** mantém o simulador coerente mesmo quando a topologia vem de JSON.

## Risks / Trade-offs

- [O novo repositório pode divergir visualmente do original] -> documentar a referência de cada interação e validar os fluxos lado a lado durante o desenvolvimento.
- [Copiar aparência pode levar à cópia de semântica AMQP] -> revisar cada rótulo, ação e estado contra os specs AWS antes de incluí-lo.
- [A superfície de SNS/SQS é extensa] -> limitar a primeira versão às propriedades definidas nos specs e identificar aproximações didáticas.
- [Timers e remoção de nós podem deixar referências órfãs] -> centralizar transições no scheduler e validar referências antes de cada mudança de estado.
- [Usuários podem confundir o simulador com o serviço real] -> exibir limites da simulação no guia e na documentação.

## Migration Plan

1. Criar e versionar o novo repositório sem importar o código ou os artefatos AMQP.
2. Registrar um inventário das interações visuais do projeto de referência e recriá-las com dados AWS.
3. Implementar domínio, motor e UI AWS, depois presets e serialização.
4. Verificar visualmente os fluxos contra a referência e funcionalmente contra os specs SNS/SQS.
5. Caso uma interação visual não se traduza para AWS, omiti-la em vez de preservar comportamento AMQP.
