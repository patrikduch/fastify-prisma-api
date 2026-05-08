import { isDeepStrictEqual } from 'node:util';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { TrackedRepository } from '../repositories/base.repository';
import { ExampleRepository } from '../repositories/example.repository';
import { UserRepository } from '../repositories/user.repository';

type Pending<T> = {
  input: unknown;
  resolve: (entity: T) => void;
  reject: (err: unknown) => void;
};

/**
 * Unit of Work – a Martin-Fowler-style transactional boundary on top of Prisma.
 *
 * Repositories do **not** talk to the database when you call `add` / `remove`;
 * they enqueue intent on the UoW. Loaded entities are tracked for dirty
 * checking via a structural snapshot. On `commit()` everything is flushed
 * inside ONE Prisma interactive transaction (inserts → dirty updates → deletes).
 *
 * Lifecycle:
 *   const uow = new UnitOfWork(prisma);
 *   try {
 *     uow.users.add({ ... });               // returns Promise<User>
 *     const u = await uow.users.findById(id); u.name = 'x';   // dirty
 *     await uow.commit();                    // single transaction
 *   } finally {
 *     uow.dispose();
 *   }
 *
 * In Fastify routes prefer `app.withUnitOfWork(async (uow) => { ... })`.
 */
export class UnitOfWork {
  // intent maps – keyed by repository instance
  private _new = new Map<TrackedRepository<unknown>, Pending<unknown>[]>();
  private _removed = new Map<TrackedRepository<unknown>, Set<unknown>>();
  private _clean = new Map<TrackedRepository<unknown>, Map<unknown, unknown>>();

  readonly examples: ExampleRepository;
  readonly users: UserRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.examples = new ExampleRepository(this, prisma);
    this.users = new UserRepository(this, prisma);
  }

  // ---- registration API used by repositories ------------------------------

  /** Called by `repo.add(input)`. Returns a Promise that resolves after commit. */
  registerNew<T>(repo: TrackedRepository<T>, input: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const list = (this._new.get(repo as TrackedRepository<unknown>) ?? []) as Pending<unknown>[];
      list.push({ input, resolve: resolve as (e: unknown) => void, reject });
      this._new.set(repo as TrackedRepository<unknown>, list);
    });
  }

  /** Called by `repo.remove(entity)`. */
  registerRemoved<T>(repo: TrackedRepository<T>, entity: T): void {
    const r = repo as TrackedRepository<unknown>;
    // If the entity was loaded as clean, drop it – we won't update what we delete.
    this._clean.get(r)?.delete(entity);
    const set = this._removed.get(r) ?? new Set<unknown>();
    set.add(entity);
    this._removed.set(r, set);
  }

  /** Called by `repo.findById/findMany` for every loaded entity. */
  registerClean<T>(repo: TrackedRepository<T>, entity: T): void {
    const r = repo as TrackedRepository<unknown>;
    const map = this._clean.get(r) ?? new Map<unknown, unknown>();
    // Snapshot is a deep copy taken at load time – used for dirty diff on commit.
    map.set(entity, structuredClone(entity));
    this._clean.set(r, map);
  }

  // ---- commit / dispose ---------------------------------------------------

  /** Returns true if any tracked entity is new, removed, or dirty. */
  hasChanges(): boolean {
    if (this._new.size > 0 || this._removed.size > 0) return true;
    for (const [, map] of this._clean) {
      for (const [entity, snapshot] of map) {
        if (!isDeepStrictEqual(entity, snapshot)) return true;
      }
    }
    return false;
  }

  /**
   * Flushes all tracked changes in one transaction. If the transaction fails,
   * every pending `add()` Promise is rejected and nothing is persisted.
   */
  async commit(): Promise<void> {
    if (!this.hasChanges()) {
      this.dispose();
      return;
    }

    // Defer pending-promise resolution until AFTER the transaction commits.
    const resolutions: Array<() => void> = [];

    try {
      await this.prisma.$transaction(async (tx) => {
        // 1. inserts
        for (const [repo, items] of this._new) {
          for (const item of items) {
            const entity = await repo.persistInsert(tx, item.input);
            resolutions.push(() => item.resolve(entity));
          }
        }
        // 2. dirty updates
        for (const [repo, map] of this._clean) {
          for (const [entity, snapshot] of map) {
            if (!isDeepStrictEqual(entity, snapshot)) {
              await repo.persistUpdate(tx, entity, snapshot);
            }
          }
        }
        // 3. deletes
        for (const [repo, set] of this._removed) {
          for (const entity of set) {
            await repo.persistDelete(tx, entity);
          }
        }
      });
      for (const r of resolutions) r();
    } catch (err) {
      // Reject every pending add() so callers awaiting them don't hang.
      for (const [, items] of this._new) {
        for (const item of items) item.reject(err);
      }
      throw err;
    } finally {
      this.dispose();
    }
  }

  /** Drops all tracked state without touching the database. */
  dispose(): void {
    this._new.clear();
    this._removed.clear();
    this._clean.clear();
  }
}
