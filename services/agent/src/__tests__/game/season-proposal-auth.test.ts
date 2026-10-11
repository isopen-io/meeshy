import Fastify from 'fastify';
import { seasonProposalRoutes } from '../../routes/season-proposal';
import { INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_MIN_LENGTH } from '../../routes/internal-auth';
import type { LlmProvider } from '../../llm/types';

// Revue de sécurité du commit 795c747d98 : le service agent est PUBLIÉ par Traefik sur staging
// (`agent.staging.meeshy.me`). La proposition de saison appelle un LLM payant et prend un `brief` :
// elle n'est ouverte qu'à la passerelle, par un secret interne partagé (AGENT_INTERNAL_TOKEN),
// comparé à temps constant ; sans secret configuré, elle refuse TOUT (fermée, jamais ouverte).
// Et son débit est borné.

const URL = '/api/agent/game/season-proposal';
const TOKEN = 'x'.repeat(INTERNAL_TOKEN_MIN_LENGTH) + '-staging';
const BODY = { number: 4, startDay: '2027-05-10', themeKey: 'language:sw', previousThemes: [], brief: null };

const COPY = Object.fromEntries(
  ['fr', 'en', 'es', 'de', 'it', 'pt-BR', 'ar'].map((l) => [l, { title: 'Saison swahili', tagline: 'Huit semaines', description: 'Des missions chaque jour et une coupe au bout.' }]),
);

function llm(): LlmProvider & { chat: jest.Mock } {
  const chat = jest.fn(async () => ({
    content: JSON.stringify({ themeKey: 'language:sw', stepPoints: 120, copy: COPY }),
    usage: { inputTokens: 1, outputTokens: 1 },
    model: 'fake',
    latencyMs: 1,
  }));
  return { name: 'fake', chat };
}

async function app(provider: LlmProvider, internalToken: string | undefined, rateLimit?: { max: number; windowMs: number }) {
  const instance = Fastify();
  await instance.register((i) => seasonProposalRoutes(i, provider, { internalToken, ...(rateLimit ? { rateLimit } : {}) }));
  await instance.ready();
  return instance;
}

const post = (instance: Awaited<ReturnType<typeof app>>, token?: string) =>
  instance.inject({ method: 'POST', url: URL, payload: BODY, headers: token === undefined ? {} : { [INTERNAL_TOKEN_HEADER]: token } });

describe('la proposition de saison n’est ouverte qu’à la passerelle', () => {
  it('sans en-tête : 401, aucun appel au LLM', async () => {
    const provider = llm();
    const instance = await app(provider, TOKEN);
    expect((await post(instance)).statusCode).toBe(401);
    expect(provider.chat).not.toHaveBeenCalled();
    await instance.close();
  });

  it.each(['mauvais', TOKEN.slice(0, -1), `${TOKEN}x`, ''])('mauvais secret (%s) : 401, aucun appel au LLM', async (wrong) => {
    const provider = llm();
    const instance = await app(provider, TOKEN);
    expect((await post(instance, wrong)).statusCode).toBe(401);
    expect(provider.chat).not.toHaveBeenCalled();
    await instance.close();
  });

  it.each([undefined, '', '   ', 'trop-court'])('secret non configuré côté agent (%p) : la route refuse TOUT, même avec un en-tête', async (configured) => {
    const provider = llm();
    const instance = await app(provider, configured);
    for (const sent of [undefined, '', 'trop-court', TOKEN]) {
      expect((await post(instance, sent)).statusCode).toBe(503);
    }
    expect(provider.chat).not.toHaveBeenCalled();
    await instance.close();
  });

  it('bon secret : 200', async () => {
    const provider = llm();
    const instance = await app(provider, TOKEN);
    const res = await post(instance, TOKEN);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.stepPoints).toBe(120);
    await instance.close();
  });

  it('le débit est borné : au-delà, 429 sans appel au LLM', async () => {
    const provider = llm();
    const instance = await app(provider, TOKEN, { max: 2, windowMs: 60_000 });
    expect((await post(instance, TOKEN)).statusCode).toBe(200);
    expect((await post(instance, TOKEN)).statusCode).toBe(200);
    expect((await post(instance, TOKEN)).statusCode).toBe(429);
    expect(provider.chat).toHaveBeenCalledTimes(2);
    await instance.close();
  });

  it('les requêtes refusées (401) ne consomment pas le débit de la passerelle', async () => {
    const provider = llm();
    const instance = await app(provider, TOKEN, { max: 1, windowMs: 60_000 });
    for (let i = 0; i < 5; i += 1) expect((await post(instance, 'mauvais')).statusCode).toBe(401);
    expect((await post(instance, TOKEN)).statusCode).toBe(200);
    await instance.close();
  });
});
