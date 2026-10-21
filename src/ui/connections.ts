import type { AwsTopology } from '../domain/types';

export function connectionInfo(t: AwsTopology) {
  const attrs=(values:Record<string,string>)=>Object.entries(values).map(([k,v])=>`${k}=${v}`).join(' · ')||'sem atributos';
  return [
    ...t.producers.map(p=>({from:p.id,to:p.targetId,
      label:`MessageAttributes · ${attrs(p.messageTemplate?.attributes??{eventType:'order.created'})}`})),
    ...t.subscriptions.flatMap(s=>[
      {from:s.topicId,to:s.id,label:Object.keys(s.filter).length?`Filtro · ${attrs(s.filter)}`:'Filtro · todos os atributos'},
      {from:s.id,to:s.queueId,label:s.rawDelivery?'Raw delivery · MessageAttributes':'Envelope SNS · MessageAttributes'},
    ]),
    ...t.consumers.map(c=>({from:c.queueId,to:c.id,label:'ReceiveMessage · atributos + receipt handle'})),
    ...t.queues.filter(q=>q.deadLetterQueueId).map(q=>({from:q.id,to:q.deadLetterQueueId!,label:`Redrive · maxReceiveCount=${q.maxReceiveCount}`})),
  ];
}
