import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * LE SERVICE WORKER QUI REÇOIT LE PUSH (#7305).
 *
 * `public/sw-push.js` est un script CLASSIQUE, chargé par `importScripts` en
 * tête du worker généré (`SERVICE_WORKER_SCRIPTS`, `vite.config.ts`). Il ne
 * peut donc rien importer de `src/` — ni `resolveTarget`, ni `href`, ni les
 * constantes de `lib/discover/view`. Sa table de destinations vit en DOUBLE,
 * et c'est `scripts/check-push-target-parity.mjs` qui interdit la dérive,
 * pas la discipline : `firebase-messaging-sw.js` s'était donné la bonne règle
 * en commentaire et avait quand même dérivé sur trois routes sur trois.
 *
 * Ce témoin, lui, mesure le COMPORTEMENT : il monte le script dans un `self`
 * bouchonné, capture ses écouteurs, et les fait décider.
 *
 * **Ce qu'il garde surtout, ce sont les deux règles négatives** — D-11 (jamais
 * deux bannières pour un même événement) et le cycle 125 (une protection de
 * contenu se mesure sur tout ce que la charge TRANSPORTE, pas sur sa seule
 * chaîne). Le worker AFFICHE ce que le serveur a composé ; il ne re-résout
 * aucun Prisme et ne rend aucune URL venue de la charge.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, '../../../public/sw-push.js'), 'utf8');

