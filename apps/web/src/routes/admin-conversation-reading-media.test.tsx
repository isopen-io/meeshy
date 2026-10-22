import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import type { Viewer } from '@/lib/api/viewer';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { ADMIN_PERMISSIONS_QUERY_KEY } from '@/lib/api/admin';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminConversationReading } from './admin-conversation-reading';

/**
 * **LA PELLICULE SOUVERAINE VOILE, ELLE NE PEINT JAMAIS L'URL** (#11510).
 *
 * L'onglet Médias lit désormais `GET /admin/conversations/:id/attachments`, et
 * la passerelle y voile déjà une pièce protégée. Ces témoins se mesurent sur
 * une charge PLUS BAVARDE que ce qu'elle sert : chaque pièce protégée porte
 * ici un `fileUrl` qui ne devrait pas être là. Un témoin fail-closed ne vaut
 * que mesuré contre ce que le serveur n'enverra pas.
 *
 * Quatre protections, une par canal de `maskedAttachment` plus celle du
 * MESSAGE : la vue unique, le flou, le bitfield SEUL (leçon 261 — sur
 * `isViewOnce: true`, une garde partielle et la garde juste rendent le même
 * verdict), et le message chiffré, dont la pièce n'a aucun drapeau propre.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

let restaureLaMiseEnPage: (() => void) | null = null;

function simuleLaMiseEnPage(): () => void {
  const proto = HTMLElement.prototype as unknown as object;
  const hauteur = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');
  const largeur = Object.getOwnPropertyDescriptor(proto, 'offsetWidth');
  Object.defineProperty(proto, 'offsetHeight', { configurable: true, get: () => 800 });
  Object.defineProperty(proto, 'offsetWidth', { configurable: true, get: () => 390 });
  return () => {
    if (hauteur !== undefined) Object.defineProperty(proto, 'offsetHeight', hauteur);
    if (largeur !== undefined) Object.defineProperty(proto, 'offsetWidth', largeur);
  };
}

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  restaureLaMiseEnPage = simuleLaMiseEnPage();
  await loadAdminInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  restaureLaMiseEnPage?.();
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
beforeEach(() => {
  appQueryClient.setQueryData(ADMIN_PERMISSIONS_QUERY_KEY, adminIdentityFixture({ role: 'ADMIN' }));
});
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

const MOTIF = 'Signalement #9142 — vérification des pièces';
const CONVERSATION = 'c-pellicule';
const VIEWER: Viewer = { id: 'u-membre', handle: 'membre', displayName: 'Le membre', isAnonymous: false };

const porteur = (id: string, isProtected = false) => ({
  id,
  createdAt: '2026-06-02T10:00:00.000Z',
  senderId: 'u-alice',
  senderParticipantId: 'p-alice',
  sender: { id: 'p-alice', userId: 'u-alice', displayName: 'Alice', avatar: null, user: { id: 'u-alice', username: 'alice' } },
  isProtected,
});

const piece = (id: string, extra: Record<string, unknown>) => ({
  id,
  messageId: 'm-x',
  originalName: `${id}.png`,
  mimeType: 'image/png',
  fileSize: 96,
  thumbnailUrl: null,
  thumbHash: null,
  imageVariants: [],
  transcription: null,
  translations: null,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  isProtected: false,
  message: porteur('m-x'),
  ...extra,
});

const PELLICULE = {
  data: [
    piece('a-vue-unique', { isViewOnce: true, isProtected: true, fileUrl: 'data:image/png;base64,FUITE-VUE-UNIQUE', message: porteur('m-vue-unique') }),
    piece('a-floue', { isBlurred: true, isProtected: true, fileUrl: 'data:image/png;base64,FUITE-FLOUE', message: porteur('m-floue') }),
    piece('a-effet', { effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE, isProtected: true, fileUrl: 'data:image/png;base64,FUITE-EFFET', message: porteur('m-effet') }),
    piece('a-vocal-secret', {
      mimeType: 'audio/mp4',
      originalName: 'memo-secret.m4a',
      duration: 42000,
      isBlurred: true,
      isProtected: true,
      fileUrl: 'data:audio/mp4;base64,FUITE-VOCALE',
      message: porteur('m-vocal'),
    }),
    piece('a-chiffre', { isProtected: true, fileUrl: 'data:image/png;base64,FUITE-CHIFFREE', message: porteur('m-chiffre', true) }),
    piece('a-libre', { fileUrl: 'data:image/png;base64,PLAN-LIBRE', message: porteur('m-libre') }),
  ],
  pagination: { limit: 60, hasMore: false, nextCursor: null, form: 'keyset' },
};

/* Le fil porte UN message libre : sans rangée, l'écran rend son état vide et aucun onglet. */
const FIL = {
  data: [
    {
      id: 'm-libre',
      conversationId: CONVERSATION,
      senderId: 'u-alice',
      content: 'Le plan de la salle',
      originalLanguage: 'fr',
      messageType: 'text',
      messageSource: 'user',
      isEdited: false,
      isViewOnce: false,
      viewOnceCount: 0,
      isBlurred: false,
      reactionCount: 0,
      isEncrypted: false,
      isProtected: false,
      translations: [],
      attachmentCount: 0,
      attachments: [],
      replyTo: null,
      createdAt: '2026-06-02T10:00:00.000Z',
      sender: porteur('m-libre').sender,
    },
  ],
  pagination: { total: 1, offset: 0, limit: 30, hasMore: false },
};

