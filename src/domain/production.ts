export interface ProductionConfig {
  intervalMs:number;
  messagesPerEmission:number;
  invalidPercent:number;
  deduplicationMode:'unique'|'template';
}
export const productionDefaults:ProductionConfig={intervalMs:1000,messagesPerEmission:1,invalidPercent:0,deduplicationMode:'unique'};
export function productionConfig(value?:Partial<ProductionConfig>):ProductionConfig {return {...productionDefaults,...value};}
export function validateProduction(value:unknown):string|undefined {
  if(value===undefined) return;
  if(!value||typeof value!=='object'||Array.isArray(value)) return 'Configuração de produção inválida.';
  const c=productionConfig(value);
  for(const [key,min,max] of [['intervalMs',100,60000],['messagesPerEmission',1,10],['invalidPercent',0,100]] as const) {
    if(!Number.isInteger(c[key])||c[key]<min||c[key]>max) return `${key} deve estar entre ${min} e ${max}.`;
  }
  if(!['unique','template'].includes(c.deduplicationMode)) return 'Modo de deduplicação inválido.';
}
