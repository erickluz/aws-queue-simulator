import type { QueueKind, SnsTopic, SqsQueue } from './types';
export const LIMITS = { delay: [0, 900], visibility: [0, 43200], retention: [60, 1209600], longPolling: [0, 20] } as const;
const range = (name: string, value: number, [min, max]: readonly [number, number]) => Number.isFinite(value) && value >= min && value <= max ? undefined : `${name} deve estar entre ${min} e ${max} segundos.`;
export function validateQueue(queue: SqsQueue, allQueues: SqsQueue[]): string | undefined {
  if (queue.queueKind === 'fifo' && !queue.name.endsWith('.fifo')) return 'Filas FIFO devem terminar com .fifo.';
  for (const [name, value, limits] of [['Delay', queue.delaySeconds, LIMITS.delay], ['Visibility timeout', queue.visibilityTimeout, LIMITS.visibility], ['Retenção', queue.retentionSeconds, LIMITS.retention], ['Long polling', queue.longPollingSeconds, LIMITS.longPolling] ] as const) { const error = range(name, value, limits); if (error) return error; }
  if (queue.deadLetterQueueId) { const dlq = allQueues.find(item => item.id === queue.deadLetterQueueId); if (!dlq) return 'A DLQ selecionada não existe.'; if (dlq.queueKind !== queue.queueKind) return 'A DLQ deve ter o mesmo tipo Standard ou FIFO da fila de origem.'; if (!queue.maxReceiveCount || queue.maxReceiveCount < 1) return 'maxReceiveCount deve ser ao menos 1.'; }
}
export function validateTopic(topic: SnsTopic): string | undefined { return topic.queueKind === 'fifo' && !topic.name.endsWith('.fifo') ? 'Tópicos FIFO devem terminar com .fifo.' : undefined; }
export function compatibleKinds(source: QueueKind, target: QueueKind) { return source === target; }
