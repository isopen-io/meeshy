import { QueryClientProvider, dehydrate } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ADMIN_SOUVERAIN_PREFIXE } from '@/lib/api/admin-conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient, persistableQuery } from '@/lib/api/query-client';
import type { Viewer } from '@/lib/api/viewer';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminConversationReading } from './admin-conversation-reading';

/**
 * **LA LECTURE SOUVERAINE, AU PRISME DU MEMBRE** (#6862, lot C) — le premier
 * témoin de RENDU d'un écran d'administration du dépôt.
 *
 * ## Pourquoi il ne peut pas se remplacer par un témoin de bibliothèque
 *
 * `prisme-membre.test.ts` prouve que la DESCENTE est juste ; il ne prouve pas
 * qu'elle atteint un PIXEL. C'est exactement la distance que le CLAUDE.md
 * racine nomme au cycle 122 (« qui AFFICHE ce qu'il élit ? ») et qu'il a fallu
 * trois cycles pour parcourir : un résolveur juste dont la valeur n'atteint
 * aucun lecteur n'a corrigé personne. Ce fichier lit le DOM.
 *
 * ## LE TÉMOIN DE RANG SE LIT SUR LE RANG 2 (leçon 261)
 *
 * Au rang 1, une règle juste et une règle fausse rendent le MÊME verdict : le
 * témoin ne peut pas tomber. Le corpus ci-dessous est donc construit pour que
 * le rang 1 du membre (`de`) n'ait AUCUNE traduction :
 *
 * | prisme | rang servi | texte attendu |
 * |---|---|---|
 * | membre `['de','es']` | 2 (`es`) | **Hola** |
 * | administrateur `['fr']` | 1 (`fr`) | Bonjour |
 * | un résolveur qui ne lit que le rang 1 | aucun | Hello (l'original) |
 *
 * Les trois textes sont DIFFÉRENTS : le témoin distingue donc « le bon prisme »
 * de « le prisme de l'administrateur » ET de « une descente qui s'arrête au
 * premier rang ». Un corpus où le membre et l'administrateur partagent une
 * langue verdirait par coïncidence.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

/**
 * **HAPPY-DOM NE FAIT PAS DE MISE EN PAGE, ET LE VIRTUALISEUR NE REND RIEN SANS
 * ELLE.** `calculateRange` (`@tanstack/virtual-core`) rend `null` dès que
 * `outerSize === 0`, et `outerSize` se lit sur `offsetHeight` du conteneur de
 * défilement — que happy-dom fixe à `0`, faute de moteur de rendu.
 *
 * Sans ce simulacre, `getVirtualItems()` est VIDE : le témoin mesurerait un
 * écran sans une seule rangée, et il verdirait sur « pas de Bonjour » aussi
 * bien que sur « pas de Hola ». On ne simule donc aucun comportement du
 * produit — on rend la seule chose que happy-dom ne fait pas : une hauteur.
 */
const HAUTEUR_SIMULEE = 800;
const LARGEUR_SIMULEE = 390;

function simuleLaMiseEnPage(): () => void {
  const proto = HTMLElement.prototype as unknown as object;
  const hauteur = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');
  const largeur = Object.getOwnPropertyDescriptor(proto, 'offsetWidth');
  Object.defineProperty(proto, 'offsetHeight', { configurable: true, get: () => HAUTEUR_SIMULEE });
  Object.defineProperty(proto, 'offsetWidth', { configurable: true, get: () => LARGEUR_SIMULEE });
  return () => {
    if (hauteur !== undefined) Object.defineProperty(proto, 'offsetHeight', hauteur);
    if (largeur !== undefined) Object.defineProperty(proto, 'offsetWidth', largeur);
  };
}

let restaureLaMiseEnPage: (() => void) | null = null;

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  restaureLaMiseEnPage = simuleLaMiseEnPage();
  // `translateAdmin` LÈVE sur un catalogue non chargé — c'est son contrat, et
  // il vaut aussi pour un témoin.
  await loadAdminInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  restaureLaMiseEnPage?.();
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
  try {
    localStorage.clear();
  } catch {
    /* un stockage refusé n'est pas l'objet de ce fichier */
  }
});

const MOTIF = 'Enquête sur un signalement (#9142)';
const CONVERSATION = 'c-lot-c';

