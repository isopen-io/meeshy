import { COOKIE_DE_JETON, valeurDuCookie } from '@/lib/api/cookies';
import { reglePreference, supprimePourMoi, type IssueDuGeste } from '@/lib/api/preferences';
import {
  ACTIONS,
  CONFIRMATIONS,
  confirmationDuGeste,
  estUnGeste,
  FENETRE_REVERSIBLE_MS,
  type GesteDeLigne,
} from '@/lib/contenu/liste';

import { prendsLeBalayage } from './balayage';
import { observeCycleDeVie, type TransitionDeCycle } from './lifecycle';
import { prendsLePleinEcran } from './plein-ecran';
import * as L from './liste-etat';
import { CHAMPS_DU_RATTRAPAGE } from './liste-etat';
import { etatDuDocument, montreLeTrou, peins, peintre, type Peintre } from './liste-peinture';
import { doitRattraper, POLITIQUE_DE_RECONNEXION } from './reconnect-policy';
import { demandeLeDelta } from './sync/delta-client';

/**
 * LE MODULE DE PARTICIPATION DE `/chats` (conception § 12.4, § 12.10.4) — le
 * second, et le plus léger : la liste n'a ni composeur, ni réserve hors ligne,
 * ni plein écran, ni peinture de bulles. Il arrive APRÈS le premier pixel, par
 * `await import()` d'une adresse hachée, sur `main[data-participation="liste"]`.
 *
 * TOUT CE QU'IL FAIT, LE DOCUMENT LE FAIT DÉJÀ SANS LUI, plus lentement : les
 * trois gestes sont des `<form method="post">` que la porte applique et qui
 * rechargent la page (`app/connecte/liste-porte.ts`), et un rechargement remet
 * la liste à jour. Le module SUPPRIME le rechargement — amélioration
 * progressive, jamais une condition.
 *
 * CE QU'IL ÉCOUTE, ET RIEN D'AUTRE (charges lues dans les émetteurs) :
 * `authenticated`, `auth:token-expired`, `conversation:updated` (le re-tri et
 * l'aperçu — trois émetteurs, tous vers la room PERSONNELLE),
 * `conversation:unread-updated` (la pastille), `typing:start` / `typing:stop`
 * (la frappe, poussée à la room de CONVERSATION). Il n'ÉMET rien : la liste ne
 * parle pas, elle écoute — pas même un `conversation:join`, la passerelle
 * joignant toutes les rooms du lecteur à l'authentification
 * (`AuthHandler._joinUserConversations`).
 *
 * IL N'ÉCOUTE PAS `message:new`, et c'est une décision : le même envoi pousse
 * `conversation:updated`, qui porte l'aperçu DÉJÀ descendu au prisme du lecteur
 * (`resolveLastMessagePreviewPrism`). Deux sources pour une ligne feraient
 * clignoter son texte entre deux langues selon l'ordre d'arrivée.
 *
 * LE RETOUR DE FOCUS NE REFAIT PAS LA LISTE (§ 7, § 12.10). Il demande
 * `GET /sync?collections=conversations` — la collection du CADRE d'une ligne,
 * pas celle des messages — au lieu d'un `GET /conversations` complet, qui à
 * chaque bascule d'onglet serait exactement la lenteur que la directive appelle
 * un BUG.
 *
 * LE 304 TOMBE (#5015). La route calcule un ETag stable et rend 304 sur
 * `If-None-Match` (`routes/sync/index.ts:422-449`) ; `server.ts` expose
 * désormais `ETag` par CORS (`CORS_EXPOSED_HEADERS`, `config/cors-methods.ts`)
 * — `ETag` n'étant pas dans la safelist CORS, un client de NAVIGATEUR sur une
 * AUTRE ORIGINE (`https://meeshy.me` → `https://gate.meeshy.me`) ne pouvait
 * pas le lire avant ce correctif, donc jamais composer `If-None-Match`.
 *
 * `routes/sync/index.ts:446` pose toujours `Cache-Control: no-store`
 * (décision #5015 — charge PRIVÉE) : le cache HTTP du navigateur ne revalide
 * pas tout seul, mais ça ne gêne pas le `If-None-Match` EXPLICITE posé ici.
 * Ce que ce module tenait déjà SANS le 304 reste vrai en plus : la liste
 * entière n'est jamais redemandée, et le delta d'une fenêtre inchangée est
 * vide.
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
  /** L'identité du lecteur — ce qui permet d'ignorer SA propre frappe, reçue par un second onglet. */
  readonly moi: string | null;
};

