import { setupServer } from 'msw/node';

/** MSW server shared by every test; handlers are added per test with `server.use`. */
export const server = setupServer();

export const API = 'http://api.test';
