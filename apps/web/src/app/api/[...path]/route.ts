import { forwardToApi } from '@/lib/api-proxy';

// The API is reached at request time (never prerendered or cached).
export const dynamic = 'force-dynamic';

export const GET = (request: Request) => forwardToApi(request);
export const POST = (request: Request) => forwardToApi(request);
export const PUT = (request: Request) => forwardToApi(request);
export const PATCH = (request: Request) => forwardToApi(request);
export const DELETE = (request: Request) => forwardToApi(request);
