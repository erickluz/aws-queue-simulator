# Trama

<img src="public/brand/trama-logo.svg" alt="Trama — Mensageria em movimento" width="336">

**Mensageria em movimento.** Um laboratório visual para explorar SNS e SQS.

Simulador didático client-side de tópicos SNS e filas SQS. Não usa conta AWS, SDK, rede, credenciais ou serviços provisionados.

## Identidade

Trama representa as conexões entre produtores, tópicos, filas e consumidores. O símbolo ramificado expressa distribuição de mensagens; o ponto coral representa uma mensagem em movimento. A identidade combina violeta (`#C4B5FD`), verde-água (`#70E1CF`) e coral (`#FF7188`) sobre azul profundo (`#111C30`) e superfícies glass. A tipografia usa fontes do sistema, sem dependências externas.

Os arquivos vetoriais estão em `public/brand/`: `trama-logo.svg` é a assinatura completa e `trama-symbol.svg` é o ícone, também usado como favicon. Use preferencialmente sobre fundos escuros, preserve as proporções e mantenha espaço livre ao redor. O produto é independente e não afiliado à AWS. O nome é uma escolha criativa; não foi realizada pesquisa de disponibilidade de marca.

O nome técnico do pacote e o formato JSON `aws-queue-simulator/v1` permanecem inalterados para preservar a compatibilidade das topologias existentes.

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

## Publicar no GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` gera e publica a versão estática quando uma release é publicada. Pré-releases não são publicadas automaticamente. Também é possível executá-lo manualmente em **Actions → Deploy GitHub Pages → Run workflow**, escolhendo a branch ou tag desejada.

Para configurar a publicação:

1. Envie o workflow para a branch principal do repositório.
2. Em **Settings → Pages**, escolha **GitHub Actions** como fonte em **Build and deployment**.
3. Crie e publique uma release, por exemplo `v1.0.0`, apontando para o commit desejado.
4. Acompanhe a execução em **Actions**. Após a conclusão, o site estará disponível em <https://erickluz.github.io/aws-queue-simulator/>.

O Pages disponibiliza uma versão por vez; novas publicações substituem o site anterior. Projetos salvos ficam no armazenamento local do navegador: exporte-os em JSON antes de mudar de domínio ou dispositivo.

## Projetos locais

Use **Salvar** para dar um nome ao fluxo e guardá-lo neste navegador. Em **Projetos**, você pode reabrir ou excluir os projetos salvos. Salve novamente para atualizar o projeto após editar o fluxo. Os dados ficam no armazenamento local do navegador, então podem desaparecer se os dados do site forem apagados.

**Exportar projeto** baixa um arquivo JSON com os recursos, configurações, mensagens e posição do canvas. **Importar projeto** lê esse arquivo e cria uma nova cópia entre os projetos locais. Arquivos de topologia JSON exportados pelas versões anteriores também podem ser importados. Logs e animações em andamento não são preservados.

## Produção automática e limite de retries

Clique no produtor para abrir o painel direito. Configure o intervalo entre emissões (100–60000 ms), mensagens por emissão (1–10) e a probabilidade de conteúdo inválido (0–100%). Salve e clique em **Iniciar produção**; **Pausar produção** interrompe novos envios, sem cancelar mensagens já em trânsito. O envio manual continua disponível. Em FIFO, escolha identificadores únicos por envio ou reutilize o identificador do template para demonstrar deduplicação.

O percentual é probabilístico, não uma quota exata por lote. Conteúdo inválido é uma falha simulada da aplicação consumidora, não uma rejeição de SNS/SQS: a mensagem percorre o fluxo e segue a política de falha do consumidor. Importar ou carregar uma topologia deixa os produtores pausados.

No consumidor, habilite **Limitar retries** e configure o máximo. Um limite de 2 permite duas devoluções à fila; a terceira falha descarta a mensagem via DeleteMessage, sem contar como sucesso. Zero descarta na primeira falha; desabilitado mantém retries ilimitados. A contagem pertence à mensagem e é independente do `maxReceiveCount` da política de DLQ. O descarte ocorre quando a ação de retry é executada; expiração de visibilidade continua seguindo as regras da fila.

Verificação automatizada destas funcionalidades: `npm run verify:production`.

## Limites da simulação

O laboratório demonstra publicação SNS, fan-out, filtros de atributos, filas Standard/FIFO, delay, polling, visibility timeout, DeleteMessage, reentrega, deduplicação, retenção e redrive para DLQ. É uma aproximação visual, não uma emulação integral de AWS.

O produto usa exclusivamente SNS/SQS. A referência RabbitMQ serviu apenas para comparação de layout e interação; comportamentos AMQP não são funcionalidades deste simulador.
