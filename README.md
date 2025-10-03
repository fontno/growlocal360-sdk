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
    // TODO: !!!!
    // Handle the webhook payload
    console.log('Job data:', verification.payload.data);
    return Response.json({ success: true });
  }
  
  return Response.json({ error: 'Invalid signature' }, { status: 401 });
}
```
## Next.js Client Setup

```
your-nextjs-app/
├── app/
│   ├── api/webhooks/jobs/route.js
│   └── jobs/[slug]/page.js
├── lib/jobs.js
├── data/jobs.json
└── .env.local
```
### Environment Variables (`.env.local`)
```javascript
// .env.local
GROWLOCAL360_API_URL=https://your-growlocal360-instance.com
GROWLOCAL360_WEBHOOK_SECRET=your_webhook_secret
```
### Webhook Route (`app/api/webhooks/jobs/route.js`)
```javascript
// app/api/webhooks/jobs/route.js
import { GrowLocal360SDK } from 'growlocal360-sdk';
import { NextResponse } from 'next/server';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { revalidatePath } from 'next/cache';

const sdk = new GrowLocal360SDK({
  apiUrl: process.env.GROWLOCAL360_API_URL,
  secret: process.env.GROWLOCAL360_WEBHOOK_SECRET
});

export async function POST(request) {
  try {
    const signature = request.headers.get('x-growlocal360-signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    const body = await request.text();
    const verification = sdk.verifyWebhook(body, signature);
    
    if (!verification.isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const { payload } = verification;
    
    switch (payload.event) {
      case 'job.created':
      case 'job.updated':
        await handleJobCreatedOrUpdated(payload.data);
        break;
      case 'job.deleted':
        await handleJobDeleted(payload.data);
        break;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function handleJobCreatedOrUpdated(jobData) {
  const dataDir = join(process.cwd(), 'data');
  const filePath = join(dataDir, 'jobs.json');
  
  await mkdir(dataDir, { recursive: true });

  let jobs = [];
  try {
    const fileContent = await readFile(filePath, 'utf-8');
    jobs = JSON.parse(fileContent);
  } catch (err) {
    console.log('Creating new jobs.json');
  }

  const slug = createSlug(jobData.job_title);
  const existingIndex = jobs.findIndex(j => j.job_id === jobData.job_id);
  const jobWithSlug = { ...jobData, slug };
  
  if (existingIndex >= 0) {
    jobs[existingIndex] = jobWithSlug;
  } else {
    jobs.push(jobWithSlug);
  }

  await writeFile(filePath, JSON.stringify(jobs, null, 2), 'utf-8');
  revalidatePath(`/jobs/${slug}`);
  revalidatePath('/jobs');
}

async function handleJobDeleted(jobData) {
  const filePath = join(process.cwd(), 'data', 'jobs.json');
  try {
    const fileContent = await readFile(filePath, 'utf-8');
    let jobs = JSON.parse(fileContent);
    jobs = jobs.filter(j => j.job_id !== jobData.job_id);
    await writeFile(filePath, JSON.stringify(jobs, null, 2), 'utf-8');
    revalidatePath('/jobs');
  } catch (err) {
    console.error('Error deleting job:', err);
  }
}

function createSlug(title) {
  return title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
}
```

### Jobs Library (`lib/jobs.js`)
```javascript
// lib/jobs.js
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function getAllJobs() {
  try {
    const filePath = join(process.cwd(), 'data', 'jobs.json');
    const fileContent = await readFile(filePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (err) {
    return [];
  }
}

export async function getJobBySlug(slug) {
  const jobs = await getAllJobs();
  return jobs.find(job => job.slug === slug);
}

export async function getAllJobSlugs() {
  const jobs = await getAllJobs();
  return jobs.map(job => job.slug);
}
```

### Generate Job Page (`app/jobs/[slug]/page.js`)
```javascript
// app/jobs/[slug]/page.js
import { getJobBySlug, getAllJobSlugs } from '@/lib/jobs';
import { notFound } from 'next/navigation';
import Image from 'next/image';

export async function generateStaticParams() {
  const slugs = await getAllJobSlugs();
  return slugs.map((slug) => ({ slug: slug }));
}

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const job = await getJobBySlug(params.slug);
  if (!job) return { title: 'Job Not Found' };
  
  return {
    title: `${job.job_title} - ${job.job_city}, ${job.job_state}`,
    description: job.job_description?.substring(0, 160),
  };
}

export default async function JobPage({ params }) {
  const job = await getJobBySlug(params.slug);
  if (!job) notFound();

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="mb-8">
        <h1 className="text-4xl font-bold mb-4">{job.job_title}</h1>
        <div className="flex flex-wrap gap-4 text-gray-600">
          <span>{job.job_city}, {job.job_state}</span>
          <span>•</span>
          <span>{job.job_brand}</span>
          <span>•</span>
          <time>{new Date(job.job_date).toLocaleDateString()}</time>
        </div>
      </header>

      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-2xl font-semibold mb-3">Job Description</h2>
          <p className="text-gray-700 mb-6">{job.job_description}</p>
          
          <div className="bg-gray-50 rounded-lg p-6 space-y-3">
            <h2 className="text-xl font-semibold mb-4">Details</h2>
            <div><strong>Service:</strong> {job.job_service}</div>
            <div><strong>Location:</strong> {job.job_street}, {job.job_city}, {job.job_state} {job.job_zipcode}</div>
            {job.job_employee && <div><strong>Employee:</strong> {job.job_employee}</div>}
          </div>
        </div>

        {job.job_images && job.job_images.length > 0 && (
          <div>
            <h2 className="text-2xl font-semibold mb-4">Images</h2>
            <div className="grid gap-4">
              {job.job_images.map((image, index) => (
                <div key={index} className="relative aspect-video rounded-lg overflow-hidden">
                  <Image src={image} alt={`Image ${index + 1}`} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

### Jobs Index (`app/jobs/page.js`)
```javascript
import { getAllJobs } from '@/lib/jobs';
import Link from 'next/link';

export const revalidate = 3600;

export default async function JobsPage() {
  const jobs = await getAllJobs();

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-4xl font-bold mb-8">Our Jobs</h1>
      
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {jobs.map((job) => (
          <Link key={job.job_id} href={`/jobs/${job.slug}`} className="border rounded-lg p-6 hover:shadow-lg transition">
            <h2 className="text-xl font-semibold mb-2">{job.job_title}</h2>
            <p className="text-gray-600 mb-4">{job.job_city}, {job.job_state}</p>
            <div className="flex items-center text-sm text-gray-500">
              <span>{job.job_brand}</span>
              <span className="mx-2">•</span>
              <time>{new Date(job.job_date).toLocaleDateString()}</time>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

Initialize Data (`data/jobs.json`)
```json
// data/jobs.json
[]
```