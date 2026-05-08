# Fastify Prisma API
A minimal, production-ready starter using **Fastify**, **TypeScript**, **Prisma** (PostgreSQL) and **Swagger/OpenAPI**.


## Stack

- [Fastify 4](https://fastify.dev/) – high-performance web framework
- [TypeScript 5](https://www.typescriptlang.org/)
- [Prisma 5](https://www.prisma.io/) – type-safe ORM (PostgreSQL)
- [@fastify/swagger](https://github.com/fastify/fastify-swagger) + Swagger UI – auto-generated OpenAPI docs
- [@fastify/cors](https://github.com/fastify/fastify-cors) – CORS support
- [tsx](https://github.com/privatenumber/tsx) – dev runner with hot reload


## Quick start (with Docker Postgres)

```bash
npm install
docker compose up -d                # starts Postgres
npm run prisma:generate             # generate the TS client
npm run prisma:deploy                  # applies prisma/migrations/* to the DB
npm run dev                            # Start the backend API server
```


<strong>prisma:migrate</strong>

Generates the TS client from schema.prisma so you can write prisma.user.findMany() in code



## Authentication

JWT-based authentication via **httpOnly cookies**. The token is issued on
register / login and sent automatically by the browser on subsequent calls;
JavaScript cannot read it (XSS-safe).


## Unit of Work + Repository pattern

Repositories here behave like **collections** (not DAOs): you `add` entities to
them, you `remove` entities from them, and you query them. They never write to
the database synchronously. The **UnitOfWork** owns the transaction – it tracks
new / dirty / removed entities and flushes everything in one Prisma
`$transaction` on `commit()`.

### Allocate a UoW per request

Every Fastify route uses `app.withUnitOfWork(...)` to get a fresh UoW that
disposes itself when the handler returns:

```ts
app.post('/examples/bulk', async (req, reply) =>
  app.withUnitOfWork(async (uow) => {
    const promises = req.body.names.map((name) => uow.examples.add({ name }));
    await uow.commit();                           // ONE transaction
    return reply.status(201).send(await Promise.all(promises));
  }),
);
```


## Linting & formatting

ESLint 9 (flat config) + Prettier are preconfigured.

```bash
npm run lint            # check
npm run  lint:fix        # auto-fix safe issues
npm run format          # write Prettier formatting
npm run format:check    # check only – use in CI
npm  typecheck       # standalone TypeScript check
```



### Docker deploy

```bash
 docker build -t fastify-prisma-api:latest .
```






See [LICENSE.md](./LICENSE.md) for usage terms.
