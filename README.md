# GrowLocal360 SDK

A Next.js SDK for integrating with GrowLocal360's webhook system to automatically generate static job pages.

## Installation
```bash
npm install growlocal360-sdk
```

## Usage

```typescript
// app/api/webhooks/jobs/route.js
import { GrowLocal360SDK, createWebhookHandler } from 'growlocal360-sdk';

const sdk = new GrowLocal360SDK({
  apiUrl: process.env.GROWLOCAL360_API_URL,
  secret: process.env.GROWLOCAL360_WEBHOOK_SECRET
});

export async function POST(request) {
  const signature = request.headers.get('x-growlocal360-signature');
  const body = await request.text();
  
  const verification = sdk.verifyWebhook(body, signature);

  if (verification.isValid) {
    // Handle the webhook payload (e.g., generate static page, save to database)
    console.log('Job data:', verification.payload!.data);
    // Your custom logic here
    return Response.json({ success: true });
  }
  
  return Response.json({ error: 'Invalid signature' }, { status: 401 });
}
```