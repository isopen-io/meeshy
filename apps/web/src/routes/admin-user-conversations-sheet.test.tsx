import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { createActMounter } from '@/test-support/act-mount';
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
  banner: '',
  profileCompletionRate: null,
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

/**
 * **« CONFIGURER » N'EXISTE QUE POUR QUI PEUT ÉCRIRE** (#7845, #7999).
 *
 * La passerelle garde les écritures souveraines par `canManageConversations`
 * au rang ADMIN — la même règle qui ouvre la section Conversations, et donc
 * `gerer`. Sans elle, le bouton rendrait un 403 à qui le touche : son absence
 * est le contraste qui fait le témoin.
 */
describe('la ligne porte « Configurer » quand la section Conversations est ouverte', () => {
  const monterAvecGerer = (gerer: 'admConversation' | null) =>
    mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <AdminUserConversationsSection membre={MEMBRE} language="fr" gerer={gerer} deps={{ source: 'gateway', transport: transportListe() }} />
      </QueryClientProvider>,
    );

  test('le toucher ouvre la feuille des écritures souveraines de CETTE conversation', async () => {
    const host = await monterAvecGerer('admConversation');
    const bouton = host.querySelector('[data-admin-conversation-configure="c-atelier"]');
    expect(bouton instanceof HTMLButtonElement).toBe(true);
    expect(document.querySelector('[data-admin-conv-settings]')).toBe(null);

    await mounter.click(bouton as HTMLElement | null);

    expect(document.querySelector('[data-admin-conv-settings="c-atelier"]')).not.toBe(null);
    expect(document.querySelector('[data-admin-conv-reason]')).not.toBe(null);
  });

  test('CONTRASTE — sans la section Conversations, aucun « Configurer »', async () => {
    const host = await monterAvecGerer(null);
    expect(host.querySelector('[data-admin-conversation="c-atelier"]')).not.toBe(null);
    expect(host.querySelector('[data-admin-conversation-configure]')).toBe(null);
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

describe('les conversations du membre se trient et se gèrent (#7845)', () => {
  test('changer le tri relit la liste avec le tri demandé, depuis la première page', async () => {
    const chemins: string[] = [];
    const espion = transportListe();
    const premier = espion.request;
    espion.request = (async (req: HttpRequest) => {
      chemins.push(req.path);
      return premier(req);
    }) as HttpTransport['request'];
    const host = await mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <AdminUserConversationsSection membre={MEMBRE} language="fr" deps={{ source: 'gateway', transport: espion }} />
      </QueryClientProvider>,
    );
    const choix = host.querySelector<HTMLSelectElement>('[data-admin-user-conv-order]');
    if (choix === null) throw new Error('ordre absent');
    choix.value = 'asc';
    choix.dispatchEvent(new Event('change', { bubbles: true }));
    await mounter.settle();
    expect(chemins.at(-1)).toContain('sortOrder=asc');
    expect(chemins.at(-1)).toContain('offset=0');
  });

  test('« Gérer » mène à la fiche de la conversation, et seulement pour qui a la section', async () => {
    const sans = await monter();
    expect(sans.querySelector('[data-admin-conversation-manage]')).toBeNull();
    mounter.unmountAll();

    const avec = await mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <AdminUserConversationsSection membre={MEMBRE} language="fr" gerer="admConversation" deps={{ source: 'gateway', transport: transportListe() }} />
      </QueryClientProvider>,
    );
    expect(avec.querySelector('[data-admin-conversation-manage="c-atelier"]')?.getAttribute('href')).toBe('/adm/conversations/c-atelier');
  });
});