const configuration = (main: HTMLElement): Configuration | null => {
  const { socket, passerelle, moi } = main.dataset;
  if (socket === undefined || passerelle === undefined) return null;
  return { socket, passerelle, moi: moi ?? null };
};

type Differe = {
  readonly ligne: string;
  readonly geste: GesteDeLigne;
  readonly sourdine: boolean;
  readonly minuterie: ReturnType<typeof setTimeout>;
};

type Contexte = {
  readonly main: HTMLElement;
  readonly config: Configuration;
  readonly jeton: string;
  readonly p: Peintre;
  etat: L.EtatDeLaListe;
  socket: Socket | null;
  enLigne: boolean;
  cache: boolean;
  /** Le watermark de `/sync` : avancé UNIQUEMENT sur une réponse 200, pour qu'un 304 reste possible. */
  checkpoint: string | null;
  validateur: string | null;
  /**
   * LE CURSEUR GLOBAL DU COMPTE (`_seq`), ANNONCÉ À CHAQUE `/sync`.
   *
   * Sans lui la passerelle ne calcule AUCUN trou — `hasGap = seq !== undefined
   * && seq < checkpointSeq - GAP_THRESHOLD` (`routes/sync/index.ts:360`) — et le
   * bandeau « Des messages manquent » de la liste était une branche morte : le
   * module l'appelait sur un booléen que le serveur ne pouvait pas lever.
   */
  seq: number | null;
  /**
   * L'instant de la CHUTE du socket, `null` tant qu'il tient. Ce que la liste
   * n'avait pas : sans lui, une coupure l'onglet À L'ÉCRAN ne déclenchait aucun
   * rattrapage, et tout ce qui s'était dit pendant l'absence était perdu.
   */
  deconnecteDepuis: number | null;
  /** Le geste dont l'envoi attend encore la fin de sa fenêtre d'annulation. */
  differe: Differe | null;
};

const applique = (ctx: Contexte, suivant: L.EtatDeLaListe): void => {
  ctx.etat = suivant;
  peins(ctx.p, suivant, Date.now());
};

/**
 * LA VOIX DE L'ÉCRAN — la même région `aria-live` que le chemin sans
 * JavaScript, servie par le document et jamais fabriquée : une région créée
 * après coup n'est annoncée par aucun lecteur d'écran.
 */
const journal = (ctx: Contexte): HTMLElement | null => ctx.main.querySelector<HTMLElement>('#journal-des-gestes');

/**
 * LE BOUTON « ANNULER » PREND LE FOCUS, ET C'EST CE QUI REND LA FENÊTRE
 * ATTEIGNABLE AUTREMENT QU'À LA SOURIS (WCAG 2.4.3).
 *
 * Le geste vient du menu de la ligne ; la ligne est ensuite CACHÉE
 * (`noeud.hidden = ligne.retiree`), donc le `<button>Archiver</button>` qui
 * tenait le focus disparaît avec elle et le focus retombe sur `<body>`. Un
 * lecteur au clavier devait alors re-tabuler depuis le haut du document en
 * moins de cinq secondes pour atteindre « Annuler » — et pour `supprimer`,
 * manquer la fenêtre, c'est franchir une porte à SENS UNIQUE côté serveur. Le
 * geste était donc RÉVERSIBLE au doigt et IRRÉVERSIBLE au clavier.
 *
 * Le focus est posé sur le bouton dès qu'il existe ; `retireLAnnulation` le
 * remet ensuite sur la ligne (quand elle revient) ou sur sa voisine (quand elle
 * part) — jamais sur `<body>`, jamais volé à qui n'y était pas.
 */
const dit = (ctx: Contexte, phrase: string, annulation: (() => void) | null): void => {
  const region = journal(ctx);
  if (region === null) return;
  region.replaceChildren();
  const quoi = document.createElement('span');
  quoi.className = 'quoi';
  quoi.textContent = phrase;
  region.append(quoi);
  if (annulation === null) return;
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'action contour';
  bouton.textContent = ACTIONS.annuler;
  bouton.addEventListener('click', annulation, { once: true });
  region.append(bouton);
  bouton.focus();
};

