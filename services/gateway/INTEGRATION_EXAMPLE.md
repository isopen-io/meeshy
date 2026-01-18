# Integration Example - /me/preferences Routes

Guide d'intégration des nouvelles routes `/me/preferences/*` dans le serveur Fastify existant.

## 1. Enregistrement dans server.ts

### Option A: Enregistrement direct

```typescript
// src/server.ts

import meRoutes from './routes/me';

// ... autres imports et configuration

async function start() {
  const fastify = Fastify({
    logger: true,
    // ... autres options
  });

  // ... middleware, plugins, etc.

  // Register authentication middleware
  fastify.decorate('authenticate', async (request, reply) => {
    // Votre logique d'auth existante
  });

  // Register all /me routes (including preferences)
  await fastify.register(meRoutes, { prefix: '/me' });

  // ... autres routes

  await fastify.listen({ port: 3000, host: '0.0.0.0' });
}

start();
```

### Option B: Enregistrement avec plugin

```typescript
// src/plugins/routes.ts

import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import meRoutes from '../routes/me';

async function routesPlugin(fastify: FastifyInstance) {
  // Register /me routes
  await fastify.register(meRoutes, { prefix: '/me' });

  // ... autres routes
}

export default fp(routesPlugin, {
  name: 'routes-plugin'
});
```

```typescript
// src/server.ts

import routesPlugin from './plugins/routes';

async function start() {
  const fastify = Fastify({ logger: true });

  // ... autres plugins

  await fastify.register(routesPlugin);

  await fastify.listen({ port: 3000, host: '0.0.0.0' });
}

start();
```

## 2. Configuration Prisma

Assurez-vous que Prisma est correctement décoré sur l'instance Fastify:

```typescript
// src/plugins/prisma.ts

import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { PrismaClient } from '@meeshy/shared/prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

async function prismaPlugin(fastify: FastifyInstance) {
  const prisma = new PrismaClient({
    log: ['error', 'warn']
  });

  await prisma.$connect();

  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect();
  });
}

export default fp(prismaPlugin, {
  name: 'prisma-plugin'
});
```

```typescript
// src/server.ts

import prismaPlugin from './plugins/prisma';

async function start() {
  const fastify = Fastify({ logger: true });

  await fastify.register(prismaPlugin);
  // ... autres plugins

  await fastify.listen({ port: 3000, host: '0.0.0.0' });
}
```

## 3. Middleware d'authentification

Le middleware `fastify.authenticate` doit être disponible:

```typescript
// src/middleware/auth-plugin.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = request.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          success: false,
          message: 'Missing or invalid authorization header'
        });
      }

      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET!);

      // Attach auth context to request
      (request as any).authContext = {
        isAuthenticated: true,
        registeredUser: true,
        userId: (decoded as any).userId,
        isAnonymous: false,
        // ... autres propriétés
      };
    } catch (error) {
      return reply.status(401).send({
        success: false,
        message: 'Invalid or expired token'
      });
    }
  });
}

export default fp(authPlugin, {
  name: 'auth-plugin'
});
```

## 4. Rate Limiting

Configurez le rate limiting pour protéger les endpoints:

```typescript
// src/plugins/rate-limit.ts

import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import fastifyRateLimit from '@fastify/rate-limit';

async function rateLimitPlugin(fastify: FastifyInstance) {
  await fastify.register(fastifyRateLimit, {
    max: 100, // 100 requests
    timeWindow: '1 minute', // per minute
    keyGenerator: (request) => {
      // Rate limit per user
      const authContext = (request as any).authContext;
      return authContext?.userId || request.ip;
    },
    errorResponseBuilder: () => ({
      success: false,
      message: 'Rate limit exceeded. Please try again later.'
    })
  });
}

export default fp(rateLimitPlugin, {
  name: 'rate-limit-plugin'
});
```

## 5. Swagger/OpenAPI Documentation

Activez la documentation interactive:

