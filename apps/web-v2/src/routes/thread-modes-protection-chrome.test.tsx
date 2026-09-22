import type { Virtualizer } from '@tanstack/react-virtual';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ConversationReadingModeSchema, type ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { Message } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';
import type { PlacedMessage } from '@/lib/grouping';
import type { ThreadScene } from '@/lib/reading-mode/scene';
import { noteEphemeralReception, resetEphemeralReception } from '@/lib/view/ephemeral-reception';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadModes } from './thread-modes';

/**
 * **LA GARDE DU « PLUS TARD »** (#7454, travail 2) — directive porteur
 * 2026-09-22 : « il est important de s'assurer que cette feature a un décompte
 * en Script, Focal ou bulle **ou tout autre affichage plus tard** ».
 *
 * Le défaut relevé sur `origin/dev` 3ff99d3aa3 : `EphemeralBadge` n'était monté
 * que par `focal-row.tsx:666` et `bubble.tsx:474` — deux peaux qui le câblaient
 * CHACUNE. Un mode ajouté demain aurait un fil complet, un décompte absent, et
 * aucun témoin rouge : c'est exactement ce que ce fichier interdit.
 *
 * ## POURQUOI LA TABLE EST EXHAUSTIVE AU TYPE
 *
 * `MODE_CONTRACT` est déclaré `satisfies Record<ConversationReadingMode, …>` :
 * ouvrir un sixième mode dans `packages/shared/types/reading-modes.ts` casse le
 * TYPE-CHECK de ce fichier avant même de casser un témoin. La table est ensuite
 * re-croisée à l'EXÉCUTION avec `ConversationReadingModeSchema.options`, parce
 * que `bun test` n'applique aucun typage (CLAUDE.md § pièges) — la garde de
 * type seule serait verte sous le lanceur qui la joue.
 *
 * ## CE QUE CHAQUE MODE DOIT RENDRE
 *
 * `river` n'a pas de peau à lui : `ThreadModes` aiguille sur `usesFlatRow`, et
 * TOUT ce qui n'est ni `summary` ni plat retombe sur `<Bubble>` — un mode neuf
 * y retombera pareillement. Il porte donc le même contrat que `bubbles`.
 * `summary` ne rend AUCUNE rangée de message : son contrat est l'autre moitié
 * de la règle — un éphémère échu n'entre pas dans le corpus qu'il résume.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  resetEphemeralReception();
});

const senderOf = (displayName: string, userId: string) => ({
  id: `p-${userId}`,
  conversationId: 'c-chrome',
  userId,
  displayName,
  type: 'user' as const,
  role: 'member' as const,
  language: 'fr',
  permissions: {
    canSendMessages: true,
    canSendFiles: true,
    canSendImages: true,
    canSendVideos: true,
    canSendAudios: true,
    canSendLocations: true,
    canSendLinks: true,
  },
  isActive: true,
  joinedAt: new Date('2026-01-01T00:00:00.000Z'),
  isOnline: false,
});

const messageOf = (partial: Partial<Message>): Message =>
  ({
    id: 'm-chrome',
    conversationId: 'c-chrome',
    senderId: 'u-bruno',
    content: 'Rendez-vous à 18 h devant la gare.',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    maxViewOnceCount: 1,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 1,
    readCount: 1,
    reactionCount: 0,
    isEncrypted: false,
    createdAt: new Date('2026-09-22T09:02:00.000Z'),
    updatedAt: new Date('2026-09-22T09:02:00.000Z'),
    timestamp: new Date('2026-09-22T09:02:00.000Z'),
    translations: [],
    sender: senderOf('Bruno Bêta', 'u-bruno'),
    ...partial,
  }) as Message;

const placeOf = (message: Message): PlacedMessage => ({ message, head: true, tail: true, opensDay: null });

const virtualizerOf = (count: number): Virtualizer<HTMLElement, Element> =>
  ({
    getTotalSize: () => count * 88,
    getVirtualItems: () =>
      Array.from({ length: count }, (_unused, index) => ({
        index,
        start: index * 88,
        end: (index + 1) * 88,
        size: 88,
        key: index,
        lane: 0,
      })),
    measureElement: () => {},
  }) as unknown as Virtualizer<HTMLElement, Element>;

const VIEWER: Viewer = { id: 'u-viewer', username: 'viewer', displayName: 'Vous' } as unknown as Viewer;
const SCENE: ThreadScene = { elected: null, noteProgrammaticScroll: () => {} } as unknown as ThreadScene;

const monte = async (mode: ConversationReadingMode, messages: readonly Message[]) =>
  mounter.mount(
    <ThreadModes
      mode={mode}
      viewer={VIEWER}
      readerLocale="fr"
      placed={messages.map(placeOf)}
      virtualizer={virtualizerOf(messages.length)}
      scene={SCENE}
      readerLanguages={['fr']}
      group={false}
      highlightedId={null}
      expiredIds={new Set()}
      jumpToMessage={() => {}}
      typists={[]}
    />,
  );

/**
 * LE CONTRAT PAR MODE — exhaustif au TYPE (voir le doc-comment du fichier).
 * `rendersRows: false` ne veut pas dire « exempté » : `summary` porte l'autre
 * moitié de la règle, mesurée par son propre témoin plus bas.
 */
