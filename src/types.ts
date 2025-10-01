export interface JobData {
  job_id: string;
  job_title: string;
  job_description: string;
  job_city: string;
  job_state: string;
  job_date: string;
  job_created_at: string;
  job_images: string[];
  job_site: string;
  job_tags: string;
  job_categories: string;
  job_brand: string;
  job_service: string;
  job_zipcode: string;
  job_brands: string[];
  job_services: string[];
  job_street: string;
  employee?: string;
}

export interface WebhookPayload {
  event: 'job.created' | 'job.updated' | 'job.deleted';
  data: JobData;
  timestamp: number;
  site_id: string;
  test?: boolean;
  retry?: boolean;
}

export interface WebhookConfig {
  secret?: string;
  endpoint?: string;
  generateStaticPages?: boolean;
  pageTemplate?: string;
  outputDir?: string;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  payload?: WebhookPayload;
  error?: string;
}

export interface SDKConfig {
  apiUrl: string;
  apiKey?: string;
  secret?: string;
}

export interface WebhookRegistrationResponse {
  success: boolean;
  webhook_id?: string;
  error?: string;
}