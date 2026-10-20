import type { AwsTopology } from './types';

export const exportTopology = (topology: AwsTopology) => JSON.stringify(topology, null, 2);
export function importTopology(value: string): AwsTopology {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || (parsed as { format?: string }).format !== 'aws-queue-simulator/v1') throw new Error('Formato inválido: somente topologias AWS do simulador são aceitas.');
  const topology = parsed as AwsTopology;
  for (const key of ['producers', 'topics', 'queues', 'subscriptions', 'consumers', 'messages'] as const) if (!Array.isArray(topology[key])) throw new Error(`Topologia inválida: ${key} deve ser uma lista.`);
  return topology;
}
