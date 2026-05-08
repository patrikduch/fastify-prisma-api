import type { Example, Prisma } from '@prisma/client';
import type { DbClient, IRepository, TrackedRepository } from './base.repository';
import type { UnitOfWork } from '../uow/unit-of-work';

/**
 * Repository for the `Example` aggregate.
 *
 * Reads (`findById`, `findMany`) hit the DB immediately and register the
 * loaded entities as "clean" with the UoW so subsequent in-memory mutations
 * are detected on commit.
 *
 * Writes (`add`, `remove`) only enqueue intent on the UoW; the actual SQL
 * runs inside `UnitOfWork.commit()`'s transaction.
 */
export class ExampleRepository
  implements IRepository<Example, Prisma.ExampleCreateInput>, TrackedRepository<Example>
{
  constructor(
    private readonly uow: UnitOfWork,
    private readonly db: DbClient,
  ) {}

  // ---- queries (read-through, register clean) ----------------------------

  async findById(id: string): Promise<Example | null> {
    const entity = await this.db.example.findUnique({ where: { id } });
    if (entity) this.uow.registerClean(this, entity);
    return entity;
  }

  async findMany(): Promise<Example[]> {
    const list = await this.db.example.findMany({ orderBy: { createdAt: 'desc' } });
    for (const e of list) this.uow.registerClean(this, e);
    return list;
  }

  // ---- collection-like writes (enqueue only) -----------------------------

  add(input: Prisma.ExampleCreateInput): Promise<Example> {
    return this.uow.registerNew(this, input);
  }

  remove(entity: Example): void {
    this.uow.registerRemoved(this, entity);
  }

  // ---- TrackedRepository – called by UoW.commit only ---------------------

  persistInsert(tx: Prisma.TransactionClient, input: unknown): Promise<Example> {
    return tx.example.create({ data: input as Prisma.ExampleCreateInput });
  }

  async persistUpdate(
    tx: Prisma.TransactionClient,
    entity: Example,
    _snapshot: Example,
  ): Promise<void> {
    await tx.example.update({
      where: { id: entity.id },
      data: { name: entity.name }, // only mutable fields
    });
  }

  async persistDelete(tx: Prisma.TransactionClient, entity: Example): Promise<void> {
    await tx.example.delete({ where: { id: entity.id } });
  }
}
