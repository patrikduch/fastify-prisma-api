import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

const publicUser = (u: {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
}) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  createdAt: u.createdAt.toISOString(),
});

const userResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    email: { type: 'string', format: 'email' },
    name: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /auth/register -------------------------------------------------------
  app.post<{ Body: { email: string; password: string; name?: string } }>(
    '/auth/register',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Create a new account and start a session (sets httpOnly cookie)',
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8, maxLength: 128 },
            name: { type: 'string', minLength: 1, maxLength: 100 },
          },
        },
        response: { 201: userResponseSchema },
      },
    },
    async (req, reply) =>
      app.withUnitOfWork(async (uow) => {
        const email = req.body.email.toLowerCase().trim();

        const existing = await uow.users.findByEmail(email);
        if (existing) {
          return reply
            .status(409)
            .send({ error: 'Conflict', message: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);

        const userPromise = uow.users.add({
          email,
          passwordHash,
          name: req.body.name ?? null,
        });

        await uow.commit();

        const user = await userPromise;
        app.auth.issueAccessToken(reply, { sub: user.id, email: user.email });
        return reply.status(201).send(publicUser(user));
      }),
  );

  // POST /auth/login ----------------------------------------------------------
  app.post<{ Body: { email: string; password: string } }>(
    '/auth/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Log in with email + password (sets httpOnly cookie)',
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 1, maxLength: 128 },
          },
        },
        response: { 200: userResponseSchema },
      },
    },
    async (req, reply) =>
      app.withUnitOfWork(async (uow) => {
        const email = req.body.email.toLowerCase().trim();
        const user = await uow.users.findByEmail(email);

        // Constant-time compare even when user is missing (no enumeration).
        const ok = user
          ? await bcrypt.compare(req.body.password, user.passwordHash)
          : await bcrypt.compare(
              req.body.password,
              '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi',
            );

        if (!user || !ok) {
          return reply
            .status(401)
            .send({ error: 'Unauthorized', message: 'Invalid credentials' });
        }

        app.auth.issueAccessToken(reply, { sub: user.id, email: user.email });
        return reply.send(publicUser(user));
      }),
  );

  // POST /auth/logout ---------------------------------------------------------
  app.post(
    '/auth/logout',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Log out – clears the auth cookie',
        security: [{ cookieAuth: [] }],
        response: { 204: { type: 'null' } },
      },
    },
    async (_req, reply) => {
      app.auth.clearAccessToken(reply);
      return reply.status(204).send();
    },
  );

  // GET /auth/me --------------------------------------------------------------
  app.get(
    '/auth/me',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'Get the currently authenticated user',
        security: [{ cookieAuth: [] }],
        response: { 200: userResponseSchema },
      },
    },
    async (req, reply) =>
      app.withUnitOfWork(async (uow) => {
        const user = await uow.users.findById(req.currentUserId!);
        if (!user) {
          app.auth.clearAccessToken(reply);
          return reply
            .status(401)
            .send({ error: 'Unauthorized', message: 'User not found' });
        }
        return publicUser(user);
      }),
  );
};
