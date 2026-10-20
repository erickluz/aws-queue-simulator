export type ResourceKind = 'producer' | 'topic' | 'queue' | 'subscription' | 'consumer';
export type QueueKind = 'standard' | 'fifo';
export type MessageState = 'publishing' | 'delayed' | 'available' | 'in-flight' | 'deleted' | 'redriven' | 'expired' | 'deduplicated';
export interface Position { x: number; y: number }
export interface Producer { id: string; kind: 'producer'; name: string; targetId: string; position: Position; sent: number }
export interface SnsTopic { id: string; kind: 'topic'; name: string; queueKind: QueueKind; contentDeduplication: boolean; position: Position; published: number }
export interface SqsQueue { id: string; kind: 'queue'; name: string; queueKind: QueueKind; delaySeconds: number; visibilityTimeout: number; retentionSeconds: number; longPollingSeconds: number; deadLetterQueueId?: string; maxReceiveCount?: number; position: Position; metrics: QueueMetrics }
export interface Subscription { id: string; kind: 'subscription'; topicId: string; queueId: string; filter: Record<string, string>; rawDelivery: boolean; position: Position }
export interface Consumer { id: string; kind: 'consumer'; name: string; queueId: string; position: Position; status: 'idle' | 'polling' | 'busy'; processed: number }
export interface QueueMetrics { sent: number; available: number; delayed: number; inFlight: number; received: number; deleted: number; redriven: number; deduplicated: number; expired: number }
export interface SimMessage { id: string; body: string; attributes: Record<string, string>; sourceId: string; queueId?: string; state: MessageState; createdAt: number; availableAt: number; visibilityUntil?: number; receivedCount: number; receiptHandle?: string; groupId?: string; deduplicationId?: string; history: string[] }
export interface Animation { id: string; fromId: string; toId: string; messageId: string; label: string; startedAt: number; duration: number }
export interface LogEvent { id: string; at: number; type: 'publish' | 'send' | 'deliver' | 'poll' | 'delete' | 'timeout' | 'redrive' | 'expired' | 'deduplicated' | 'validation'; message: string; messageId?: string }
export interface AwsTopology { format: 'aws-queue-simulator/v1'; name: string; producers: Producer[]; topics: SnsTopic[]; queues: SqsQueue[]; subscriptions: Subscription[]; consumers: Consumer[]; messages: SimMessage[] }
export interface SimulationState { topology: AwsTopology; animations: Animation[]; logs: LogEvent[] }
