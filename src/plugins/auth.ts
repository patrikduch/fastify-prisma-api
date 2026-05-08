import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';

const ACCESS_COOKIE = 'access_token';

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * preHandler that loads the current user from the access_token cookie.
     * Sets `request.currentUserId` and `request.currentUserEmail` on success,
     * or replies with 401 on failure.
     */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Helpers for issuing / clearing the auth cookie. */
    auth: {
      issueAccessToken: (reply: FastifyReply, payload: AuthTokenPayload) => string;
      clearAccessToken: (reply: FastifyReply) => void;
    };
  }
  interface FastifyRequest {
    currentUserId?: string;
    currentUserEmail?: string;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthTokenPayload;
    user: AuthTokenPayload;
  }
}

export interface AuthTokenPayload {
  sub: string;   // user id
  email: string;
}

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const authPlugin: FastifyPluginAsync = async (app) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET is missing or too short (must be >=32 chars). Set it in .env.',
    );
  }

  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET ?? jwtSecret, // signs cookies that opt-in
  });

  await app.register(jwt, {
    secret: jwtSecret,
    cookie: {
      cookieName: ACCESS_COOKIE,
      signed: false,
    },
    sign: { expiresIn: `${ACCESS_TOKEN_TTL_SECONDS}s` },
  });

  const isProd = process.env.NODE_ENV === 'production';

  app.decorate('auth', {
    issueAccessToken(reply, payload) {
      const token = app.jwt.sign(payload);
      reply.setCookie(ACCESS_COOKIE, token, {
        httpOnly: true,
        secure: isProd,            // require HTTPS in prod
        sameSite: 'lax',           // CSRF-safe for top-level navigations
        path: '/',
        maxAge: ACCESS_TOKEN_TTL_SECONDS,
      });
      return token;
    },
    clearAccessToken(reply) {
      reply.clearCookie(ACCESS_COOKIE, { path: '/' });
    },
  });

  app.decorate(
    'authenticate',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const payload = await req.jwtVerify<AuthTokenPayload>();
        req.currentUserId = payload.sub;
        req.currentUserEmail = payload.email;
      } catch {
        reply.status(401).send({ error: 'Unauthorized', message: 'Not authenticated' });
      }
    },
  );
};

export default fp(authPlugin, { name: 'auth' });
