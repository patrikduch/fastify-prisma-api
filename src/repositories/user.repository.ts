import type { Prisma, User } from '@prisma/client';
import type { DbClient, IRepository, TrackedRepository } from './base.repository';
import type { UnitOfWork } from '../uow/unit-of-work';

export class UserRepository
  implements
    IRepository<User, Prisma.UserCreateInput>,
    TrackedRepository<User>
{
  constructor(
    private readonly uow: UnitOfWork,
    private readonly db: DbClient,
  ) {}

  // ---- queries -----------------------------------------------------------

  async findById(id: string): Promise<User | null> {
    const u = await this.db.user.findUnique({ where: { id } });
    if (u) this.uow.registerClean(this, u);
    return u;
  }

  async findByEmail(email: string): Promise<User | null> {
    const u = await this.db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (u) this.uow.registerClean(this, u);
    return u;
  }

  async findMany(): Promise<User[]> {
    const list = await this.db.user.findMany({ orderBy: { createdAt: 'desc' } });
    for (const u of list) this.uow.registerClean(this, u);
    return list;
  }

  // ---- collection-like writes -------------------------------------------

  add(input: Prisma.UserCreateInput): Promise<User> {
    return this.uow.registerNew(this, {
      ...input,
      email: input.email.toLowerCase(),
    });
  }

  remove(entity: User): void {
    this.uow.registerRemoved(this, entity);
  }

  // ---- TrackedRepository -------------------------------------------------

  persistInsert(tx: Prisma.TransactionClient, input: unknown): Promise<User> {
    return tx.user.create({ data: input as Prisma.UserCreateInput });
  }

  async persistUpdate(
    tx: Prisma.TransactionClient,
    entity: User,
    _snapshot: User,
  ): Promise<void> {
    await tx.user.update({
      where: { id: entity.id },
      data: {
        email: entity.email,
        passwordHash: entity.passwordHash,
        name: entity.name,
      },
    });
  }

  async persistDelete(tx: Prisma.TransactionClient, entity: User): Promise<void> {
    await tx.user.delete({ where: { id: entity.id } });
  }
}
