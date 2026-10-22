# AWS SNS + SQS Queue Lab

Simulador didático client-side de tópicos SNS e filas SQS. Não usa conta AWS, SDK, rede, credenciais ou serviços provisionados.

## Executar

```powershell
npm install
npm run dev
```

Abra a URL que o Vite mostrar (normalmente `http://localhost:5173`). Não abra o `index.html` da raiz pelo Explorador: ele é o arquivo-fonte e precisa do Vite para transformar TypeScript.

Para uma versão estática:

```powershell
npm run build
```

Abra `dist/index.html` ou publique o conteúdo da pasta `dist`.

## Produção automática e limite de retries

Clique no produtor para abrir o painel direito. Configure o intervalo entre emissões (100–60000 ms), mensagens por emissão (1–10) e a probabilidade de conteúdo inválido (0–100%). Salve e clique em **Iniciar produção**; **Pausar produção** interrompe novos envios, sem cancelar mensagens já em trânsito. O envio manual continua disponível. Em FIFO, escolha identificadores únicos por envio ou reutilize o identificador do template para demonstrar deduplicação.

O percentual é probabilístico, não uma quota exata por lote. Conteúdo inválido é uma falha simulada da aplicação consumidora, não uma rejeição de SNS/SQS: a mensagem percorre o fluxo e segue a política de falha do consumidor. Importar ou carregar uma topologia deixa os produtores pausados.

No consumidor, habilite **Limitar retries** e configure o máximo. Um limite de 2 permite duas devoluções à fila; a terceira falha descarta a mensagem via DeleteMessage, sem contar como sucesso. Zero descarta na primeira falha; desabilitado mantém retries ilimitados. A contagem pertence à mensagem e é independente do `maxReceiveCount` da política de DLQ. O descarte ocorre quando a ação de retry é executada; expiração de visibilidade continua seguindo as regras da fila.

Verificação automatizada destas funcionalidades: `npm run verify:production`.

## Limites da simulação

O laboratório demonstra publicação SNS, fan-out, filtros de atributos, filas Standard/FIFO, delay, polling, visibility timeout, DeleteMessage, reentrega, deduplicação, retenção e redrive para DLQ. É uma aproximação visual, não uma emulação integral de AWS.

O produto usa exclusivamente SNS/SQS. A referência RabbitMQ serviu apenas para comparação de layout e interação; comportamentos AMQP não são funcionalidades deste simulador.
