import serverless from 'serverless-http';
import { createApp } from '../../server.ts';

const app = createApp();

export const handler = serverless(app);