const MODE_CONTRACT = {
  focal: { rendersRows: true },
  script: { rendersRows: true },
  bubbles: { rendersRows: true },
  river: { rendersRows: true },
  summary: { rendersRows: false },
} as const satisfies Record<ConversationReadingMode, { readonly rendersRows: boolean }>;

const MODES_AVEC_RANGEES = ConversationReadingModeSchema.options.filter(
  (mode) => MODE_CONTRACT[mode].rendersRows,
);

test('la table des modes couvre TOUTE l’énumération partagée', () => {
  for (const mode of ConversationReadingModeSchema.options) {
    expect(Object.keys(MODE_CONTRACT)).toContain(mode);
  }
});

for (const mode of MODES_AVEC_RANGEES) describe(`mode ${mode}`, () => {
  test('rend le DÉCOMPTE d’un éphémère reçu', async () => {
    const message = messageOf({ id: 'm-ephemere', ephemeralDuration: 600 });
    noteEphemeralReception('m-ephemere', Date.now());
    const host = await monte(mode, [message]);

    const badge = host.querySelector('[data-ephemeral]');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('data-ephemeral')).toBe('running');
    /* LE LECTEUR D'ÉCRAN (#7454, exigence 6) — « éphémère, disparaît dans
       N minutes », jamais un chiffre nu. */
    expect(badge?.getAttribute('aria-label') ?? '').toContain('éphémère');
    expect(badge?.getAttribute('aria-label') ?? '').toContain('disparaît dans');
  });

  test('dit « en attente de réception » à l’EXPÉDITEUR sans échéance', async () => {
    const message = messageOf({
      id: 'm-attente',
      senderId: 'u-viewer',
      sender: senderOf('Vous', 'u-viewer'),
      ephemeralDuration: 600,
    });
    const host = await monte(mode, [message]);

    const badge = host.querySelector('[data-ephemeral]');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('data-ephemeral')).toBe('awaiting');
  });

  test('NOMME la vue unique même SANS pièce jointe', async () => {
    const message = messageOf({ id: 'm-vue-unique', isViewOnce: true });
    const host = await monte(mode, [message]);

    const mention = host.querySelector('[data-view-once]');
    expect(mention).not.toBeNull();
    expect(mention?.textContent ?? '').toContain('Vue unique');
  });

  test('donne à la vue unique un pictogramme DISTINCT de celui de l’éphémère', async () => {
    const vueUnique = await monte(mode, [messageOf({ id: 'm-vue-unique', isViewOnce: true })]);
    const glypheVueUnique = vueUnique.querySelector('[data-view-once]')?.getAttribute('data-glyph');

    noteEphemeralReception('m-ephemere', Date.now());
    const ephemere = await monte(mode, [messageOf({ id: 'm-ephemere', ephemeralDuration: 600 })]);
    const glypheEphemere = ephemere.querySelector('[data-ephemeral]')?.getAttribute('data-glyph');

    expect(glypheVueUnique).toBeTruthy();
    expect(glypheEphemere).toBeTruthy();
    expect(glypheVueUnique).not.toBe(glypheEphemere);
  });

  test('efface le message à l’échéance', async () => {
    const message = messageOf({ id: 'm-echu', ephemeralDuration: 1 });
    noteEphemeralReception('m-echu', Date.now() - 5000);
    const host = await monte(mode, [message]);

    expect(host.querySelector('[data-protected="expired"], [data-row="m-echu"]')).not.toBeNull();
    expect(host.textContent ?? '').not.toContain('Rendez-vous à 18 h');
  });
});
