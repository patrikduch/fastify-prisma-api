import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Liveness probe',
        description: "Check if Patrik's API is running.",
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'ok' },
              uptime: { type: 'number', example: 12.34 },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async () => ({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }),
  ); // ← tady byla čárka

  app.get(
    '/health/db',
    {
      schema: {
        tags: ['Health'],
        summary: 'Database readiness probe',
        description: "Pings the Patrick's database via Prisma to verify connectivity.",
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'ok' },
              database: { type: 'string', example: 'connected' },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'error' },
              database: { type: 'string', example: 'disconnected' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (_req, reply) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return { status: 'ok', database: 'connected' };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        return reply.status(503).send({
          status: 'error',
          database: 'disconnected',
          message,
        });
      }
    },
  );
};