const tais = (ctx: Contexte): void => journal(ctx)?.replaceChildren();

/** Le contrôle par lequel un geste se lance sur une ligne — celui d'où le focus est parti. */
const menuDeLaLigne = (ctx: Contexte, ligne: string): HTMLElement | null =>
  ctx.p.liste.querySelector<HTMLElement>(`li[data-conversation="${CSS.escape(ligne)}"] summary`);

/**
 * LA LIGNE VOISINE de celle qui vient de partir — la SUIVANTE, sinon la
 * PRÉCÉDENTE : c'est là que le clavier doit reprendre quand la ligne d'où le
 * geste est parti ne revient pas.
 */
const menuVoisin = (ctx: Contexte, ligne: string): HTMLElement | null => {
  const noeuds = [...ctx.p.liste.querySelectorAll<HTMLElement>(':scope > li')];
  const rang = noeuds.findIndex((noeud) => noeud.dataset.conversation === ligne);
  if (rang === -1) return null;
  const suivante = noeuds.slice(rang + 1).find((noeud) => !noeud.hidden);
  const precedente = [...noeuds.slice(0, rang)].reverse().find((noeud) => !noeud.hidden);
  return (suivante ?? precedente)?.querySelector<HTMLElement>('summary') ?? null;
};

/**
 * LA FENÊTRE SE FERME — « Annuler » part avec elle, et le focus va où le
 * lecteur peut continuer.
 *
 * Le bouton survivait à sa fenêtre : `defais` en sortait aussitôt (le différé
 * étant soldé), donc il restait à l'écran SANS AUCUN EFFET — ce que la charte
 * interdit. Et le retirer sans rendre le focus le jetterait sur `<body>`.
 *
 * La phrase, elle, RESTE : elle est toujours vraie, et la réécrire ferait
 * annoncer deux fois la même chose au lecteur d'écran. On ne déplace le focus
 * que s'il était sur le bouton retiré : qui est parti ailleurs ne se le fait
 * pas voler.
 */
const boutonDAnnulation = (ctx: Contexte): HTMLButtonElement | null =>
  journal(ctx)?.querySelector<HTMLButtonElement>('button') ?? null;

/** Le bouton tient-il le focus ? `null === null` serait vrai : la question se pose sur un bouton EXISTANT. */
const tientLeFocus = (bouton: HTMLButtonElement | null): boolean => bouton !== null && document.activeElement === bouton;

const retireLAnnulation = (ctx: Contexte, cible: HTMLElement | null): void => {
  const bouton = boutonDAnnulation(ctx);
  if (bouton === null) return;
  const reprend = tientLeFocus(bouton);
  bouton.remove();
  if (reprend) cible?.focus();
};

const envoie = async (ctx: Contexte, { ligne, geste, sourdine }: Omit<Differe, 'minuterie'>): Promise<IssueDuGeste> => {
  const commun = { jeton: ctx.jeton, conversation: ligne, base: ctx.config.passerelle };
  if (geste === 'supprimer') return supprimePourMoi(commun);
  if (geste === 'archiver') return reglePreference({ ...commun, isArchived: true });
  return reglePreference({ ...commun, isMuted: !sourdine });
};

/**
 * LE GESTE, OPTIMISTE ET RÉVERSIBLE (§ 12.10.4) — peint d'abord, envoyé
 * ensuite, défait sur refus.
 *
 * Les deux gestes qui RETIRENT la ligne (archiver, supprimer) diffèrent leur
 * envoi de `FENETRE_REVERSIBLE_MS` : `DELETE …/delete-for-me` est une porte à
 * SENS UNIQUE côté serveur, et proposer « Annuler » après l'avoir franchie
 * promettrait une réversibilité que la passerelle ne sait pas rendre. La
 * sourdine, elle, part tout de suite : elle se défait en la rebasculant.
 */
