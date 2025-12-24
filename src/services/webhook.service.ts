import axios from 'axios';
import crypto from 'crypto';

export class WebhookService {
  async sendWebhook({ url, secret, payload, jobId, type }: { url: string; secret?: string; payload: any; jobId: string; type?: string }): Promise<void> {
    try {
      const bodyString = JSON.stringify(payload);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (secret) {
        const sig = crypto.createHmac('sha256', secret).update(bodyString).digest('hex');
        headers['X-Webhook-Signature'] = sig;
      }

      if (type) {
        headers['X-Webhook-Type'] = type;
      }

      await axios.post(url, bodyString, { headers, timeout: 10000 });
      console.log(`✅ Webhook POST successful for job ${jobId} -> ${url}`);
    } catch (error) {
      console.error(`❌ Failed to deliver webhook for job ${jobId} to ${url}:`, error instanceof Error ? error.message : error);
      // Do not throw - webhook failure should not cause job retries
    }
  }
}

export const webhookService = new WebhookService();