/** Le fil SERVI par la passerelle : `createdAt DESC`, forme canonique. */
const CHARGE = {
  data: [
    {
      id: 'm-chiffre',
      conversationId: CONVERSATION,
      senderId: 'u-bob',
      content: null,
      originalLanguage: 'en',
      messageType: 'text',
      messageSource: 'user',
      isEdited: false,
      isViewOnce: false,
      viewOnceCount: 0,
      isBlurred: false,
      reactionCount: 0,
      /* PROTÉGÉ PAR CHIFFREMENT SEUL — la loi CLIENT (`protectionOf`) ne
         connaît ni `isEncrypted` ni `encryptionMode` et rendrait « standard ».
         C'est le cas qui produisait une bulle VIDE. */
      isEncrypted: true,
      encryptionMode: 'e2ee',
      isProtected: true,
      translations: [],
      attachmentCount: 0,
      attachments: [],
      replyTo: null,
      createdAt: '2026-06-02T11:00:00.000Z',
      sender: { id: 'p-bob', userId: 'u-bob', displayName: 'Bob', avatar: null, user: { id: 'u-bob', username: 'bob' } },
    },
    {
      id: 'm-traduit',
      conversationId: CONVERSATION,
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
      /* NI ALLEMAND (rang 1 du membre) : c'est ce qui force la descente. */
      translations: [
        { id: 't-es', messageId: 'm-traduit', targetLanguage: 'es', translatedContent: 'Hola', createdAt: '2026-06-02T10:00:05.000Z' },
        { id: 't-fr', messageId: 'm-traduit', targetLanguage: 'fr', translatedContent: 'Bonjour', createdAt: '2026-06-02T10:00:05.000Z' },
      ],
      attachmentCount: 0,
      attachments: [],
      replyTo: null,
      createdAt: '2026-06-02T10:00:00.000Z',
      sender: {
        id: 'p-alice',
        userId: 'u-alice',
        displayName: 'Alice',
        avatar: null,
        user: { id: 'u-alice', username: 'alice' },
      },
    },
  ],
  pagination: { total: 2, offset: 0, limit: 30, hasMore: false },
};

/** Un transport qui répond à la route souveraine QUEL QUE SOIT le motif encodé. */
function transportSouverain(): { readonly transport: HttpTransport; readonly calls: () => readonly HttpRequest[] } {
  const calls: HttpRequest[] = [];
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest): Promise<ApiResult<unknown>> => {
    calls.push(req);
    if (req.path.startsWith(`/api/v1/admin/conversations/${CONVERSATION}/messages`)) {
      return { ok: true, data: CHARGE };
    }
    return { ok: false, status: 404, error: `non prévu : ${req.method} ${req.path}` };
  }) as HttpTransport['request'];
  return { transport, calls: () => calls };
}

const VIEWER: Viewer = { id: 'u-membre', handle: 'membre', displayName: 'Le membre', isAnonymous: false };

async function lire(readerLanguages: readonly string[], readerLocale: string) {
  const { transport, calls } = transportSouverain();
  const host = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminConversationReading
        conversationId={CONVERSATION}
        language="fr"
        readerLanguages={readerLanguages}
        readerLocale={readerLocale}
        viewer={VIEWER}
        deps={{ source: 'gateway', transport }}
      />
    </QueryClientProvider>,
  );

  // LE MOTIF D'ABORD — la requête n'est pas armée avant.
  mounter.type(host, '[data-admin-reason]', MOTIF);
  await mounter.click(host.querySelector('[data-admin-reason-submit]') as HTMLElement | null);
  await mounter.settle();

  return { host, calls };
}

describe('le motif écrit précède la requête, et il est FIGÉ', () => {
  test('AUCUN appel ne part tant que le motif n’est pas validé', async () => {
    const { transport, calls } = transportSouverain();
    await mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <AdminConversationReading
          conversationId={CONVERSATION}
          language="fr"
          readerLanguages={['de', 'es']}
          readerLocale="de"
          viewer={VIEWER}
          deps={{ source: 'gateway', transport }}
        />
      </QueryClientProvider>,
    );
    await mounter.settle();
    expect(calls().length).toBe(0);
  });

  test('le motif VALIDÉ part en querystring, et le formulaire disparaît', async () => {
    const { host, calls } = await lire(['de', 'es'], 'de');
    expect(calls().length).toBeGreaterThan(0);
    expect(calls()[0]?.path).toContain(new URLSearchParams({ reason: MOTIF }).toString());
    // FIGÉ : il n'y a plus de champ à modifier une fois la lecture demandée.
    expect(host.querySelector('[data-admin-reason]')).toBe(null);
  });
});

