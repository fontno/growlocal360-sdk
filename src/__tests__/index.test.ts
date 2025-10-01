import { GrowLocal360SDK } from '../index';

describe('GrowLocal360SDK', () => {
  const config = {
    apiUrl: 'https://api.example.com',
    secret: 'test-secret'
  };

  let sdk: GrowLocal360SDK;

  beforeEach(() => {
    sdk = new GrowLocal360SDK(config);
  });

  describe('verifyWebhook', () => {
    it('should verify a valid webhook signature', () => {
      const body = JSON.stringify({ event: 'job.created', data: { job_id: '123' }, timestamp: Date.now(), site_id: 'site1' });
      const secret = 'test-secret';
      const signature = require('crypto').createHmac('sha256', secret).update(body, 'utf8').digest('hex');

      const result = sdk.verifyWebhook(body, `sha256=${signature}`, secret);

      expect(result.isValid).toBe(true);
      expect(result.payload).toBeDefined();
    });

    it('should reject an invalid webhook signature', () => {
      const body = JSON.stringify({ event: 'job.created', data: { job_id: '123' }, timestamp: Date.now(), site_id: 'site1' });
      const invalidSignature = 'sha256=abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234'; // Valid hex but wrong

      const result = sdk.verifyWebhook(body, invalidSignature);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });
  });
});