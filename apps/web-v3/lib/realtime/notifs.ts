import { COOKIE_DE_JETON, valeurDuCookie } from '@/lib/api/cookies';
import { boiteDuLecteur, notificationServie, toutMarquerLu } from '@/lib/api/notifications';
import { NOTIFS } from '@/lib/contenu/notifs';

import { observeCycleDeVie, type TransitionDeCycle } from './lifecycle';
import * as N from './notifs-etat';
import { etatDuDocument, peins, peintre, type PeintreDesNotifs } from './notifs-peinture';
import { doitRattraper, POLITIQUE_DE_RECONNEXION } from './reconnect-policy';

/**
 * LE MODULE DE PARTICIPATION DE `/notifications` (issue #4898) — le quatrième,
 * et le plus simple : pas de composeur, pas de réserve, pas de gestes de
 * ligne. Il arrive APRÈS le premier pixel, par `await import()` d'une adresse
 * hachée, sur `main[data-participation="notifs"]`.
 *
 * TOUT CE QU'IL FAIT, LE DOCUMENT LE FAIT DÉJÀ SANS LUI, plus lentement :
 * « Tout lire » est un `<form method="post">` que la porte applique en
 * Post/Redirect/Get, et un rechargement remet la boîte à jour. Le module
 * SUPPRIME le rechargement — amélioration progressive, jamais une condition.
 *
 * CE QU'IL ÉCOUTE, ET RIEN D'AUTRE (charges lues dans les émetteurs, toutes
 * poussées vers la room PERSONNELLE que la passerelle joint à
 * l'authentification) : `notification:new` (`NotificationService:1650`, la
 * forme `{...formatted}` que `notificationServie` projette), `notification:read`
 * (`markAsRead`, `{ notificationId }`), `notification:read-bulk`
 * (`announceReadBulk`, `{ scope }` — le prédicat partagé de `@meeshy/shared`
 * se rejoue sur le document, jamais un refetch), `notification:counts`
 * (`emitCountsUpdate`, `{ unread, total }` — autoritatif). Il n'ÉMET rien.
 *
 * LE RATTRAPAGE N'A PAS DE DELTA : `GET /sync` ne sert aucune collection
 * `notifications` (`routes/sync/budget.ts`). Après une absence qui dépasse le
 * seuil (`doitRattraper`, le même que le fil et la liste), le module refait UNE
 * lecture de la boîte — trente lignes, le prix d'un chargement d'écran — et la
 * peint en place. Jamais de sondage : le seul déclencheur est le retour du
 * socket.
 */

type Ecouteur = (...arguments_: unknown[]) => void;

type Socket = {
  readonly connected: boolean;
  connect(): unknown;
  disconnect(): unknown;
  on(evenement: string, ecouteur: Ecouteur): unknown;
};

type ModuleSocket = { readonly io: (url: string, options: Readonly<Record<string, unknown>>) => Socket };

type Configuration = {
  readonly socket: string;
  readonly passerelle: string;
};

const configuration = (main: HTMLElement): Configuration | null => {
  const { socket, passerelle } = main.dataset;
  if (socket === undefined || passerelle === undefined) return null;
  return { socket, passerelle };
};

type Contexte = {
  readonly main: HTMLElement;
  readonly config: Configuration;
  readonly jeton: string;
  readonly p: PeintreDesNotifs;
  etat: N.EtatDesNotifs;
  socket: Socket | null;
  enLigne: boolean;
  cache: boolean;
  /** L'instant de la CHUTE du socket, `null` tant qu'il tient — le seuil de rattrapage se mesure dessus. */
  deconnecteDepuis: number | null;
};

const applique = (ctx: Contexte, suivant: N.EtatDesNotifs): void => {
  ctx.etat = suivant;
  peins(ctx.p, suivant, Date.now());
};

/**
 * LA VOIX DE L'ÉCRAN — la région `role="status"` que le document SERT (une
 * région créée après coup n'est annoncée par aucun lecteur d'écran). Le module
 * y dit l'action optimiste et son éventuel refus, comme le POST y dit la
 * sienne au rechargement.
 */
const dis = (ctx: Contexte, phrase: string): void => {
  const region = ctx.p.avis;
  if (region === null) return;
  region.textContent = phrase;
  region.hidden = false;
};

/**
 * « TOUT LIRE », OPTIMISTE — peint d'abord, envoyé ensuite, DÉFAIT sur refus.
 *
 * Le `<form>` est INTERCEPTÉ, jamais remplacé : sans JavaScript il poste et
 * recharge, avec il peint. Le compteur passe à zéro tout de suite — c'est le
 * geste du LECTEUR, « tout » veut dire tout ce qu'il voit et le reste aussi —
 * puis `notification:counts`, émis par la passerelle après le marquage,
 * confirme. Un refus remet l'état d'avant et le DIT : des non-lues intactes
 * sont la vérité, un « tout est lu » que rien n'a fait serait pire.
 */
