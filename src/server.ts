import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { healthRoutes } from './routes/health';

const PORT = Number(process.env.PORT ?? 8001);
const HOST = process.env.HOST ?? '0.0.0.0';

const displayHost = (host: string) => 
  host === '127.0.0.1' || host === '0.0.0.0' ? 'localhost' : host;

async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
      },
    },
  });

  await app.register(cors, {
    origin: (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()),
    credentials: true,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Fastify Backend API',
        description: 'Fastify + TypeScript + Prisma starter',
        version: '1.0.0',
      },
      servers: [{ url: `http://localhost:${PORT}` }],
      tags: [{ name: 'Health', description: 'Health check endpoints' }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: { docExpansion: 'list', deepLinking: false },
  });

  // All API routes are prefixed with /api per platform convention.
  await app.register(healthRoutes, { prefix: '/api' });


  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);
    reply.status(error.statusCode ?? 500).send({
      error: error.name ?? 'InternalServerError',
      message: error.message,
    });
  });

  // Graceful shutdown
  const close = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => close('SIGINT'));
  process.on('SIGTERM', () => close('SIGTERM'));

  return app;
}

(async () => {
  try {
    const app = await buildServer();
    await app.listen({ port: PORT, host: HOST, listenTextResolver: () => `[PATRIK] Patrik's API listening at http://${displayHost(HOST)}:${PORT}`});
    app.log.info(`Swagger UI available at http://${HOST}:${PORT}/api/docs`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
