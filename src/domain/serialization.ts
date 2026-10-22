import type { AwsTopology } from './types';
import { validateWorker } from './worker';
import { validateProduction } from './production';

export const exportTopology = (topology: AwsTopology) => JSON.stringify(topology, null, 2);
export function importTopology(value: string): AwsTopology {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || (parsed as { format?: string }).format !== 'aws-queue-simulator/v1') throw new Error('Formato inválido: somente topologias AWS do simulador são aceitas.');
  const topology = parsed as AwsTopology;
  for (const key of ['producers', 'topics', 'queues', 'subscriptions', 'consumers', 'messages'] as const) if (!Array.isArray(topology[key])) throw new Error(`Topologia inválida: ${key} deve ser uma lista.`);
  for(const consumer of topology.consumers) {
    const error=validateWorker(consumer.worker);
    if(error) throw new Error(error);
  }
  for(const producer of topology.producers) {
    const error=validateProduction(producer.production);if(error) throw new Error(error);
    if(producer.running!==undefined) producer.running=false;
  }
  for(const message of topology.messages) {
    if(message.retryCount!==undefined&&(!Number.isInteger(message.retryCount)||message.retryCount<0)) throw new Error('Contagem de retries inválida.');
    if(message.invalid!==undefined&&typeof message.invalid!=='boolean') throw new Error('Indicador de mensagem inválida deve ser booleano.');
  }
  return topology;
}