const prendsLeGeste = (ctx: Contexte): void => {
  ctx.p.formulaire?.addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    const avant = ctx.etat;
    applique(ctx, N.compte(N.litEnMasse(ctx.etat, { kind: 'all' }), 0));
    dis(ctx, NOTIFS.toutLuFait);
    void toutMarquerLu({ jeton: ctx.jeton, base: ctx.config.passerelle }).then((issue) => {
      if (issue === 'faite') return;
      applique(ctx, avant);
      dis(ctx, NOTIFS.echec);
    });
  });
};

/**
 * LE RATTRAPAGE — une lecture de la boîte, entière, peinte en place. Les
 * lignes déjà servies gardent leur nœud (la peinture réconcilie par
 * `data-id`) ; les manquées naissent du gabarit.
 */
const rattrape = async (ctx: Contexte): Promise<void> => {
  const boite = await boiteDuLecteur({ jeton: ctx.jeton, base: ctx.config.passerelle });
  if (boite.genre !== 'liste') return;
  applique(ctx, {
    lignes: boite.notifications.map(N.ligneDeNotification),
    nonLues: boite.nonLues,
  });
};

const branche = (ctx: Contexte, socket: Socket): void => {
  socket.on('disconnect', () => {
    if (ctx.deconnecteDepuis === null) ctx.deconnecteDepuis = Date.now();
  });
  socket.on('authenticated', () => {
    const rattraper = doitRattraper({ deconnecteDepuis: ctx.deconnecteDepuis, maintenant: Date.now() });
    ctx.deconnecteDepuis = null;
    if (rattraper) void rattrape(ctx);
  });

  socket.on('notification:new', (charge: unknown) => {
    const notif = notificationServie(charge);
    if (notif !== null) applique(ctx, N.arrive(ctx.etat, N.ligneDeNotification(notif)));
  });
  socket.on('notification:read', (charge: unknown) => {
    const id = N.chargeDeLue(charge);
    if (id !== null) applique(ctx, N.lit(ctx.etat, id));
  });
  socket.on('notification:read-bulk', (charge: unknown) => {
    const scope = N.chargeDeLueEnMasse(charge);
    if (scope !== null) applique(ctx, N.litEnMasse(ctx.etat, scope));
  });
  socket.on('notification:counts', (charge: unknown) => {
    const unread = N.chargeDeComptes(charge);
    if (unread !== null) applique(ctx, N.compte(ctx.etat, unread));
  });
  socket.on('auth:token-expired', () => {
    // L'écran ne peut plus rien apprendre : le socket est coupé, et le
    // rechargement — que la porte redirigera vers `/login` — est le seul geste
    // honnête. On ne le FORCE pas : ce que le lecteur a sous les yeux reste lu.
    ctx.socket?.disconnect();
  });
};

const connecte = async (ctx: Contexte): Promise<void> => {
  const client = (await import(/* webpackIgnore: true */ ctx.config.socket).catch(() => null)) as ModuleSocket | null;
  if (client === null) return;
  const socket = client.io(ctx.config.passerelle, {
    ...POLITIQUE_DE_RECONNEXION,
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    autoConnect: false,
    auth: { token: ctx.jeton },
  });
  ctx.socket = socket;
  branche(ctx, socket);
  if (!ctx.cache && ctx.enLigne) socket.connect();
};

/** Voir `participate.ts` : `connect()` seul ne fait rien tant qu'une reconnexion est armée. */
const reconnecteSansAttendre = (socket: Socket): void => {
  socket.disconnect();
  socket.connect();
};

const surTransition = (ctx: Contexte) => (transition: TransitionDeCycle): void => {
  if (transition.type === 'masquage') {
    ctx.cache = true;
    ctx.socket?.disconnect();
    return;
  }
  if (transition.type === 'perte-du-reseau') {
    ctx.enLigne = false;
    return;
  }
  if (transition.type === 'reprise') {
    ctx.cache = false;
    ctx.enLigne = true;
    if (ctx.socket !== null && !ctx.socket.connected) reconnecteSansAttendre(ctx.socket);
    // L'heure RELATIVE de chaque ligne a vieilli pendant l'absence ; le
    // rattrapage, lui, attend `authenticated` — c'est le retour du SOCKET qui
    // dit ce qui a été manqué, pas celui de la visibilité.
    peins(ctx.p, ctx.etat, Date.now());
    return;
  }
  if (transition.type === 'destruction') {
    ctx.socket?.disconnect();
  }
};

const demarre = async (): Promise<void> => {
  const main = document.querySelector<HTMLElement>('main[data-participation="notifs"]');
  if (main === null) return;
  const config = configuration(main);
  if (config === null) return;
  const jeton = valeurDuCookie(document.cookie, COOKIE_DE_JETON);
  if (jeton === null) return;
  const p = peintre(main);
  if (p === null) return;

  const ctx: Contexte = {
    main,
    config,
    jeton,
    p,
    etat: etatDuDocument(p),
    socket: null,
    enLigne: true,
    cache: false,
    deconnecteDepuis: null,
  };

  // Les heures relatives sont recalculées AVANT toute connexion : le document a
  // pu attendre dans le cache du navigateur, et « à l'instant » y aurait vieilli.
  peins(p, ctx.etat, Date.now());
  prendsLeGeste(ctx);

  observeCycleDeVie({ cleDuJeton: 'meeshy-notifs', sur: surTransition(ctx) });

  await connecte(ctx);
};

void demarre();
