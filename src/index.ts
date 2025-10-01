import { createHmac, timingSafeEqual } from 'crypto';
import axios from 'axios';
import type {
  JobData,
  WebhookPayload,
  WebhookConfig,
  WebhookVerificationResult,
  SDKConfig,
  WebhookRegistrationResponse
} from './types';

export class GrowLocal360SDK {
  private config: SDKConfig;

  constructor(config: SDKConfig) {
    this.config = config;
  }

  async registerWebhook(webhookUrl: string, events: string[] = ['job.created']): Promise<WebhookRegistrationResponse> {
    try {
      const response = await axios.post(
        `${this.config.apiUrl}/api/webhooks/register`,
        {
          webhook_url: webhookUrl,
          events
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`
          }
        }
      );
      const data = response.data;
      return { success: true, webhook_id: data.webhook_id };
    } catch (error: any) {
      if (error.response) {
        return { success: false, error: `HTTP ${error.response.status}: ${error.response.statusText}` };
      }
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async unregisterWebhook(webhookId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await axios.delete(
        `${this.config.apiUrl}/api/webhooks/${webhookId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`
          }
        }
      );
      return { success: true };
    } catch (error: any) {
      if (error.response) {
        return { success: false, error: `HTTP ${error.response.status}: ${error.response.statusText}` };
      }
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  verifyWebhook(body: string, signature: string, secret?: string): WebhookVerificationResult {
    try {
      const webhookSecret = secret || this.config.secret;
      if (!webhookSecret) {
        return { isValid: false, error: 'No webhook secret provided' };
      }
      const expectedSignature = createHmac('sha256', webhookSecret)
        .update(body, 'utf8')
        .digest('hex');
      const cleanSignature = signature.replace('sha256=', '');
      const isValid = timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(cleanSignature, 'hex')
      );
      if (!isValid) {
        return { isValid: false, error: 'Invalid signature' };
      }
      const payload: WebhookPayload = JSON.parse(body);
      return { isValid: true, payload };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Failed to verify webhook'
      };
    }
  }
}

export * from './types';

// Export utility function for Next.js API routes
export const createWebhookHandler = (sdk: GrowLocal360SDK, config: WebhookConfig = {}) => {
  return async (req: any, res: any) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
      const signature = req.headers['x-growlocal360-signature'];
      if (!signature) {
        return res.status(400).json({ error: 'Missing signature header' });
      }
      const body = JSON.stringify(req.body);
      const verification = sdk.verifyWebhook(body, signature, config.secret);
      if (!verification.isValid) {
        return res.status(401).json({ error: verification.error || 'Invalid signature' });
      }
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Webhook handler error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
};
