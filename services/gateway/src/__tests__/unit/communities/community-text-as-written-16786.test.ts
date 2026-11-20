/**
 * #16786 — **le nom et la description d'une communauté se stockent tels qu'écrits, sans entités HTML.**
 *
 * `POST` et `PUT /communities/:id` passaient le texte par `SecuritySanitizer.sanitizeText`, qui rend la
 * SÉRIALISATION HTML de DOMPurify : « Tom & Jerry <3 » était stocké « Tom &amp; Jerry &lt;3 ». Le web décodait à la
 * lecture ; iOS et Android affichaient `&amp;`, et un client qui renvoyait le nom lu l'abîmait d'un cran.
 *
 * Jest ne charge pas le vrai DOMPurify (jsdom est ESM) : `jest.setup.js` le remplace par un double qui
 * n'échappe RIEN, sous lequel le défaut est invisible. Ce témoin pose donc un double FIDÈLE — balises retirées,
 * entités de l'entrée lues, `&`, `<`, `>` et l'espace insécable ré-échappés, comme la sérialisation HTML, et une
 * entrée SANS `<` rendue telle quelle (le raccourci du vrai DOMPurify) — et un
 * témoin d'honnêteté confronte ce double au VRAI DOMPurify, exécuté dans un processus Node séparé. Aucun double
 * de `utils/sanitize` : les routes passent par le vrai assainisseur, et les témoins assertent sur la LIGNE ÉCRITE.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const READ_ENTITIES: Readonly<Record<string, string>> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': '\u00a0' };

function serializeLikeDomPurify(dirty: string): string {
  if (!dirty.includes('<')) return dirty;
  const text = dirty
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?[a-zA-Z!][^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => READ_ENTITIES[entity] ?? entity);
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\u00a0/g, '&nbsp;');
}

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (dirty: unknown) => (typeof dirty === 'string' ? serializeLikeDomPurify(dirty) : '') },
}));

import { SecuritySanitizer } from '../../../utils/sanitize';

const SAMPLES = [
  'Tom & Jerry <3',
  'A & B',
  '3 > 2 et "guillemets" \'simples\'',
  'espace\u00a0insécable',
  '<b>Gras</b> & <script>alert(1)</script>fin',
  '<img src=x onerror=alert(1)>Nom',
  'A &amp; B',
  '<i>x</i> &amp; y < z',
];

function realDomPurify(samples: readonly string[]): string[] {
  const script = `const P = require('isomorphic-dompurify');
const o = { ALLOWED_TAGS: [], ALLOWED_ATTR: [], KEEP_CONTENT: true, RETURN_DOM: false, RETURN_DOM_FRAGMENT: false, FORCE_BODY: false };
process.stdout.write(JSON.stringify(JSON.parse(process.argv[1]).map((s) => P.sanitize(s, o))));`;
  const out = execFileSync(process.execPath, ['-e', script, JSON.stringify(samples)], { cwd: resolve(__dirname, '../../../..'), encoding: 'utf8' });
  return JSON.parse(out) as string[];
}

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

import { registerSettingsRoutes } from '../../../routes/communities/settings';
import { registerCoreRoutes } from '../../../routes/communities/core';

const USER_ID = '507f1f77bcf86cd799439011';
const COMMUNITY_ID = '507f1f77bcf86cd799439099';

describe('le double de DOMPurify est fidèle au vrai', () => {
  it('rend, sur chaque échantillon, exactement ce que rend le vrai DOMPurify', () => {
    expect(SAMPLES.map(serializeLikeDomPurify)).toEqual(realDomPurify(SAMPLES));
  });
});

describe('SecuritySanitizer.sanitizePlainText — un texte simple sort tel qu’écrit', () => {
  it.each([
    ['Tom & Jerry <3', 'Tom & Jerry <3'],
    ['A & B', 'A & B'],
    ['3 > 2 et "guillemets" \'simples\'', '3 > 2 et "guillemets" \'simples\''],
    ['espace insécable', 'espace insécable'],
    ['Café 🇫🇷 👨‍👩‍👧', 'Café 🇫🇷 👨‍👩‍👧'],
    ['A &amp; B', 'A &amp; B'],
    ['<i>x</i> &amp; y < z', 'x & y < z'],
  ])('%j ⇒ %j', (input, expected) => {
    expect(SecuritySanitizer.sanitizePlainText(input)).toBe(expected);
  });

  it('retire toujours les balises, et ne garde que leur texte', () => {
    expect(SecuritySanitizer.sanitizePlainText('<b>Gras</b> & <script>alert(1)</script>fin')).toBe('Gras & fin');
    expect(SecuritySanitizer.sanitizePlainText('<img src=x onerror=alert(1)>Nom')).toBe('Nom');
  });

  it('rend le vide pour une entrée absente, comme sanitizeText', () => {
    expect(SecuritySanitizer.sanitizePlainText(undefined)).toBe('');
    expect(SecuritySanitizer.sanitizePlainText(null)).toBe('');
  });

  it('ne change pas sanitizeText, que ses autres appelants lisent encore échappé', () => {
    expect(SecuritySanitizer.sanitizeText('Tom & Jerry <3')).toBe('Tom &amp; Jerry &lt;3');
  });
});

function prismaDouble() {
  const writes: Array<Record<string, unknown>> = [];
  const row = (data: Record<string, unknown>) => ({
    id: COMMUNITY_ID, identifier: 'mshy_x', createdBy: USER_ID, isPrivate: false, createdAt: new Date(), updatedAt: new Date(),
    creator: { id: USER_ID, username: 'u', displayName: 'U', avatar: null }, _count: { members: 1, Conversation: 0 }, ...data,
  });
  const prisma = {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: COMMUNITY_ID, createdBy: USER_ID, identifier: 'mshy_x', isPrivate: false }),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockImplementation(async ({ data }: any) => { writes.push(data); return row(data); }),
      update: jest.fn<any>().mockImplementation(async ({ data }: any) => { writes.push(data); return row(data); }),
    },
    communityMember: { create: jest.fn<any>().mockResolvedValue({}), findFirst: jest.fn<any>().mockResolvedValue({ role: 'admin' }) },
    user: { findMany: jest.fn<any>().mockResolvedValue([]), findUnique: jest.fn<any>().mockResolvedValue({ id: USER_ID }) },
    $transaction: jest.fn<any>().mockImplementation(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
  };
  return { prisma, writes };
}

async function appWith(register: (app: any) => Promise<void>, prisma: unknown) {
  const app = Fastify({ logger: false });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } };
  });
  app.decorate('prisma', prisma as any);
  await app.register(register);
  await app.ready();
  return app;
}

describe('PUT /communities/:id — le texte réglé est écrit tel quel', () => {
  it('« A & B » et « <3 » partent en base sans entité', async () => {
    const { prisma, writes } = prismaDouble();
    const app = await appWith(registerSettingsRoutes, prisma);
    await app.inject({ method: 'PUT', url: `/communities/${COMMUNITY_ID}`, payload: { name: 'A & B', description: 'Tom & Jerry <3' } });
    await app.close();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ name: 'A & B', description: 'Tom & Jerry <3' });
  });
});

describe('POST /communities — le texte de création est écrit tel quel', () => {
  it('« A & B » part en base sans entité', async () => {
    const { prisma, writes } = prismaDouble();
    const app = await appWith(registerCoreRoutes, prisma);
    await app.inject({ method: 'POST', url: '/communities', payload: { name: 'A & B', description: 'x < y' } });
    await app.close();
    expect(writes[0]).toMatchObject({ name: 'A & B', description: 'x < y' });
  });
});
