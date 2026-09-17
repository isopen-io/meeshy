import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminUserConversationsSection } from './admin-user-lists';

/**
 * **UNE LIGNE DE CONVERSATION OUVRE LA VRAIE VUE** (#6862, lot C).
 *
 * `lib/admin/liste-ouvre-sa-fiche.test.ts` garde la STRUCTURE — « pour chaque
 * liste d'administration, l'écran de détail existe dans la table des routes ».
 * Il dit lui-même ce qu'il ne peut pas garder : « que le composant rend
 * effectivement le lien — cela se mesure au DOM ». C'est ce fichier.
 *
 * Et le défaut qu'il garde est EXACTEMENT celui qui a créé ce témoin-là : la
 * ligne de conversation de la fiche d'un membre était un `<li>` INERTE. Rien ne
 * pouvait le voir — `tsc` passe (une liste sans geste est du TypeScript
 * valide), les témoins passent (aucun n'interrogeait cette liste), le gate de
 * poids passe (un geste manquant ALLÈGE). Un maillon absent ne casse rien : il
 * ne relie simplement pas.
 *
 * ## LE PRISME DU MEMBRE SE MESURE ICI AUSSI, ET PAR LE CHEMIN RÉEL
 *
 * `prisme-membre.test.ts` prouve la descente ; `admin-conversation-reading.test.tsx`
 * prouve qu'elle atteint un pixel quand on la LUI PASSE. Ce fichier prouve le
 * maillon qui manquait entre les deux : que la fiche du membre remet SES
 * langues à la modale — et non celles de qui regarde.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadAdminInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

/** Rangs 1 et 2 DIFFÉRENTS de tout défaut produit (`fr`) : un prisme qui
 * verdirait par coïncidence ne prouverait rien. */
const MEMBRE = {
  id: 'u-membre',
  username: 'membre',
  displayName: 'Le membre',
  firstName: '',
  lastName: '',
  bio: '',
  avatar: '',
  email: 'membre@example.test',
  phoneNumber: '',
  role: 'USER',
  timezone: '',
  systemLanguage: 'de',
  regionalLanguage: 'es',
  customDestinationLanguage: 'it',
  isActive: true,
  isOnline: false,
  deactivatedAt: null,
  deletedAt: null,
  deletedBy: null,
  lockedUntil: null,
  lockedReason: null,
  failedLoginAttempts: 0,
  lastPasswordChange: null,
  twoFactorEnabledAt: null,
  twoFactorEnabled: false,
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  lastActiveAt: null,
  createdAt: null,
  updatedAt: null,
} satisfies AdminUserDetail;

const LISTE = {
  data: [{ id: 'c-atelier', title: 'Atelier', type: 'group', memberCount: 4 }],
  pagination: { total: 1, offset: 0, limit: 20, hasMore: false },
};

/** Un seul message, traduit dans le rang 2 du membre — assez pour que la
 * modale rende son fil et annonce le prisme qu'elle sert. */
const FIL = {
  data: [
    {
      id: 'm1',
      conversationId: 'c-atelier',
      senderId: 'u-alice',
      content: 'Hello',
      originalLanguage: 'en',
      messageType: 'text',
      messageSource: 'user',
      isEdited: false,
      isViewOnce: false,
      viewOnceCount: 0,
      isBlurred: false,
      reactionCount: 0,
      isEncrypted: false,
      isProtected: false,
      translations: [
        { id: 't', messageId: 'm1', targetLanguage: 'es', translatedContent: 'Hola', createdAt: '2026-06-02T10:00:05.000Z' },
      ],
      attachmentCount: 0,
      attachments: [],
      replyTo: null,
      createdAt: '2026-06-02T10:00:00.000Z',
      sender: { id: 'p1', userId: 'u-alice', displayName: 'Alice', avatar: null, user: { id: 'u-alice', username: 'alice' } },
    },
  ],
  pagination: { total: 1, offset: 0, limit: 30, hasMore: false },
};

function transportListe(): HttpTransport {
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest): Promise<ApiResult<unknown>> => {
    if (req.path.includes('/messages')) return { ok: true, data: FIL };
    if (req.path.includes('/conversations')) return { ok: true, data: LISTE };
    return { ok: false, status: 404, error: `non prévu : ${req.method} ${req.path}` };
  }) as HttpTransport['request'];
  return transport;
}

const MOTIF = 'Enquête sur un signalement (#9142)';

async function monter(): Promise<HTMLDivElement> {
  return mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminUserConversationsSection membre={MEMBRE} language="fr" deps={{ source: 'gateway', transport: transportListe() }} />
    </QueryClientProvider>,
  );
}

describe('la ligne n’est pas inerte', () => {
  test('elle porte un BOUTON — le clavier y arrive, pas seulement la souris', async () => {
    const host = await monter();
    const ligne = host.querySelector('[data-admin-conversation-open="c-atelier"]');
    expect(ligne).not.toBe(null);
    expect(ligne instanceof HTMLButtonElement).toBe(true);
  });

  test('la toucher OUVRE la modale, qui n’existait pas avant le geste', async () => {
    const host = await monter();
    expect(document.querySelector('[data-admin-conversation-sheet]')).toBe(null);

    await mounter.click(host.querySelector('[data-admin-conversation-open="c-atelier"]') as HTMLElement | null);

    const feuille = document.querySelector('[data-admin-conversation-sheet="c-atelier"]');
    expect(feuille).not.toBe(null);
    // La modale est un `<dialog>` — le piège de focus, Échap et l'inertie du
    // fond viennent avec lui, jamais d'un `aria-modal` qui les ANNONCE sans
    // les rendre.
    expect(document.querySelector('dialog')).not.toBe(null);
  });

  test('la modale demande le MOTIF avant toute requête, comme l’écran plein', async () => {
    const host = await monter();
    await mounter.click(host.querySelector('[data-admin-conversation-open="c-atelier"]') as HTMLElement | null);
    expect(document.querySelector('[data-admin-reason]')).not.toBe(null);
  });
});

describe('LE PRISME REMIS À LA MODALE EST CELUI DU MEMBRE', () => {
  test('les TROIS rangs du membre y arrivent, dans l’ordre', async () => {
    const host = await monter();
    await mounter.click(host.querySelector('[data-admin-conversation-open="c-atelier"]') as HTMLElement | null);

    // La modale n'a pas de fil à annoncer avant que le motif ne soit écrit.
    mounter.type(document.body, '[data-admin-reason]', MOTIF);
    await mounter.click(document.querySelector('[data-admin-reason-submit]') as HTMLElement | null);
    await mounter.settle();

    // La modale DIT le prisme qu'elle sert. Un écran qui servirait le prisme de
    // l'administrateur (`fr`, le défaut du lecteur provisoire) afficherait une
    // autre chaîne — c'est ce contraste qui fait le témoin.
    const annonce = document.querySelector('[data-admin-reading-prism]')?.textContent ?? '';
    expect(annonce).toContain('de › es › it');
    expect(annonce).not.toContain('fr');
  });
});

describe('la section des conversations est REPLIABLE', () => {
  test('elle se plie, et sa liste est alors démontée', async () => {
    const host = await monter();
    expect(host.querySelector('[data-admin-conversation="c-atelier"]')).not.toBe(null);

    await mounter.click(host.querySelector('[data-collapsible-toggle="admin-conv"]') as HTMLElement | null);

    expect(host.querySelector('[data-collapsible-toggle="admin-conv"]')?.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('[data-admin-conversation="c-atelier"]')).toBe(null);
  });
});