describe('LA VRAIE VUE, AU PRISME DU MEMBRE', () => {
  test('sert le RANG 2 du membre — ni son rang 1 absent, ni la langue de l’administrateur', async () => {
    const { host } = await lire(['de', 'es'], 'de');
    const texte = host.textContent ?? '';

    expect(texte).toContain('Hola');
    // La langue de l'ADMINISTRATEUR : servie, ce serait le défaut que ce lot corrige.
    expect(texte).not.toContain('Bonjour');
    // L'ORIGINAL : servi, c'est la signature d'un résolveur qui ne lit que le rang 1.
    expect(texte).not.toContain('Hello');
  });

  test('LE CONTRASTE — le MÊME corpus au prisme de l’administrateur rend un AUTRE texte', async () => {
    // Sans ce second montage, le témoin ci-dessus verdirait aussi bien si le
    // composant ignorait `readerLanguages` et servait toujours l'espagnol.
    const { host } = await lire(['fr'], 'fr');
    const texte = host.textContent ?? '';

    expect(texte).toContain('Bonjour');
    expect(texte).not.toContain('Hola');
  });

  test('rend LA BULLE du produit, pas une ligne à plat — l’auteur est là', async () => {
    const { host } = await lire(['de', 'es'], 'de');
    expect(host.querySelector('[data-row="m-traduit"]')).not.toBe(null);
    expect(host.textContent ?? '').toContain('Alice');
  });

  test('DIT dans quelle langue il sert — un administrateur ne doit pas prendre une traduction pour l’original', async () => {
    const { host } = await lire(['de', 'es'], 'de');
    expect(host.querySelector('[data-admin-reading-prism]')?.textContent).toContain('de › es');
  });
});

describe('UN MESSAGE PROTÉGÉ REND SA MENTION — jamais une bulle vide', () => {
  test('la mention est PEINTE', async () => {
    const { host } = await lire(['de', 'es'], 'de');
    expect(host.textContent ?? '').toContain('Contenu retenu');
  });

  test('AUCUN voile à toucher : il n’y a rien à révéler', async () => {
    // Le contenu n'est pas masqué à l'affichage, il est ABSENT de la charge.
    // Offrir « Toucher pour révéler » découvrirait une bulle vide — le contrôle
    // sans effet que la loi 4 interdit.
    const { host } = await lire(['de', 'es'], 'de');
    expect(host.querySelector('[data-protected="hidden"]')).toBe(null);
  });

  test('le libellé LU dit la même chose que le libellé PEINT', async () => {
    const { host } = await lire(['de', 'es'], 'de');
    const rangee = host.querySelector('[data-row="m-chiffre"] [role="article"], [role="article"][aria-label]');
    const etiquettes = [...host.querySelectorAll('[role="article"]')].map((n) => n.getAttribute('aria-label') ?? '');
    expect(rangee).not.toBe(null);
    expect(etiquettes.some((label) => label.includes('Contenu retenu'))).toBe(true);
  });
});

describe('RIEN DE CE QUI EST LU NE TOUCHE LE DISQUE', () => {
  test('la lecture EST bien dans le cache sous le préfixe souverain', async () => {
    // Le point d'accroche UNIQUE de l'exclusion. Sans ce témoin, celui qui
    // suit verdirait aussi bien parce que la clé est exclue que parce
    // qu'aucune requête n'a jamais été mise en cache.
    await lire(['de', 'es'], 'de');
    const clefs = appQueryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(clefs.some((clef) => clef[0] === ADMIN_SOUVERAIN_PREFIXE)).toBe(true);
  });

  test('le contenu servi est REFUSÉ par le prédicat de déshydratation', async () => {
    const { host } = await lire(['de', 'es'], 'de');
    // Le contenu EST à l'écran — sans quoi ce témoin verdirait sur un écran vide.
    expect(host.textContent ?? '').toContain('Hola');

    /* On joue le prédicat RÉEL du socle (`persistableQuery`), pas une copie :
       une copie verdirait pendant que la règle du produit aurait changé. Et on
       passe par `dehydrate` plutôt que par `localStorage` — sous `bun test`, le
       stockage n'existe pas encore quand `query-client.ts` se charge, et le
       `try/catch` de `persist()` avale alors l'écriture : le témoin serait vert
       que la garde soit posée ou RETIRÉE. */
    const etat = JSON.stringify(dehydrate(appQueryClient, { shouldDehydrateQuery: persistableQuery }));
    expect(etat).not.toContain('Hola');
    expect(etat).not.toContain('Hello');
    expect(etat).not.toContain(ADMIN_SOUVERAIN_PREFIXE);
  });

  test('LE CONTRÔLE POSITIF — une requête ORDINAIRE, elle, est bien déshydratée', async () => {
    // Sans lui, le témoin ci-dessus verdirait aussi si `dehydrate` ne rendait
    // jamais rien : « aucun contenu souverain » et « aucun contenu du tout »
    // produisent la même chaîne.
    await lire(['de', 'es'], 'de');
    appQueryClient.setQueryData(['conversations', 'c-ordinaire'], { repere: 'Hola-ordinaire' });

    const etat = JSON.stringify(dehydrate(appQueryClient, { shouldDehydrateQuery: persistableQuery }));
    expect(etat).toContain('Hola-ordinaire');
  });
});