const lance = (ctx: Contexte, ligne: string, geste: GesteDeLigne): void => {
  const avant = L.ligneDe(ctx.etat, ligne);
  if (avant === null || avant.retiree) return;
  const confirmation = confirmationDuGeste({ geste, sourdine: avant.sourdine });

  if (geste === 'sourdine') {
    applique(ctx, L.metEnSourdine(ctx.etat, ligne, !avant.sourdine));
    dit(ctx, CONFIRMATIONS[confirmation], null);
    void envoie(ctx, { ligne, geste, sourdine: avant.sourdine }).then((issue) => {
      if (issue.genre === 'fait') return;
      applique(ctx, L.metEnSourdine(ctx.etat, ligne, avant.sourdine));
      dit(ctx, ACTIONS.echec, null);
    });
    return;
  }

  vidsLeDiffere(ctx);
  const voisin = menuVoisin(ctx, ligne);
  applique(ctx, L.retire(ctx.etat, ligne));
  const minuterie = setTimeout(() => {
    ctx.differe = null;
    expedie(ctx, { ligne, geste, sourdine: avant.sourdine });
    // LA FENÊTRE EST PASSÉE : « Annuler » n'a plus d'effet, donc il n'existe
    // plus — et le clavier reprend sur la ligne voisine plutôt que sur `<body>`.
    retireLAnnulation(ctx, voisin);
  }, FENETRE_REVERSIBLE_MS);
  ctx.differe = { ligne, geste, sourdine: avant.sourdine, minuterie };
  dit(ctx, CONFIRMATIONS[confirmation], () => defais(ctx));
};

/**
 * L'ENVOI D'UN GESTE QUI RETIRE — et son RETOUR EN ARRIÈRE, au même endroit.
 *
 * Les deux appelants (la fin de la fenêtre, et le geste suivant qui solde le
 * précédent) partagent ce chemin : un refus doit remettre la ligne, quel que
 * soit ce qui a déclenché l'envoi. Écrit deux fois, le second appelant l'aurait
 * oublié — et une ligne serait restée cachée sur un refus qu'elle n'annonce pas.
 */
const expedie = (ctx: Contexte, differe: Omit<Differe, 'minuterie'>): void => {
  void envoie(ctx, differe).then((issue) => {
    if (issue.genre === 'fait') return;
    applique(ctx, L.remets(ctx.etat, differe.ligne));
    dit(ctx, ACTIONS.echec, null);
  });
};

const defais = (ctx: Contexte): void => {
  const differe = ctx.differe;
  if (differe === null) return;
  clearTimeout(differe.minuterie);
  ctx.differe = null;
  applique(ctx, L.remets(ctx.etat, differe.ligne));
  // La ligne est revenue : le focus lui revient aussi, sur le contrôle d'où le
  // geste était parti. Sans cela, annuler au clavier renvoyait sur `<body>`.
  const reprend = tientLeFocus(boutonDAnnulation(ctx));
  tais(ctx);
  if (reprend) menuDeLaLigne(ctx, differe.ligne)?.focus();
};

/**
 * UN SECOND GESTE SOLDE LE PREMIER, tout de suite : deux lignes retirées à la
 * suite ne peuvent pas partager une seule fenêtre d'annulation, et laisser la
 * première en attente ferait disparaître son bouton « Annuler » sans que le
 * lecteur ait rien décidé.
 */
const vidsLeDiffere = (ctx: Contexte): void => {
  const differe = ctx.differe;
  if (differe === null) return;
  clearTimeout(differe.minuterie);
  ctx.differe = null;
  expedie(ctx, differe);
};

/** Le départ de la page expédie ce qui attendait : la fenêtre d'annulation n'y survit pas. */
const solde = (ctx: Contexte): void => vidsLeDiffere(ctx);

const prendsLesGestes = (ctx: Contexte): void => {
  // LE MENU (clavier, lecteur d'écran, souris) : son `<form>` est INTERCEPTÉ,
  // jamais remplacé. Sans JavaScript il poste et recharge ; avec, il peint. Un
  // second chemin d'action aurait pu diverger du premier au premier correctif.
  ctx.p.liste.addEventListener('submit', (evenement) => {
    const formulaire = (evenement.target as HTMLElement | null)?.closest<HTMLFormElement>('form');
    if (formulaire === null || formulaire === undefined) return;
    const ligne = formulaire.closest<HTMLElement>('li[data-conversation]')?.dataset.conversation ?? '';
    const soumetteur = (evenement as SubmitEvent).submitter as HTMLButtonElement | null;
    const geste = soumetteur?.value ?? '';
    if (ligne === '' || !estUnGeste(geste)) return;
    evenement.preventDefault();
    formulaire.closest<HTMLDetailsElement>('details.actions')?.removeAttribute('open');
    lance(ctx, ligne, geste);
  });

  prendsLeBalayage({
    liste: ctx.p.liste,
    sur: ({ ligne, geste }) => {
      const id = ligne.dataset.conversation ?? '';
      if (id !== '') lance(ctx, id, geste);
    },
  });
};

