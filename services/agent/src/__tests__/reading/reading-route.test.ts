import Fastify, { type FastifyInstance } from 'fastify';
import { readingRoutes } from '../../routes/reading';
import type { BridgeReadingOutlet } from '../../reading/bridge-reading-outlet';

// G-126 — la surface HTTP du débouché de lecture (contrat §5.1, C3).
// Une seule porte, en LECTURE : aucun verbe écrivant n'existe sur ce chemin.

const CONV_ID = '507f1f77bcf86cd799439011';

function makeOutlet(result: unknown = null): { outlet: BridgeReadingOutlet; readRangeSummary: jest.Mock } {
  const readRangeSummary = jest.fn().mockResolvedValue(result);
  return { outlet: { readRangeSummary } as unknown as BridgeReadingOutlet, readRangeSummary };
}

async function buildApp(outlet: BridgeReadingOutlet): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register((instance) => readingRoutes(instance, outlet));
  await app.ready();
  return app;
}

describe('route de lecture du pont ✦ (G-126, C3)', () => {
  it('rend la ligne bornée quand le débouché en produit une', async () => {
    const payload = {
      conversationId: CONV_ID,
      summary: 'La maquette est validee, demo vendredi.',
      fromMessageId: 'm2',
      toMessageId: 'm4',
      messageCount: 3,
    };
    const { outlet, readRangeSummary } = makeOutlet(payload);
    const app = await buildApp(outlet);

    const response = await app.inject({
      method: 'GET',
      url: `/api/agent/conversations/${CONV_ID}/range-summary?fromMessageId=m2&toMessageId=m4`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, data: payload });
    expect(readRangeSummary).toHaveBeenCalledWith({
      conversationId: CONV_ID,
      fromMessageId: 'm2',
      toMessageId: 'm4',
    });
    await app.close();
  });

  it('rend une absence explicite — jamais une ligne inventée — quand la plage n\'est pas couverte', async () => {
    const { outlet } = makeOutlet(null);
    const app = await buildApp(outlet);

    const response = await app.inject({
      method: 'GET',
      url: `/api/agent/conversations/${CONV_ID}/range-summary?fromMessageId=m2&toMessageId=absent`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, data: null });
    await app.close();
  });

  it('refuse une plage incomplète ou un identifiant hors forme, sans rien demander au débouché', async () => {
    const { outlet, readRangeSummary } = makeOutlet();
    const app = await buildApp(outlet);

    const sansBorne = await app.inject({
      method: 'GET',
      url: `/api/agent/conversations/${CONV_ID}/range-summary?fromMessageId=m2`,
    });
    expect(sansBorne.statusCode).toBe(400);

    const idHorsForme = await app.inject({
      method: 'GET',
      url: '/api/agent/conversations/pas-un-id/range-summary?fromMessageId=m2&toMessageId=m4',
    });
    expect(idHorsForme.statusCode).toBe(400);

    expect(readRangeSummary).not.toHaveBeenCalled();
    await app.close();
  });

  // TÉMOIN — aucun verbe écrivant n'est monté sur ce chemin. Le jour où quelqu'un
  // ajouterait un POST « pour publier le pont dans le fil », ce test vire au rouge.
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)(
    'ne monte AUCUN verbe écrivant (%s) sur la route de lecture',
    async (method) => {
      const { outlet, readRangeSummary } = makeOutlet();
      const app = await buildApp(outlet);

      const response = await app.inject({
        method,
        url: `/api/agent/conversations/${CONV_ID}/range-summary?fromMessageId=m2&toMessageId=m4`,
      });

      expect(response.statusCode).toBe(404);
      expect(readRangeSummary).not.toHaveBeenCalled();
      await app.close();
    },
  );

  it('n\'expose qu\'une seule route, en GET — l\'inventaire complet du chemin de lecture', async () => {
    const registered: Array<{ method: string; url: string }> = [];
    const app = Fastify();
    app.addHook('onRoute', (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      for (const method of methods) registered.push({ method, url: route.url });
    });
    const { outlet } = makeOutlet();
    await app.register((instance) => readingRoutes(instance, outlet));
    await app.ready();

    const declared = registered.filter((r) => r.method !== 'HEAD' && r.method !== 'OPTIONS');
    expect(declared).toEqual([
      { method: 'GET', url: '/api/agent/conversations/:conversationId/range-summary' },
    ]);
    await app.close();
  });
});
