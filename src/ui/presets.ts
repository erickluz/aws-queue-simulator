import { emptyTopology } from '../core/engine';
import type { AwsTopology, SqsQueue } from '../domain/types';

export function alignTopology(t: AwsTopology) {
  const lane = (index: number) => 100 + index * 480;
  t.queues.forEach((q,i)=>q.position={x:1290,y:lane(i)});
  t.subscriptions.forEach(s=>s.position={x:870,y:t.queues.find(q=>q.id===s.queueId)?.position.y??100});
  t.topics.forEach((topic,i)=>{
    const ys=t.subscriptions.filter(s=>s.topicId===topic.id).map(s=>s.position.y);
    topic.position={x:450,y:ys.length?(Math.min(...ys)+Math.max(...ys))/2:lane(i)};
  });
  t.producers.forEach((p,i)=>p.position={x:30,y:[...t.topics,...t.queues].find(n=>n.id===p.targetId)?.position.y??lane(i)});
  t.consumers.forEach((c,i)=>c.position={x:1730,y:t.queues.find(q=>q.id===c.queueId)?.position.y??lane(i)});
}
export function createPreset(name = 'default'): AwsTopology {
  const t=emptyTopology();
  t.name=`SNS/SQS · ${name}`;
  const queue=(id:string,label:string):SqsQueue=>({id,kind:'queue',name:label,queueKind:'standard',delaySeconds:0,visibilityTimeout:30,retentionSeconds:345600,longPollingSeconds:5,position:{x:0,y:0},metrics:{sent:0,available:0,delayed:0,inFlight:0,received:0,deleted:0,redriven:0,deduplicated:0,expired:0}});
  t.producers.push({id:'producer-api',kind:'producer',name:'Order API',targetId:'topic-orders',sent:0,position:{x:0,y:0},
    messageTemplate:{body:'{"orderId":"order-001","total":149.9}',attributes:{eventType:'order.created',source:'checkout'}}});
  t.topics.push({id:'topic-orders',kind:'topic',name:'orders',queueKind:'standard',contentDeduplication:false,published:0,position:{x:0,y:0}});
  t.queues.push(queue('queue-orders','orders-processing'));
  t.subscriptions.push({id:'sub-orders',kind:'subscription',topicId:'topic-orders',queueId:'queue-orders',filter:{},rawDelivery:false,position:{x:0,y:0}});
  t.consumers.push({id:'consumer-worker',kind:'consumer',name:'Order worker',queueId:'queue-orders',status:'idle',processed:0,position:{x:0,y:0}});
  if(name==='fanout'||name==='filter') {
    t.queues.push(queue('queue-audit',name==='filter'?'orders-cancelled':'audit'));
    t.subscriptions.push({id:'sub-audit',kind:'subscription',topicId:'topic-orders',queueId:'queue-audit',
      filter:name==='filter'?{eventType:'order.cancelled'}:{},rawDelivery:true,position:{x:0,y:0}});
    t.consumers.push({id:'consumer-audit',kind:'consumer',name:name==='filter'?'Cancellation worker':'Audit worker',queueId:'queue-audit',status:'idle',processed:0,position:{x:0,y:0}});
  }
  if(name==='filter') t.subscriptions[0].filter={eventType:'order.created'};
  if(name==='fifo') {
    t.topics[0].name='orders.fifo'; t.topics[0].queueKind='fifo'; t.topics[0].contentDeduplication=true;
    t.queues[0].name='orders.fifo'; t.queues[0].queueKind='fifo';
    Object.assign(t.producers[0].messageTemplate!,{groupId:'orders',deduplicationId:'order-001'});
  }
  if(name==='retry') {
    t.queues.push(queue('queue-dlq','orders-dlq'));
    t.queues[0].deadLetterQueueId='queue-dlq'; t.queues[0].maxReceiveCount=1; t.queues[0].visibilityTimeout=5;
    t.consumers.push({id:'consumer-dlq',kind:'consumer',name:'DLQ inspector',queueId:'queue-dlq',status:'idle',processed:0,position:{x:0,y:0}});
    t.producers[0].messageTemplate!.attributes.scenario='retry';
  }
  alignTopology(t);
  return t;
}
