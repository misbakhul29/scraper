import amqp from 'amqplib';
import * as dotenv from 'dotenv';

dotenv.config();

export interface ArticleJob {
  id: string;
  topic: string;
  keywords?: string[];
  category?: string;
  author?: string;
  sessionName?: string;
  createdAt: number;
}

export interface QueueStatus {
  queue: string;
  messageCount: number;
  consumerCount: number;
}

export class QueueService {
  private connection: amqp.Connection | null = null;
  private channel: amqp.ConfirmChannel | null = null;
  private readonly queueName = 'article_generation';
  private readonly exchangeName = 'article_exchange';
  private readonly routingKey = 'article.generate';
  private readonly rabbitmqUrl: string;

  constructor() {
    const host = process.env.RABBITMQ_HOST || 'localhost';
    const port = process.env.RABBITMQ_PORT || '5672';
    const user = process.env.RABBITMQ_USER || 'guest';
    const password = process.env.RABBITMQ_PASSWORD || 'guest';
    
    this.rabbitmqUrl = `amqp://${user}:${password}@${host}:${port}`;
  }

  /**
   * Connect to RabbitMQ
   */
  async connect(): Promise<void> {
    try {
      console.log('🔌 Connecting to RabbitMQ...');
      this.connection = await amqp.connect(this.rabbitmqUrl) as unknown as amqp.Connection;
      
      this.connection.on('error', (err: unknown) => {
        console.error('❌ RabbitMQ connection error:', err instanceof Error ? err.message : String(err));
      });

      this.connection.on('close', () => {
        console.warn('⚠️ RabbitMQ connection closed');
        this.channel = null;
      });

      this.channel = await (this.connection as any).createChannel() as amqp.ConfirmChannel;
      
      if (!this.channel) {
        throw new Error('Channel is null');
      }

      // Declare exchange
      await this.channel.assertExchange(this.exchangeName, 'direct', {
        durable: true,
      });

      // Declare queue
      await this.channel.assertQueue(this.queueName, {
        durable: true, // Queue survives broker restart
      });

      // Bind queue to exchange
      await this.channel.bindQueue(this.queueName, this.exchangeName, this.routingKey);

      console.log('✅ Connected to RabbitMQ');
      console.log(`📬 Queue: ${this.queueName}`);
      console.log(`📤 Exchange: ${this.exchangeName}`);
    } catch (error) {
      console.error('❌ Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  /**
   * Publish article generation job to queue
   */
  async publishArticleJob(job: Omit<ArticleJob, 'id' | 'createdAt'>): Promise<string> {
    if (!this.channel) {
      await this.connect();
    }

    const jobId = `article-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const articleJob: ArticleJob = {
      id: jobId,
      ...job,
      createdAt: Date.now(),
    };

    if (!this.channel) {
      throw new Error('Channel is null');
    }

    try {
      const published = this.channel.publish(
        this.exchangeName,
        this.routingKey,
        Buffer.from(JSON.stringify(articleJob)),
        {
          persistent: true, // Message survives broker restart
          messageId: jobId,
          timestamp: Date.now(),
        }
      );

      if (!published) {
        throw new Error('Failed to publish message to queue');
      }

      console.log(`📤 Published article job: ${jobId} (Topic: ${job.topic})`);
      return jobId;
    } catch (error) {
      console.error('❌ Failed to publish article job:', error);
      throw error;
    }
  }

  /**
   * Consume article generation jobs
   */
  async consumeArticleJobs(
    handler: (job: ArticleJob) => Promise<void>,
    options: { prefetch?: number } = {}
  ): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }

    const prefetch = options.prefetch || 1; // Process one job at a time (one browser)

    if (!this.channel) {
      throw new Error('Channel is null');
    }

    // Set prefetch to ensure only one job is processed at a time
    await this.channel.prefetch(prefetch);

    console.log(`👂 Listening for article generation jobs (prefetch: ${prefetch})...`);

    if (!this.channel) {
      throw new Error('Channel is null');
    }

    await this.channel.consume(
      this.queueName,
      async (msg: amqp.ConsumeMessage | null) => {
        if (!msg) {
          return;
        }

        const job: ArticleJob = JSON.parse(msg.content.toString());
        console.log(`\n📥 Received article job: ${job.id} (Topic: ${job.topic})`);

        if (!this.channel) {
          return;
        }

        try {
          await handler(job);
          // Acknowledge message after successful processing
          this.channel.ack(msg);
          console.log(`✅ Article job ${job.id} completed and acknowledged`);
        } catch (error) {
          console.error(`❌ Error processing article job ${job.id}:`, error);
          
          if (!this.channel) {
            return;
          }
          
          // Check if message should be requeued or sent to dead letter queue
          const retryCount = (msg.properties.headers?.['x-retry-count'] || 0) as number;
          
          if (retryCount < 3) {
            // Retry with backoff
            const retryDelay = Math.pow(2, retryCount) * 1000; // Exponential backoff
            console.log(`🔄 Retrying job ${job.id} (attempt ${retryCount + 1}/3) after ${retryDelay}ms`);
            
            setTimeout(() => {
              if (this.channel) {
                this.channel.nack(msg, false, true); // Requeue message
              }
            }, retryDelay);
          } else {
            // Max retries reached, reject and don't requeue
            console.error(`❌ Max retries reached for job ${job.id}, rejecting message`);
            this.channel.nack(msg, false, false);
          }
        }
      },
      {
        noAck: false, // Manual acknowledgment
      }
    );
  }

  /**
   * Get queue status
   */
  async getQueueStatus(): Promise<QueueStatus> {
    if (!this.channel) {
      await this.connect();
    }

    if (!this.channel) {
      throw new Error('Channel is null');
    }

    try {
      const queueInfo = await this.channel.checkQueue(this.queueName);
      return {
        queue: this.queueName,
        messageCount: queueInfo.messageCount,
        consumerCount: queueInfo.consumerCount,
      };
    } catch (error) {
      console.error('❌ Failed to get queue status:', error);
      throw error;
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await (this.connection as any).close();
        this.connection = null;
      }
      console.log('✅ RabbitMQ connection closed');
    } catch (error) {
      console.error('❌ Error closing RabbitMQ connection:', error);
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }
}

// Export singleton instance
export const queueService = new QueueService();

