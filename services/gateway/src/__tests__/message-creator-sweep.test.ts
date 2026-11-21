/**
 * Cliquet de la discipline d'écriture de `Message.deletedAt` (#20172).
 *
 * Voir `message-creator-sweep.ts` pour ce que ce balayage mesure — et surtout
 * pour ce qu'il ne mesure PAS : **rien des lignes déjà en base**. Une passe
 * verte ne dit pas que la population est saine, elle dit que le prochain
 * créateur ne la dégradera pas. Le comptage et la migration sont l'autre moitié
 * de #20172, et ils touchent des données de production.
 *
 * **Quand il tombe :**
 *
 * - un site `nu` ⇒ un créateur n'écrit pas `deletedAt`. La réparation est de
 *   répandre `LIVE_MESSAGE_MARK`, **jamais** d'ajouter une ligne d'inventaire :
 *   il n'existe pas de créateur légitimement muet, les ~119 lectures du dépôt
 *   filtrant toutes `deletedAt: null`.
 * - un site `indecidable` ⇒ le balayage ne sait pas lire ce `data`. Ouvrir le
 *   site, et soit le rendre lisible, soit geler la ligne AVEC sa raison — un
 *   inventaire qui publie ce qu'il n'a pas jugé vaut mieux qu'un vert rendu sur
 *   une intuition (doctrine du cliquet de l'audience vivante).
 * - un site `relais` ⇒ ce site reçoit son `data` ; ses APPELANTS sont jugés à
 *   sa place, et c'est leur verdict qui compte.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { sweepMessageCreators, relayNames, formatCreator, carriesMarker } from './message-creator-sweep';

/**
 * L'inventaire des sites que le balayage ne JUGE pas lui-même, chacun ouvert à
 * la main. Il doit rester à UNE entrée — celle du relais — et toute ligne
 * nouvelle est une question, pas une autorisation.
 *
 * | site | pourquoi | qui décide à sa place |
 * |---|---|---|
 * | `routes/links/messageIdempotency.ts#create1` | son `data` est un PARAMÈTRE (`Prisma.MessageUncheckedCreateInput`) | `routes/links/messages.ts`, jugé `marque` via le relais |
 */
const RELAYED = ['routes/links/messageIdempotency.ts#create1'] as const;

/** Aucun site indécidable aujourd'hui : le balayage lit les six créateurs du dépôt. */
const FROZEN_UNJUDGED: readonly string[] = [];

const temporaries: string[] = [];
afterEach(() => {
  for (const dir of temporaries.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const world = (files: Readonly<Record<string, string>>): string => {
  const root = mkdtempSync(join(tmpdir(), 'message-creator-sweep-'));
  temporaries.push(root);
  for (const [path, source] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(join(absolute, '..'), { recursive: true });
    writeFileSync(absolute, source, 'utf8');
  }
  return root;
};

describe('tout créateur de `Message` écrit `deletedAt` (#20172)', () => {
  it('le balayage voit bien les créateurs du dépôt — sinon une mesure vide passerait au vert', () => {
    const sites = sweepMessageCreators();

    expect(sites.length).toBeGreaterThanOrEqual(6);
    expect(relayNames()).toContain('writeLinkMessageIdempotently');
  });

  it('aucun créateur ne part sans écrire la colonne', () => {
    const nus = sweepMessageCreators()
      .filter((site) => site.verdict === 'nu')
      .map(formatCreator);

    expect(nus).toEqual([]);
  });

  it('les sites que le balayage ne juge pas sont ceux qui sont gelés, et pas un de plus', () => {
    const sites = sweepMessageCreators();

    expect(sites.filter((site) => site.verdict === 'relais').map(formatCreator)).toEqual([...RELAYED]);
    expect(sites.filter((site) => site.verdict === 'indecidable').map(formatCreator)).toEqual([...FROZEN_UNJUDGED]);
  });

  it('chaque site non jugé DIT pourquoi — un inventaire muet se lirait comme une autorisation', () => {
    const muets = sweepMessageCreators()
      .filter((site) => site.verdict !== 'marque' && (site.why ?? '').trim().length === 0)
      .map(formatCreator);

    expect(muets).toEqual([]);
  });
});

describe('le balayage tombe sur la mutation qu’il nomme', () => {
  it('voit un créateur NU — un littéral sans la colonne', () => {
    const root = world({
      'services/muet.ts': `export const write = (prisma: any) => prisma.message.create({ data: { conversationId: 'c', senderId: 's', content: 'x' } });`,
    });

    expect(sweepMessageCreators(root).map((site) => site.verdict)).toEqual(['nu']);
  });

  it('voit la marque RÉPANDUE, et la colonne écrite EN CLAIR — les deux orthographes de la discipline', () => {
    const root = world({
      'services/marque.ts': `import { LIVE_MESSAGE_MARK } from './liveMessage';\nexport const a = (p: any) => p.message.create({ data: { content: 'x', ...LIVE_MESSAGE_MARK } });`,
      'services/clair.ts': `export const b = (p: any) => p.message.create({ data: { content: 'x', deletedAt: null } });`,
    });

    expect(sweepMessageCreators(root).every((site) => site.verdict === 'marque')).toBe(true);
  });

  it('résout un `data` déclaré par un `const` du même fichier — la forme de `MessageProcessor`', () => {
    const root = world({
      'services/indirect.ts': `import { LIVE_MESSAGE_MARK } from './liveMessage';\nexport const c = (p: any) => {\n  const messageData = { content: 'x', ...LIVE_MESSAGE_MARK };\n  return p.message.create({ data: messageData });\n};`,
    });

    expect(sweepMessageCreators(root).map((site) => site.verdict)).toEqual(['marque']);
  });

  it('JUGE L’APPELANT d’un relais, et le prend NU quand c’est lui qui oublie la marque', () => {
    const root = world({
      'routes/relais.ts': `import type { Prisma } from '@meeshy/shared/prisma/client';\nexport async function writeThrough(params: { prisma: any; data: Prisma.MessageUncheckedCreateInput }) {\n  const { prisma, data } = params;\n  return prisma.message.create({ data });\n}`,
      'routes/appelant-muet.ts': `import { writeThrough } from './relais';\nexport const send = (prisma: any) => writeThrough({ prisma, data: { content: 'x', senderId: 's' } });`,
    });

    const sites = sweepMessageCreators(root);

    expect(sites.filter((site) => site.verdict === 'relais').map((site) => site.file)).toEqual(['routes/relais.ts']);
    expect(sites.filter((site) => site.verdict === 'nu').map((site) => site.file)).toEqual(['routes/appelant-muet.ts']);
  });

  it('ne compte pas un créateur CITÉ en commentaire', () => {
    const root = world({
      'services/commente.ts': `// prisma.message.create({ data: { content: 'x' } })\n/* p.message.create({ data: {} }) */\nexport const nothing = 1;`,
    });

    expect(sweepMessageCreators(root)).toEqual([]);
  });

  it('reconnaît les deux orthographes de la discipline, et rien d’autre', () => {
    expect(carriesMarker('{ content: 1, ...LIVE_MESSAGE_MARK }')).toBe(true);
    expect(carriesMarker('{ content: 1, deletedAt: null }')).toBe(true);
    expect(carriesMarker('{ content: 1, deletedForMe: null }')).toBe(false);
    expect(carriesMarker('{ content: 1 }')).toBe(false);
  });
});
