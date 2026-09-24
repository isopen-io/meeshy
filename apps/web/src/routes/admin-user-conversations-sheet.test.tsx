import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { createActMounter, typeInto } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminUserConversationsSection, AdminUserMediaSection } from './admin-user-lists';

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
  banner: null,
  phoneCountryCode: '',
  profileCompletionRate: null,
  counts: {
    participations: 0,
    sentFriendRequests: 0,
    receivedFriendRequests: 0,
    createdShareLinks: 0,
    createdTrackingLinks: 0,
    createdAffiliateTokens: 0,
  },
  deviceLocale: '',
  deviceCountry: '',
  ageVerifiedAt: null,
  consents: { voiceProfile: null, voiceData: null, dataProcessing: null, analytics: null, voiceCloning: null },
  termsAcceptedAt: null,
  termsVersion: null,
  onboardingCompletedAt: null,
  engagement: {
    currentStreakDays: 0,
    longestStreakDays: 0,
    lastStreakDate: null,
    engagementScore: 0,
    meeshBalance: 0,
    meeshMintedLifetime: 0,
  },
  blockedCount: 0,
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

describe('la section des conversations est un PANNEAU d’onglet, pas un repliable', () => {
  test('aucun repliable ne répète l’onglet — un clic ne peut plus vider le panneau', async () => {
    const host = await monter();
    expect(host.querySelector('[data-admin-conversation="c-atelier"]')).not.toBe(null);
    expect(host.querySelector('[data-collapsible-toggle="admin-conv"]')).toBe(null);
    expect(host.querySelector('[data-admin-section="conversations"]')).not.toBe(null);
  });
});

/**
 * **UN ÉCHEC N'EST PAS UN VIDE** (#6862, revue-correction).
 *
 * La section rendait « Aucune conversation » dès que `page.data` manquait —
 * c'est-à-dire aussi quand la requête avait ÉCHOUÉ. Un vide avalé ressemble
 * trait pour trait à un vide légitime, sauf qu'il affirme un FAIT sur le
 * membre : « il ne parle nulle part ». Un administrateur lit ça comme une
 * réponse et classe le dossier.
 *
 * Le témoin porte sur la DISTINCTION, pas sur la présence d'un texte : les deux
 * états rendaient déjà un paragraphe, et c'est bien pour ça que personne ne
 * voyait le défaut.
 */
describe('une absence s’explique, elle ne se confond pas avec un vide', () => {
  function transportQuiEchoue(): HttpTransport {
    const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
    transport.request = (async (): Promise<ApiResult<unknown>> => ({
      ok: false,
      status: 500,
      error: 'Erreur serveur',
    })) as HttpTransport['request'];
    return transport;
  }

  function transportVide(): HttpTransport {
    const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
    transport.request = (async (): Promise<ApiResult<unknown>> => ({
      ok: true,
      data: [],
      status: 200,
      pagination: { total: 0, offset: 0, limit: 20, hasMore: false },
    })) as unknown as HttpTransport['request'];
    return transport;
  }

  const monterAvec = async (transport: HttpTransport): Promise<HTMLDivElement> =>
    mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <AdminUserConversationsSection membre={MEMBRE} language="fr" deps={{ source: 'gateway', transport }} />
      </QueryClientProvider>,
    );

  test('une requête REFUSÉE ne dit pas « aucune conversation »', async () => {
    const host = await monterAvec(transportQuiEchoue());
    expect(host.querySelector('[data-admin-absence]')).not.toBe(null);
    expect(host.textContent ?? '').not.toContain(translateAdmin('fr', 'admin.conv.empty'));
  });

  test('CONTRASTE — une liste VRAIMENT vide dit bien qu’elle est vide', async () => {
    const host = await monterAvec(transportVide());
    expect(host.querySelector('[data-admin-absence]')).toBe(null);
    expect(host.textContent ?? '').toContain(translateAdmin('fr', 'admin.conv.empty'));
  });
});

/**
 * LA MÊME LOI SUR LA SECTION JUMELLE (#6862, revue-correction) — les deux
 * sections de la fiche sont écrites l'une à côté de l'autre, et un correctif
 * porté sur une seule laisse l'autre mentir. La mutation « l'échec redevient un
 * vide » a survécu ici tant que ce témoin n'existait pas, alors qu'elle mourait
 * sur la section des conversations : deux surfaces, deux témoins.
 */