/** Le CODE seul : un doc-comment qui NOMME un champ interdit le documente, il ne le lit pas. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

type Listener = (event: ExtendableEventLike) => void;

type ExtendableEventLike = {
  readonly data?: { json(): unknown };
  readonly notification?: NotificationLike;
  waitUntil(promise: Promise<unknown>): void;
};

type NotificationLike = {
  readonly data: Record<string, unknown>;
  close(): void;
};

type ShownNotification = { readonly title: string; readonly options: Record<string, unknown> };

type ClientStub = {
  readonly visibilityState: string;
  readonly url: string;
  focused: boolean;
  readonly messages: unknown[];
  focus(): Promise<void>;
  postMessage(message: unknown): void;
};

type WorkerHarness = {
  readonly listeners: Map<string, Listener>;
  readonly shown: ShownNotification[];
  readonly opened: string[];
  readonly badges: number[];
  readonly clients: ClientStub[];
  readonly exports: {
    readonly PUSH_ROUTE_PATTERNS: Readonly<Record<string, string>>;
    readonly pushTargetUrl: (data: Record<string, unknown>) => string;
  };
  dispatch(type: string, event: Omit<ExtendableEventLike, 'waitUntil'>): Promise<void>;
};

const windowClient = (visibilityState: string, url = 'https://meeshy.me/'): ClientStub => {
  const client: ClientStub = {
    visibilityState,
    url,
    focused: false,
    messages: [],
    focus: async () => {
      client.focused = true;
    },
    postMessage: (message) => void client.messages.push(message),
  };
  return client;
};

function mount({ clients = [] as ClientStub[], already = [] as Record<string, unknown>[] } = {}): WorkerHarness {
  const listeners = new Map<string, Listener>();
  const shown: ShownNotification[] = [];
  const opened: string[] = [];
  const badges: number[] = [];
  const existing = already.map((data) => ({ data }));

  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    clients: {
      matchAll: async () => clients,
      openWindow: async (url: string) => {
        opened.push(url);
        return null;
      },
    },
    registration: {
      getNotifications: async () => existing,
      showNotification: async (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
      },
    },
    navigator: {
      setAppBadge: async (count: number) => {
        badges.push(count);
      },
    },
  } as Record<string, unknown>;

  new Function('self', SOURCE)(self);

  const pending: Promise<unknown>[] = [];
  return {
    listeners,
    shown,
    opened,
    badges,
    clients,
    exports: self['meeshyPushTarget'] as WorkerHarness['exports'],
    async dispatch(type, event) {
      const listener = listeners.get(type);
      if (listener === undefined) throw new Error(`aucun écouteur « ${type} »`);
      listener({ ...event, waitUntil: (promise) => void pending.push(promise) });
      await Promise.all(pending.splice(0));
    },
  };
}

const push = (payload: unknown): Omit<ExtendableEventLike, 'waitUntil'> => ({ data: { json: () => payload } });

const banner = (data: Record<string, unknown>) => ({ notification: { title: 'Awa', body: 'Bonjour' }, data });

describe('le worker n’affiche une bannière que si personne ne regarde (D-11)', () => {
  test('aucun client ouvert : la bannière système s’affiche', async () => {
    const worker = mount();
    await worker.dispatch('push', push(banner({ notificationId: 'n1', conversationId: 'abc' })));
    expect(worker.shown.map((n) => [n.title, n.options['body']])).toEqual([['Awa', 'Bonjour']]);
  });

  test('un onglet VISIBLE : aucune bannière système — le socket porte la bannière in-app', async () => {
    const worker = mount({ clients: [windowClient('visible')] });
    await worker.dispatch('push', push(banner({ notificationId: 'n1', conversationId: 'abc' })));
    expect(worker.shown).toEqual([]);
  });

  test('un onglet ouvert mais CACHÉ ne retient rien — personne ne voit la bannière in-app', async () => {
    const worker = mount({ clients: [windowClient('hidden')] });
    await worker.dispatch('push', push(banner({ notificationId: 'n1', conversationId: 'abc' })));
    expect(worker.shown.length).toBe(1);
  });

  test('la même notification déjà affichée n’est pas affichée deux fois', async () => {
    const worker = mount({ already: [{ notificationId: 'n1' }] });
    await worker.dispatch('push', push(banner({ notificationId: 'n1', conversationId: 'abc' })));
    expect(worker.shown).toEqual([]);
  });

  test('une AUTRE notification passe — le dédoublonnage ne bâillonne pas le fil', async () => {
    const worker = mount({ already: [{ notificationId: 'n0' }] });
    await worker.dispatch('push', push(banner({ notificationId: 'n1', conversationId: 'abc' })));
    expect(worker.shown.length).toBe(1);
  });

  test('la conversation REGROUPE les bannières ; à défaut, la notification', async () => {
    const worker = mount();
    await worker.dispatch('push', push(banner({ notificationId: 'n1', conversationId: 'abc' })));
    const solo = mount();
    await solo.dispatch('push', push(banner({ notificationId: 'n2' })));
    expect([worker.shown[0]?.options['tag'], solo.shown[0]?.options['tag']]).toEqual(['abc', 'n2']);
  });
});

describe('le worker AFFICHE ce que le serveur a composé — il ne re-résout rien', () => {
  test('une charge sans titre ni corps n’affiche rien plutôt qu’un libellé inventé', async () => {
    const worker = mount();
    await worker.dispatch('push', push({ data: { notificationId: 'n1', conversationId: 'abc' } }));
    expect(worker.shown).toEqual([]);
  });

  /* Le corps est descendu dans le Prisme du LECTEUR côté serveur
     (`NotificationService.servedBannerBody`). `translatedContent`, `content`,
     `originalLanguage` et `encryptedContent` sont des champs de SERVICE
     destinés à l'extension iOS : une seconde descente servirait, pour un même
     message, un texte différent de celui qu'iOS montre. */
  test('aucun champ de service du Prisme n’est lu par le worker', () => {
    for (const forbidden of ['translatedContent', 'translatedLanguage', 'originalLanguage', 'encryptedContent']) {
      expect({ forbidden, present: CODE.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
  });

  /* Cycle 125 — une protection de contenu se mesure sur tout ce que la charge
     TRANSPORTE. `notificationLocKey` DÉCLARE un contenu protégé (éphémère,
     vue unique, flouté, chiffré). Le worker ne rend AUCUNE URL venue de la
     charge : ni pièce jointe, ni avatar — l'icône est un actif statique de
     l'application. Une photo à vue unique sur un écran verrouillé est le
     défaut exact que ce dépôt a corrigé au prix fort. */
  test('la bannière ne rend aucune URL venue de la charge', async () => {
    const worker = mount();
    await worker.dispatch(
      'push',
      push({
        notification: { title: 'Awa', body: '👁️ 🖼️' },
        data: {
          notificationId: 'n1',
          conversationId: 'abc',
          notificationLocKey: 'notification.viewOnce',
          attachmentUrl: 'https://gate.meeshy.me/secret.png',
          senderAvatar: 'https://gate.meeshy.me/avatar.png',
          imageURL: 'https://gate.meeshy.me/avatar.png',
        },
      }),
    );
    const rendu = JSON.stringify(worker.shown[0]?.options ?? {});
    expect({ secret: rendu.includes('secret.png'), avatar: rendu.includes('avatar.png') }).toEqual({
      secret: false,
      avatar: false,
    });
  });

  test('la bannière ne garde de la charge que ce qui ROUTE le tap', async () => {
    const worker = mount();
    await worker.dispatch(
      'push',
      push({
        notification: { title: 'Awa', body: 'Bonjour' },
        data: { notificationId: 'n1', conversationId: 'abc', attachmentUrl: 'https://gate.meeshy.me/secret.png', senderDisplayName: 'Awa' },
      }),
    );
    expect(worker.shown[0]?.options['data']).toEqual({ notificationId: 'n1', conversationId: 'abc' });
  });

  test('`unreadCount` pose le badge de l’application', async () => {
    const worker = mount({ clients: [windowClient('visible')] });
    await worker.dispatch('push', push(banner({ notificationId: 'n1', conversationId: 'abc', unreadCount: '7' })));
    expect(worker.badges).toEqual([7]);
  });

  test('un `unreadCount` absent ou illisible ne pose aucun badge', async () => {
    const worker = mount();
    await worker.dispatch('push', push(banner({ notificationId: 'n1', unreadCount: 'beaucoup' })));
    await worker.dispatch('push', push(banner({ notificationId: 'n2' })));
    expect(worker.badges).toEqual([]);
  });
});

describe('le tap atterrit à l’adresse de la v2, jamais à celle du legacy', () => {
  const clic = (data: Record<string, unknown>) => {
    const closed: boolean[] = [];
    return {
      closed,
      event: { notification: { data, close: () => closed.push(true) } },
    };
  };

  test('une conversation ouvre `/c/<id>` — l’adresse du legacy `/conversations/<id>` n’existe plus', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', clic({ notificationId: 'n1', conversationId: 'abc' }).event);
    expect(worker.opened).toEqual(['/c/abc']);
  });

  test('la bannière se ferme au tap', async () => {
    const worker = mount();
    const { closed, event } = clic({ notificationId: 'n1', conversationId: 'abc' });
    await worker.dispatch('notificationclick', event);
    expect(closed).toEqual([true]);
  });

  test('un client déjà ouvert est FOCALISÉ et reçoit l’adresse, plutôt qu’un second onglet', async () => {
    const ouvert = windowClient('hidden');
    const worker = mount({ clients: [ouvert] });
    await worker.dispatch('notificationclick', clic({ notificationId: 'n1', conversationId: 'abc' }).event);
    expect({ opened: worker.opened, focused: ouvert.focused, messages: ouvert.messages }).toEqual({
      opened: [],
      focused: true,
      messages: [{ type: 'NOTIFICATION_CLICKED', url: '/c/abc', data: { notificationId: 'n1', conversationId: 'abc' } }],
    });
  });

  test('une story ouvre son lecteur, un réel le détail de la publication', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', clic({ postId: 'p1', postType: 'STORY' }).event);
    await worker.dispatch('notificationclick', clic({ postId: 'p1', postType: 'REEL' }).event);
    expect(worker.opened).toEqual(['/story/p1', '/post/p1']);
  });

  test('une demande d’ami ouvre l’onglet « Demandes » de la découverte, filtre compris', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', clic({ type: 'friend_request', friendRequestId: 'fr1' }).event);
    expect(worker.opened).toEqual(['/discover?onglet=requests&demandes=received']);
  });

  test('sans destination, le tap ouvre la liste des notifications — il atterrit toujours', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', clic({ type: 'un_type_sans_ecran' }).event);
    expect(worker.opened).toEqual(['/notifications']);
  });

  test('la table exposée au gate porte les motifs de la table de routes', () => {
    expect(mount().exports.PUSH_ROUTE_PATTERNS).toEqual({
      thread: '/c/$conversation',
      story: '/story/$post',
      post: '/post/$post',
      discover: '/discover',
      progression: '/me/progression',
      settings: '/settings',
      notifications: '/notifications',
    });
  });
});
