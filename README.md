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



```bash prisma:migrate ```

Generates the TS client from schema.prisma so you can write prisma.user.findMany() in code



### Docker deploy

```bash docker build -t fastify-prisma-api:latest .```


```bash docker run -d --name fastify-api -p 8001:8001 -e DATABASE_URL="postgresql://fastify:fastify@host.docker.internal:5440/fastify_dev?schema=public" -e NODE_ENV=production fastify-prisma-api:latest```






See [LICENSE.md](./LICENSE.md) for usage terms.