```typescript
// src/plugins/swagger.ts

import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

async function swaggerPlugin(fastify: FastifyInstance) {
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Meeshy Gateway API',
        description: 'API documentation for Meeshy messaging platform',
        version: '2.0.0'
      },
      servers: [
        {
          url: 'https://api.meeshy.com',
          description: 'Production'
        },
        {
          url: 'http://localhost:3000',
          description: 'Development'
        }
      ],
      tags: [
        { name: 'me', description: 'Current user operations' },
        { name: 'preferences', description: 'User preferences management' },
        { name: 'notifications', description: 'Notification preferences' },
        { name: 'encryption', description: 'Encryption preferences' },
        { name: 'theme', description: 'Theme preferences' },
        { name: 'languages', description: 'Language preferences' },
        { name: 'privacy', description: 'Privacy preferences' }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      },
      security: [{ bearerAuth: [] }]
    }
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true
    }
  });
}

export default fp(swaggerPlugin, {
  name: 'swagger-plugin'
});
```

## 6. Configuration complète

### Fichier server.ts complet

```typescript
// src/server.ts

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

// Plugins
import prismaPlugin from './plugins/prisma';
import authPlugin from './plugins/auth';
import rateLimitPlugin from './plugins/rate-limit';
import swaggerPlugin from './plugins/swagger';

// Routes
import meRoutes from './routes/me';
// ... autres routes

async function start() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      prettyPrint: process.env.NODE_ENV === 'development'
    }
  });

  // Security & CORS
  await fastify.register(helmet);
  await fastify.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true
  });

  // Core plugins
  await fastify.register(prismaPlugin);
  await fastify.register(authPlugin);
  await fastify.register(rateLimitPlugin);
  await fastify.register(swaggerPlugin);

  // Routes
  await fastify.register(meRoutes, { prefix: '/me' });
  // await fastify.register(otherRoutes);

  // Health check
  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString()
  }));

  // Error handler
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);

    reply.status(error.statusCode || 500).send({
      success: false,
      message: error.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  });

  // Start server
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await fastify.listen({ port, host });
    fastify.log.info(`Server listening on ${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

start();
```

## 7. Variables d'environnement

Créez un fichier `.env`:

```bash
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=info

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# Database
DATABASE_URL=mongodb://localhost:27017/meeshy

# CORS
ALLOWED_ORIGINS=http://localhost:3001,https://app.meeshy.com

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1m
```

## 8. Scripts package.json

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write \"src/**/*.ts\""
  }
}
```

## 9. Test d'intégration

Testez que tout fonctionne:

```bash
# Démarrer le serveur
npm run dev

# Tester les endpoints (autre terminal)
curl http://localhost:3000/health

# Voir la documentation Swagger
open http://localhost:3000/documentation

# Tester un endpoint protégé
curl -X GET \
  http://localhost:3000/me/preferences/notifications \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

## 10. Monitoring et Logs

### Structured Logging

```typescript
// src/server.ts

const fastify = Fastify({
  logger: {
    level: 'info',
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
        headers: req.headers,
        remoteAddress: req.ip,
        remotePort: req.socket?.remotePort
      }),
      res: (res) => ({
        statusCode: res.statusCode,
        headers: res.getHeaders()
      })
    }
  }
});
```

### Request ID

```typescript
import fastifyRequestId from 'fastify-request-id';

await fastify.register(fastifyRequestId);

fastify.addHook('onRequest', async (request, reply) => {
  request.log.info({ requestId: request.id }, 'Incoming request');
});
```

## 11. Déploiement

### Docker

```dockerfile
# Dockerfile

FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  gateway:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=mongodb://mongo:27017/meeshy
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - mongo

  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db

volumes:
  mongo-data:
```

## Checklist de déploiement

- [ ] Prisma client généré (`npx prisma generate`)
- [ ] Variables d'environnement configurées
- [ ] JWT secret sécurisé en production
- [ ] CORS origins restreintes
- [ ] Rate limiting activé
- [ ] Logging configuré
- [ ] Health check fonctionnel
- [ ] Documentation Swagger accessible
- [ ] Tests passent (`npm test`)
- [ ] Build réussit (`npm run build`)
- [ ] Migrations DB appliquées
- [ ] Monitoring configuré

## Support

Questions? Consultez:
- README: `/src/routes/me/preferences/README.md`
- Migration Guide: `/MIGRATION_PREFERENCES.md`
- Slack: `#backend-support`