describe('les MÉDIAS aussi : un échec n’est pas « rien publié »', () => {
  const transportRefus = (): HttpTransport => {
    const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
    transport.request = (async (): Promise<ApiResult<unknown>> => ({
      ok: false,
      status: 500,
      error: 'Erreur serveur',
    })) as HttpTransport['request'];
    return transport;
  };

  const transportVideMedia = (): HttpTransport => {
    const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
    transport.request = (async (): Promise<ApiResult<unknown>> => ({
      ok: true,
      data: [],
      status: 200,
      pagination: { total: 0, offset: 0, limit: 20, hasMore: false },
    })) as unknown as HttpTransport['request'];
    return transport;
  };

  const monterMedias = async (transport: HttpTransport): Promise<HTMLDivElement> =>
    mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <AdminUserMediaSection userId={MEMBRE.id} language="fr" deps={{ source: 'gateway', transport }} />
      </QueryClientProvider>,
    );

  test('une requête REFUSÉE ne dit pas « aucun média »', async () => {
    const host = await monterMedias(transportRefus());
    expect(host.querySelector('[data-admin-absence]')).not.toBe(null);
    expect(host.textContent ?? '').not.toContain(translateAdmin('fr', 'admin.media.empty'));
  });

  test('CONTRASTE — une galerie VRAIMENT vide le dit', async () => {
    const host = await monterMedias(transportVideMedia());
    expect(host.querySelector('[data-admin-absence]')).toBe(null);
    expect(host.textContent ?? '').toContain(translateAdmin('fr', 'admin.media.empty'));
  });
});

/**
 * **TRIER, FILTRER, CONFIGURER** (#7845 D/E) — un tri qui ne change pas la
 * requête est un tri décoratif : le témoin lit la chaîne de requête PARTIE.
 */
describe('le tri et la configuration', () => {
  function transportComptant() {
    const appels: HttpRequest[] = [];
    const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
    transport.request = (async (req: HttpRequest): Promise<ApiResult<unknown>> => {
      appels.push(req);
      if (req.path.includes('/conversations')) return { ok: true, data: LISTE };
      return { ok: false, status: 404, error: 'non prévu' };
    }) as HttpTransport['request'];
    return { transport, appels };
  }

  const requetes = (appels: readonly HttpRequest[]) =>
    appels.filter((a) => a.path.includes('/conversations')).map((a) => new URLSearchParams(a.path.split('?')[1] ?? ''));

  async function monterTri() {
    const t = transportComptant();
    const host = await mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <AdminUserConversationsSection membre={MEMBRE} language="fr" deps={{ source: 'gateway', transport: t.transport }} />
      </QueryClientProvider>,
    );
    return { host, appels: t.appels };
  }

  test('changer le TRI relance la requête avec `sort`', async () => {
    const { host, appels } = await monterTri();
    typeInto(host.querySelector('[data-admin-conv-sort]') as HTMLSelectElement, 'title');
    await mounter.settle();
    expect(requetes(appels).at(-1)?.get('sort')).toBe('title');
    expect(requetes(appels).at(-1)?.get('order')).toBe('desc');
  });

  test('inverser l’ORDRE relance la requête avec `order=asc`', async () => {
    const { host, appels } = await monterTri();
    await mounter.click(host.querySelector('[data-admin-conv-order]') as HTMLElement | null);
    expect(requetes(appels).at(-1)?.get('order')).toBe('asc');
  });

  test('filtrer par RÔLE du membre part en `role`', async () => {
    const { host, appels } = await monterTri();
    typeInto(host.querySelector('[data-admin-conv-role]') as HTMLSelectElement, 'moderator');
    await mounter.settle();
    expect(requetes(appels).at(-1)?.get('role')).toBe('moderator');
  });

  test('la RECHERCHE part à la validation, sans attendre le délai', async () => {
    const { host, appels } = await monterTri();
    mounter.type(host, '[data-admin-conv-search]', 'atel');
    await mounter.submit(host);
    expect(requetes(appels).at(-1)?.get('search')).toBe('atel');
  });

  test('« Configurer » ouvre la feuille de configuration, distincte de la lecture', async () => {
    const { host } = await monterTri();
    expect(document.querySelector('[data-admin-conv-settings]')).toBe(null);
    await mounter.click(host.querySelector('[data-admin-conversation-configure="c-atelier"]') as HTMLElement | null);
    expect(document.querySelector('[data-admin-conv-settings="c-atelier"]')).not.toBe(null);
    expect(document.querySelector('[data-admin-conversation-sheet]')).toBe(null);
  });
});
