export interface WorkerConfig {
  autoProcess: boolean;
  processingSeconds: number;
  outcome: 'success' | 'failure';
  failureAction: 'retry' | 'discard' | 'wait';
  retryDelaySeconds: number;
  autoPoll: boolean;
  pollIntervalSeconds: number;
}
export const workerDefaults: WorkerConfig = {
  autoProcess:false, processingSeconds:3, outcome:'success', failureAction:'retry',
  retryDelaySeconds:5, autoPoll:false, pollIntervalSeconds:2,
};
export function workerConfig(config?: Partial<WorkerConfig>): WorkerConfig { return {...workerDefaults,...config}; }
export function validateWorker(value: unknown): string | undefined {
  if(value===undefined) return;
  if(!value||typeof value!=='object'||Array.isArray(value)) return 'Configuração do worker inválida.';
  const c=workerConfig(value);
  if(typeof c.autoProcess!=='boolean'||typeof c.autoPoll!=='boolean') return 'As opções automáticas devem ser booleanas.';
  for(const [key,min,max] of [['processingSeconds',0,43200],['retryDelaySeconds',0,43200],['pollIntervalSeconds',1,300]] as const) {
    if(!Number.isInteger(c[key])||c[key]<min||c[key]>max) return `${key} deve estar entre ${min} e ${max} segundos inteiros.`;
  }
  if(!['success','failure'].includes(c.outcome)) return 'Resultado do processamento inválido.';
  if(!['retry','discard','wait'].includes(c.failureAction)) return 'Política de falha inválida.';
}
