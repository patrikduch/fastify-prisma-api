import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import uowPlugin from './plugins/uow';
import authPlugin from './plugins/auth';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';

const PORT = Number(process.env.PORT ?? 8001);
const HOST = process.env.HOST ?? '0.0.0.0';

const displayHost = (host: string) => 
  host === '127.0.0.1' ? 'localhost' : host;

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


    // Unit of Work + Repositories
  await app.register(uowPlugin);

    // Auth (JWT + httpOnly cookies). Must come before routes that use app.authenticate.
  await app.register(authPlugin);

  await app.register(swagger, {
  openapi: {
    info: {
      title: 'Fastify Backend API',
      description: 'Fastify + TypeScript + Prisma starter',
      version: '1.0.0',
    },
    tags: [{ name: 'Health', description: 'Health check endpoints' }],

       components: {
        securitySchemes: {
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'access_token',
          },
        },
      },
  },
});

await app.register(swaggerUi, {
  routePrefix: '/api/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false,
  },
  transformSpecificationClone: true,
  transformSpecification: (swaggerObject, request) => {
    const protocol = (request.headers['x-forwarded-proto'] as string) ?? request.protocol;
    const host = (request.headers['x-forwarded-host'] as string) ?? request.hostname;
    
    (swaggerObject as any).servers = [{ url: `${protocol}://${host}` }];
    
    return swaggerObject;
    },
});


  // All API routes are prefixed with /api per platform convention.
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api' });


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
    app.log.info(`Swagger UI available at http://${HOST}:${PORT}/api/docs/`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();