function transportSouverain(): HttpTransport {
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest): Promise<ApiResult<unknown>> => {
    if (req.path.startsWith(`/api/v1/admin/conversations/${CONVERSATION}/attachments`)) return { ok: true, data: PELLICULE };
    if (req.path.startsWith(`/api/v1/admin/conversations/${CONVERSATION}/messages`)) return { ok: true, data: FIL };
    return { ok: false, status: 404, error: `non prévu : ${req.method} ${req.path}` };
  }) as HttpTransport['request'];
  return transport;
}

async function ouvrirLaPellicule(): Promise<HTMLElement> {
  const host = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminConversationReading
        conversationId={CONVERSATION}
        language="fr"
        prisme="lecteur"
        readerLanguages={['fr']}
        viewer={VIEWER}
        deps={{ source: 'gateway', transport: transportSouverain() }}
      />
    </QueryClientProvider>,
  );
  mounter.type(host, '[data-admin-reason]', MOTIF);
  await mounter.click(host.querySelector('[data-admin-reason-submit]') as HTMLElement | null);
  await mounter.settle();
  await mounter.click(host.querySelector('[data-admin-reading-tab="media"]') as HTMLElement | null);
  await mounter.settle();
  await mounter.settle();
  return host.querySelector('[data-admin-reading-media]') as HTMLElement;
}

describe('la pellicule souveraine — une pièce protégée rend son voile, jamais son URL', () => {
  test('CONTRASTE — la pièce LIBRE peint sa vignette, avec sa source', async () => {
    const pellicule = await ouvrirLaPellicule();
    const tuile = pellicule.querySelector('[data-media-hub-tile="m-libre:a-libre"]');
    expect(tuile?.querySelector('img')?.getAttribute('src') ?? '').toContain('PLAN-LIBRE');
  });

  const VOILEES: ReadonlyArray<readonly [string, string]> = [
    ['à vue unique', 'm-vue-unique:a-vue-unique'],
    ['floutée', 'm-floue:a-floue'],
    ['à effets (bitfield seul)', 'm-effet:a-effet'],
  ];
  for (const [nom, clef] of VOILEES) {
    test(`une image ${nom} reste LISTÉE sous un voile — aucune <img>`, async () => {
      const pellicule = await ouvrirLaPellicule();
      const tuile = pellicule.querySelector(`[data-media-hub-tile="${clef}"]`);
      expect(tuile).not.toBeNull();
      expect(tuile?.querySelector('img')).toBeNull();
    });
  }

  test('un vocal flouté reste listé sans lecteur, sans durée', async () => {
    const pellicule = await ouvrirLaPellicule();
    const rangee = pellicule.querySelector('[data-media-hub-row="m-vocal:a-vocal-secret"]');
    expect(rangee).not.toBeNull();
    expect(rangee?.querySelector('audio')).toBeNull();
    expect(rangee?.outerHTML ?? '').not.toContain('0:42');
  });

  test('la pièce d’un message CHIFFRÉ n’entre pas du tout — le fil en dit le constat', async () => {
    const pellicule = await ouvrirLaPellicule();
    expect(pellicule.querySelectorAll('[data-media-hub-tile^="m-chiffre"], [data-media-hub-row^="m-chiffre"]')).toHaveLength(0);
  });

  test('et AUCUNE des URL servies en trop n’atteint le DOM — attributs compris', async () => {
    const pellicule = await ouvrirLaPellicule();
    const dom = pellicule.innerHTML;
    for (const fuite of ['FUITE-VUE-UNIQUE', 'FUITE-FLOUE', 'FUITE-EFFET', 'FUITE-VOCALE', 'FUITE-CHIFFREE']) {
      expect(dom).not.toContain(fuite);
    }
    expect(dom).toContain('PLAN-LIBRE');
  });

  test('les quatre genres sont offerts en puces, « Tout » pressé par défaut', async () => {
    const pellicule = await ouvrirLaPellicule();
    expect(pellicule.querySelector('[data-admin-reading-media-kind="all"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(pellicule.querySelectorAll('[data-admin-reading-media-kind]')).toHaveLength(5);
  });
});
