import { AsyncLocalStorage } from 'node:async_hooks';

/** Per-request state. `userId` is set only from a verified access token, never from the body. */
export interface RequestContext {
  userId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
