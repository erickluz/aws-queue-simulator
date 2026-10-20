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

## Escopo didático

O laboratório demonstra publicação SNS, fan-out, filtros de atributos, filas Standard/FIFO, delay, polling, visibility timeout, DeleteMessage, reentrega, deduplicação, retenção e redrive para DLQ. É uma aproximação visual, não uma emulação integral de AWS.

O produto usa exclusivamente SNS/SQS. A referência RabbitMQ serviu apenas para comparação de layout e interação; comportamentos AMQP não são funcionalidades deste simulador.
