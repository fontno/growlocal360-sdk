import { createHmac, timingSafeEqual } from 'crypto';
import axios from 'axios';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
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

  /**
   * Register a webhook with the GrowLocal360 service
   */
  async registerWebhook(webhookUrl: string, events: string[] = ['job.created']): Promise<WebhookRegistrationResponse> {
    try {
      const response = await axios.post(
        `${this.config.apiUrl}/api/webhooks/register`,
        { webhook_url: webhookUrl, events },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          }
        }
      );

      return { success: true, webhook_id: response.data.webhook_id };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return { success: false, error: `HTTP ${error.response?.status}: ${error.response?.statusText}` };
      }
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Unregister a webhook
   */
  async unregisterWebhook(webhookId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await axios.delete(`${this.config.apiUrl}/api/webhooks/${webhookId}`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        }
      });

      return { success: true };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return { success: false, error: `HTTP ${error.response?.status}: ${error.response?.statusText}` };
      }
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Verify webhook signature and parse payload
   */
  verifyWebhook(
    body: string, 
    signature: string, 
    secret?: string
  ): WebhookVerificationResult {
    try {
      const webhookSecret = secret || this.config.secret;
      
      if (!webhookSecret) {
        return { isValid: false, error: 'No webhook secret provided' };
      }

      // Create HMAC signature
      const expectedSignature = createHmac('sha256', webhookSecret)
        .update(body, 'utf8')
        .digest('hex');

      // Remove 'sha256=' prefix if present
      const cleanSignature = signature.replace('sha256=', '');
      
      // Compare signatures securely
      const isValid = timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(cleanSignature, 'hex')
      );

      if (!isValid) {
        return { isValid: false, error: 'Invalid signature' };
      }

      // Parse payload
      const payload: WebhookPayload = JSON.parse(body);
      
      return { isValid: true, payload };
    } catch (error) {
      return { 
        isValid: false, 
        error: error instanceof Error ? error.message : 'Failed to verify webhook' 
      };
    }
  }

  /**
   * Download image from URL and save to public folder
   */
  async downloadImage(
    imageUrl: string, 
    jobId: string, 
    index: number,
    publicDir: string = 'public/jobs'
  ): Promise<string> {
    try {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      
      // Extract file extension from URL or content-type
      const urlExtension = imageUrl.split('.').pop()?.split('?')[0];
      const contentType = response.headers['content-type'];
      let extension = 'jpg';
      
      if (urlExtension && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(urlExtension.toLowerCase())) {
        extension = urlExtension.toLowerCase();
      } else if (contentType) {
        const extMap: Record<string, string> = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/gif': 'gif',
          'image/webp': 'webp',
          'image/svg+xml': 'svg'
        };
        extension = extMap[contentType] || 'jpg';
      }
      
      // Create unique filename
      const filename = `job-${jobId}-${index}.${extension}`;
      const fullPublicDir = join(process.cwd(), publicDir);
      const filePath = join(fullPublicDir, filename);
      
      // Ensure directory exists
      await mkdir(fullPublicDir, { recursive: true });
      
      // Save image
      await writeFile(filePath, buffer);
      
      // Return the public URL path
      return `/${publicDir.replace('public/', '')}/${filename}`;
    } catch (error) {
      console.error(`Failed to download image ${imageUrl}:`, error);
      // Return original URL if download fails
      return imageUrl;
    }
  }

  /**
   * Download all images for a job
   */
  async downloadJobImages(
    jobData: JobData,
    publicDir: string = 'public/jobs'
  ): Promise<string[]> {
    const localImagePaths: string[] = [];
    
    if (jobData.job_images && jobData.job_images.length > 0) {
      console.log(`Downloading ${jobData.job_images.length} images for job ${jobData.job_id}...`);
      
      for (let i = 0; i < jobData.job_images.length; i++) {
        const imageUrl = jobData.job_images[i];
        const localPath = await this.downloadImage(imageUrl, jobData.job_id, i, publicDir);
        localImagePaths.push(localPath);
      }
      
      console.log(`Downloaded ${localImagePaths.length} images successfully`);
    }
    
    return localImagePaths;
  }
}

// Export types
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