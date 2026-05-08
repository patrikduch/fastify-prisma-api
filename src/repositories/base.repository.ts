import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Either the global PrismaClient or a transaction client returned by
 * `prisma.$transaction(async (tx) => ...)`. Repositories use this for read
 * queries; writes go through the UoW transaction client.
 */
export type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Internal contract every repository implements so the Unit of Work can flush
 * its tracked changes generically. Routes never call these directly — they go
 * through `add` / `remove` / queries on the concrete repository.
 */
export interface TrackedRepository<TEntity> {
  /** Insert a brand-new entity. Returns the persisted row (with id, defaults). */
  persistInsert(tx: Prisma.TransactionClient, input: unknown): Promise<TEntity>;
  /** Update an entity that was loaded earlier and then mutated in memory. */
  persistUpdate(
    tx: Prisma.TransactionClient,
    entity: TEntity,
    snapshot: TEntity,
  ): Promise<void>;
  /** Remove an entity that was loaded earlier. */
  persistDelete(tx: Prisma.TransactionClient, entity: TEntity): Promise<void>;
}

/**
 * Public collection-like contract for a repository. Mirrors an in-memory
 * collection so callers don't think about SQL or transactions.
 *
 *   uow.users.add({ ... })           // mark for INSERT on next commit
 *   uow.users.remove(user)           // mark for DELETE on next commit
 *   const u = await uow.users.findById(id)
 *   u.name = 'new'                   // mutation auto-detected on commit
 */
export interface IRepository<TEntity, TInput, TKey = string> {
  add(input: TInput): Promise<TEntity>;
  remove(entity: TEntity): void;
  findById(id: TKey): Promise<TEntity | null>;
  findMany(): Promise<TEntity[]>;
}