/**
 * LE RATTRAPAGE AU RETOUR — `GET /sync?collections=conversations`, avec son
 * validateur.
 *
 * Ce que la collection SERT (`syncConversationSelect`) est le CADRE d'une ligne :
 * `lastMessageAt`, `title`, `memberCount`. Elle ne porte ni l'aperçu du dernier
 * message ni le compte de non-lus, et le module ne les invente donc pas : il
 * corrige le RANG, ce qui est exactement ce qu'un retour d'absence doit
 * corriger. Le contenu, lui, revient par les événements ou par le prochain
 * chargement.
 *
 * `hasGap` (§ 7) dit que l'absence dépasse ce que la passerelle sait rejouer :
 * la liste le DIT et offre le rechargement, plutôt que de faire semblant. Il
 * n'est calculé QUE si le client annonce son `seq` (`routes/sync/index.ts:360`)
 * — le module le retient donc et le renvoie, faute de quoi le bandeau était une
 * promesse que le serveur ne pouvait pas tenir.
 */
const rattrape = async (ctx: Contexte): Promise<void> => {
  const depuis = ctx.checkpoint ?? dernierInstantServi(ctx.etat);
  if (depuis === null) return;
  const issue = await demandeLeDelta({
    base: ctx.config.passerelle,
    depuis,
    collections: ['conversations'],
    // SES champs, et rien d'autre (#5088) : le rattrapage corrige le RANG, et
    // la passerelle rétrécit sa requête autant que sa réponse (#4173).
    fields: CHAMPS_DU_RATTRAPAGE,
    // LE CURSEUR PART AVEC LA DEMANDE : c'est la condition pour que la
    // passerelle puisse répondre `hasGap` (`routes/sync/index.ts:360`).
    seq: ctx.seq,
    validateur: ctx.validateur,
    entetes: { authorization: `Bearer ${ctx.jeton}` },
  });
  if (issue.genre !== 'delta') return;

  const { delta } = issue;
  ctx.validateur = issue.validateur;
  ctx.checkpoint = delta.checkpoint;
  if (delta.checkpointSeq !== null) ctx.seq = Math.max(ctx.seq ?? 0, delta.checkpointSeq);
  applique(
    ctx,
    delta.conversations.reduce<L.EtatDeLaListe>((etat, brut) => {
      const id = typeof brut.id === 'string' ? brut.id : null;
      const quand = typeof brut.lastMessageAt === 'string' ? brut.lastMessageAt : null;
      return id === null ? etat : L.bouge(etat, { id, quand, apercu: null, apercuTraductions: null, apercuLangueOriginale: null }, ctx.p.langues);
    }, ctx.etat),
  );
  if (delta.hasGap) montreLeTrou(ctx.p);
};

/** Le plus récent instant SERVI — le point de départ du premier `/sync`, faute de checkpoint. */
const dernierInstantServi = (etat: L.EtatDeLaListe): string | null =>
  etat.lignes.reduce<string | null>((plusRecent, ligne) => {
    if (ligne.quand === null) return plusRecent;
    if (plusRecent === null) return ligne.quand;
    return Date.parse(ligne.quand) > Date.parse(plusRecent) ? ligne.quand : plusRecent;
  }, null);

