/**
 * Script pour lister toutes les routes de l'API Gateway avec leurs configurations d'authentification
 *
 * Usage: npx tsx scripts/list-routes.ts
 */

import '../src/env';
import fastify from 'fastify';
import { PrismaClient } from '@meeshy/shared/prisma/client';

async function listRoutes() {
  const app = fastify({ logger: false });
  const prisma = new PrismaClient();

  // Décorer avec prisma pour les routes qui en ont besoin
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async () => {});

  // Importer toutes les routes
  const { authRoutes } = await import('../src/routes/auth');
  const { conversationRoutes } = await import('../src/routes/conversations');
  const { userRoutes } = await import('../src/routes/users');
  const { notificationRoutes } = await import('../src/routes/notifications');
  const meRoutes = (await import('../src/routes/me')).default;
  const { communityRoutes } = await import('../src/routes/communities');
  const { linksRoutes } = await import('../src/routes/links');
  const { friendRequestRoutes } = await import('../src/routes/friends');

  const API_PREFIX = '/api/v1';

  try {
    // Enregistrer les routes
    await app.register(authRoutes, { prefix: `${API_PREFIX}/auth` });
    await app.register(conversationRoutes, { prefix: `${API_PREFIX}/conversations` });
    await app.register(userRoutes, { prefix: API_PREFIX });
    await app.register(notificationRoutes, { prefix: API_PREFIX });
    await app.register(meRoutes, { prefix: `${API_PREFIX}/me` });
    await app.register(communityRoutes, { prefix: `${API_PREFIX}/communities` });
    await app.register(linksRoutes, { prefix: API_PREFIX });
    await app.register(friendRequestRoutes, { prefix: API_PREFIX });

    await app.ready();

    console.log('\n📋 LISTE DES ROUTES API GATEWAY\n');
    console.log('═'.repeat(120));
    console.log('');

    interface RouteInfo {
      method: string;
      url: string;
      auth: string;
      description?: string;
    }

    const routes: RouteInfo[] = [];

    // Parcourir toutes les routes
    for (const route of app.printRoutes({ commonPrefix: false }).split('\n')) {
      if (!route.trim()) continue;

      const match = route.match(/^(\w+)\s+(.+)$/);
      if (!match) continue;

      const [, method, url] = match;

      // Déterminer le type d'auth en fonction du préfixe et de la route
      let auth = '🔒 Auth Required';

      if (url.includes('/health') || url.includes('/swagger')) {
        auth = '🌐 Public';
      } else if (url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/magic-link')) {
        auth = '🌐 Public';
      } else if (url.includes('/anonymous/')) {
        auth = '👤 Anonymous';
      } else if (url.includes('/me/') || url.includes('/notifications') || url.includes('/conversations')) {
        auth = '🔒 Auth Required';
      }

      routes.push({ method, url, auth });
    }

    // Grouper par préfixe
    const grouped: Record<string, RouteInfo[]> = {};

    for (const route of routes) {
      const prefix = route.url.split('/')[1] || 'root';
      if (!grouped[prefix]) grouped[prefix] = [];
      grouped[prefix].push(route);
    }

    // Afficher par groupe
    for (const [prefix, groupRoutes] of Object.entries(grouped).sort()) {
      console.log(`\n📁 /${prefix.toUpperCase()}`);
      console.log('─'.repeat(120));

      for (const route of groupRoutes.sort((a, b) => a.url.localeCompare(b.url))) {
        const methodPadded = route.method.padEnd(7);
        const urlPadded = route.url.padEnd(70);
        console.log(`  ${methodPadded} ${urlPadded} ${route.auth}`);
      }
    }

    console.log('\n');
    console.log('═'.repeat(120));
    console.log(`\n✅ Total: ${routes.length} routes\n`);

    // Statistiques
    const publicRoutes = routes.filter(r => r.auth.includes('Public')).length;
    const authRoutes = routes.filter(r => r.auth.includes('Auth Required')).length;
    const anonymousRoutes = routes.filter(r => r.auth.includes('Anonymous')).length;

    console.log('📊 STATISTIQUES');
    console.log('─'.repeat(120));
    console.log(`  🌐 Routes publiques:      ${publicRoutes}`);
    console.log(`  🔒 Routes authentifiées:  ${authRoutes}`);
    console.log(`  👤 Routes anonymes:       ${anonymousRoutes}`);
    console.log('');

  } catch (error) {
    console.error('❌ Erreur lors de la génération de la liste des routes:', error);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

listRoutes().catch(console.error);
