import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '../lib/prisma';
import { UnitOfWork } from '../uow/unit-of-work';

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Allocate a fresh UnitOfWork, run `fn` with it, then dispose it. The
     * function is responsible for calling `uow.commit()` when it wants to
     * persist – read-only handlers can simply skip it.
     *
     *   const result = await app.withUnitOfWork(async (uow) => {
     *     const u = uow.users.add({ ... });
     *     await uow.commit();
     *     return u;
     *   });
     */
    withUnitOfWork: <R>(fn: (uow: UnitOfWork) => Promise<R>) => Promise<R>;
  }
}

const uowPlugin: FastifyPluginAsync = async (app) => {
  app.decorate('withUnitOfWork', async function <R>(
    fn: (uow: UnitOfWork) => Promise<R>,
  ): Promise<R> {
    const uow = new UnitOfWork(prisma);
    try {
      return await fn(uow);
    } finally {
      uow.dispose();
    }
  });
};

export default fp(uowPlugin, { name: 'uow' });