const branche = (ctx: Contexte, socket: Socket): void => {
  /**
   * LA CHUTE ET LE RETOUR — la moitié que la liste n'avait pas.
   *
   * Socket.IO ne rejoue rien : une coupure de deux minutes l'onglet À L'ÉCRAN
   * perdait DÉFINITIVEMENT chaque `conversation:updated` et chaque
   * `conversation:unread-updated` de la fenêtre — rang faux, pastilles fausses,
   * aperçus périmés — jusqu'à un masquage/re-affichage ou un rechargement. Le
   * seul déclencheur de rattrapage était le retour de VISIBILITÉ, c'est-à-dire
   * précisément l'événement qui ne vient pas quand on reste sur l'écran.
   *
   * `authenticated` est le point de reprise : la passerelle le ré-émet à chaque
   * ré-authentification (`AuthHandler.handleTokenAuthentication`), et c'est
   * aussi là qu'elle a re-joint les rooms du lecteur
   * (`_joinUserConversations`) — donc l'instant exact où ce qui a été manqué
   * cesse d'arriver tout seul. Le seuil est celui du fil, et il n'a qu'un site.
   */
  socket.on('disconnect', () => {
    if (ctx.deconnecteDepuis === null) ctx.deconnecteDepuis = Date.now();
  });
  socket.on('authenticated', () => {
    const rattraper = doitRattraper({ deconnecteDepuis: ctx.deconnecteDepuis, maintenant: Date.now() });
    ctx.deconnecteDepuis = null;
    if (rattraper) void rattrape(ctx);
  });

  socket.on('conversation:updated', (charge: unknown) => {
    const maj = L.miseAJourDe(charge);
    if (maj !== null) applique(ctx, L.bouge(ctx.etat, maj, ctx.p.langues));
  });
  socket.on('conversation:unread-updated', (charge: unknown) => {
    const comptes = L.comptesDe(charge);
    if (comptes !== null) applique(ctx, L.compte(ctx.etat, comptes));
  });
  const surFrappe = (actif: boolean) => (charge: unknown) => {
    const frappeur = L.frappeurDe(charge);
    // MA propre frappe ne s'annonce pas sur MA liste : l'événement ne m'est pas
    // renvoyé (`socket.to(room)`), mais un second onglet du même compte, lui,
    // le reçoit.
    const brut = charge as { readonly userId?: unknown } | null;
    if (frappeur === null || (ctx.config.moi !== null && brut?.userId === ctx.config.moi)) return;
    applique(ctx, L.frappe(ctx.etat, frappeur, actif));
  };
  socket.on('typing:start', surFrappe(true));
  socket.on('typing:stop', surFrappe(false));
  socket.on('auth:token-expired', () => {
    // La liste ne peut plus rien apprendre : le socket est coupé, et le
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
    void rattrape(ctx);
    // L'heure RELATIVE de chaque ligne a vieilli pendant l'absence : la
    // repeindre est gratuit et évite un « il y a 2 min » vieux d'une heure.
    peins(ctx.p, ctx.etat, Date.now());
    return;
  }
  if (transition.type === 'destruction') {
    solde(ctx);
    ctx.socket?.disconnect();
  }
};

const demarre = async (): Promise<void> => {
  // TOUTE SURIMPRESSION SERVIE EST ÉLEVÉE EN MODALE, AVANT TOUT LE RESTE.
  //
  // `/chats` en sert DEUX — le profil d'un participant (`?profil=`, § 12.10.3)
  // et la feuille « nouvelle conversation » (`?nouvelle`, #5072) — et n'en
  // élevait AUCUNE : ce module ne l'appelait pas, seul celui du fil le faisait.
  // Les deux doc-comments l'annonçaient pourtant, et le témoin navigateur de la
  // feuille l'a démenti (Échap ne fermait rien). Une capacité annoncée par deux
  // sites et appliquée par zéro.
  //
  // ELLE COURT AVANT LES QUATRE REPLIS CI-DESSOUS, et c'est délibéré : une
  // surimpression doit se fermer à Échap même sur une liste dont la
  // configuration manque ou dont le jeton a disparu. Ce que ces replis
  // protègent, c'est le temps réel — jamais le clavier.
  prendsLePleinEcran();

  const main = document.querySelector<HTMLElement>('main[data-participation="liste"]');
  if (main === null) return;
  const config = configuration(main);
  if (config === null) return;
  const jeton = valeurDuCookie(document.cookie, COOKIE_DE_JETON);
  if (jeton === null) return;
  const p = peintre(main, document.documentElement.lang);
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
    checkpoint: null,
    validateur: null,
    seq: null,
    deconnecteDepuis: null,
    differe: null,
  };

  // Les heures relatives sont recalculées AVANT toute connexion : le document a
  // pu attendre dans le cache du navigateur, et « à l'instant » y aurait vieilli.
  peins(p, ctx.etat, Date.now());
  prendsLesGestes(ctx);

  observeCycleDeVie({ cleDuJeton: 'meeshy-liste', sur: surTransition(ctx) });

  await connecte(ctx);
};

void demarre();
