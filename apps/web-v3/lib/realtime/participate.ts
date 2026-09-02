import { COOKIE_DE_JETON, valeurDuCookie } from '@/lib/api/cookies';
import {
  aAccuser,
  accuseLecture,
  entetesDeCreance,
  LONGUEUR_MAX_DU_MESSAGE,
  messages as messagesServis,
  reagis,
  televerse,
  type Creance,
  type PieceJointe,
} from '@/lib/api/fil';
import { cleDeLien, cleDuLien, effaceLaPlace, jetonDuCookie, poseSession, type CleDeLien } from '@/lib/api/guest-session';
import { rafraichis, raisonDeFermeture, type Droits } from '@/lib/api/invite';
import { BANDEAUX, FIL } from '@/lib/contenu/fil';

import { prendsLeComposeur, type ControleurDuComposeur } from './composeur';
import { defilement, type Defilement } from './defilement';
import { droitsDuChangement, oublieLaJonctionFraiche, peinsLesDroits, peinsLeTrombone } from './droits-peinture';
import * as F from './fil-etat';
import {
  bullesDuDocument,
  choisisUneReaction,
  peins,
  peintre,
  recale,
  recaleLesHeures,
  retireLesControlesDeReaction,
  type Peintre,
} from './fil-peinture';
import { observeCycleDeVie, type TransitionDeCycle } from './lifecycle';
import {
  PERIODE_DU_BATTEMENT_MS,
  POLITIQUE_DE_RECONNEXION,
  SEUIL_DE_RATTRAPAGE_MS,
} from './reconnect-policy';
import { clesDeLaReserve, purgeLesAutres, reserve, type Reserve } from './reserve';
import { litLeDelta, urlDeSync } from './sync/delta-client';

/**
 * LE MODULE DE PARTICIPATION (conception § 12.4) — le seul JavaScript
 * applicatif d'un écran de la v3, et il n'arrive qu'APRÈS le premier pixel,
 * par `await import()`, sur une surface de participation (`<main
 * data-participation="fil">`). Tout ce qu'il fait, le document servi le fait
 * déjà sans lui, plus lentement : il AMÉLIORE, il ne conditionne rien.
 *
 * UN client socket.io vers le namespace PAR DÉFAUT (la passerelle n'en déclare
 * aucun autre, § 5.3), authentifié comme `AuthHandler.handleTokenAuthentication`
 * l'attend : `auth.token` porte le jeton du membre, `auth.sessionToken` la
 * session de l'invité (`socket-helpers.ts:55-72`). Les deux sont lus dans les
 * cookies que le serveur a posés — `meeshy_auth`, et le cookie de la place
 * invitée que `lib/api/guest-session.ts` seul nomme —, et
 * c'est pourquoi ils ne sont pas `HttpOnly`.
 *
 * L'AUTHENTIFICATION EST ASYNCHRONE côté passerelle : `MeeshySocketIOManager.ts:
 * 1740` lance `handleTokenAuthentication(socket)` SANS l'attendre, et un
 * `conversation:join` émis dès `connect` arrive avant que `connectedUsers`
 * ne connaisse le socket — `conversation:join-error { reason:
 * 'not_authenticated' }` (`ConversationHandler.ts:129-134`). La room se rejoint
 * donc sur `authenticated` (`AuthHandler.ts:281`), jamais sur `connect`.
 *
 * Ce que ce module ÉCOUTE, et rien d'autre (`packages/shared/types/
 * socketio-events/event-names.ts`, charges lues dans les émetteurs) :
 * `authenticated`, `auth:token-expired`, `conversation:joined`,
 * `conversation:join-error`, `message:new`, `message:translation`,
 * `message:edited`, `message:deleted`, `reaction:added`, `reaction:removed`,
 * `typing:start`, `typing:stop`, `read-status:updated`,
 * `audio:transcription-ready`, `audio:translation-ready`,
 * `participant:rights-updated`, `user:status`, `presence:snapshot`. Ce qu'il
 * ÉMET : `conversation:join`,
 * `conversation:leave`, `message:send`, `typing:start`, `typing:stop`,
 * `reaction:add`, `reaction:remove`.
 *
 * QUAND il parle est décidé par `lib/realtime/lifecycle.ts`, le site unique
 * du cycle de vie : un onglet caché coupe son socket et n'émet RIEN ; une
 * reprise reconnecte, bat (invité) puis rattrape par `GET /sync` si l'absence
 * a dépassé le seuil (§ 7). Une erreur réseau n'efface JAMAIS un jeton ; un
 * 401 de battement se CONTRÔLE, puis peint un bandeau à BOUTON — jamais une
 * re-jonction silencieuse (§ 6.3 état F).
 *
 * LA PLACE INVITÉE A DEUX PROJECTIONS (§ 12.3) : le cookie, que le serveur
 * lit, et le stockage `meeshy.guest.<lien>`, que les AUTRES onglets écoutent.
 * Le serveur ne peut poser que le cookie : ce module POSE la projection de
 * stockage à son démarrage (`poseSession`), et l'état F l'EFFACE sur les deux
 * supports (`effaceLaPlace`) — l'événement `storage` qui en résulte ferme
 * l'onglet voisin (`jeton-externe`, valeur nulle) sans qu'il ait à battre ni
 * à rejoindre. Sans la pose, l'effacement ne dirait rien : `storage` ne part
 * que pour une entrée qui existait.
 *
 * LES DROITS D'UN INVITÉ NE PASSENT PAS PAR LE BATTEMENT. La route de
 * re-validation (`rafraichis`, `lib/api/invite.ts`) rend l'INSTANTANÉ pris au
 * join (`participant.permissions`, `link-admission.ts:554-577`) — que
 * `services/participantRights.ts:6-13` déclare ne suivre ni le lien ni le
 * delta posé par l'hôte. Ce que l'hôte
 * change après le join arrive par `participant:rights-updated`, poussé sur la
 * room de conversation et sur la room personnelle de l'invité
 * (`participants-writes.ts:403-425`, `AuthHandler.ts:381`) ; le battement
 * reste une preuve de BAIL (§ 6.4). Au rechargement, la passerelle ne sert
 * que l'instantané : un droit changé ne se voit qu'en direct tant que la
 * route ne rend pas `resolveEntryRights` (issue gateway compagnon).
 *
 * CE QUI EST AFFICHÉ EST DIT : `POST /conversations/:id/receipts` (`lib/api/
 * fil.ts`, `accuseLecture`) part une seconde après qu'un message d'autrui a
 * été PEINT — jamais depuis un onglet caché, jamais hors ligne ; le serveur a
 * déjà accusé la page servie au montage.
 */

type Porte = 'membre' | 'invite';

type Configuration = {
  readonly socket: string;
  readonly passerelle: string;
  readonly conversation: string;
  readonly porte: Porte;
  readonly lien: CleDeLien | null;
  readonly moi: string | null;
  readonly nom: string;
  readonly langues: readonly string[];
  /** Les droits SERVIS par le document — l'état de départ, avant tout `participant:rights-updated`. Un membre a tout. */
  readonly droits: Droits;
  /** Les participants NOMMÉS par le document — les seuls dont `user:status` peut faire bouger « N en ligne ». */
  readonly participants: readonly string[];
  /** Ceux que le document a SERVIS en ligne — l'état de départ du compte. */
  readonly presents: readonly string[];
};

type Ecouteur = (...arguments_: unknown[]) => void;

type Socket = {
  readonly connected: boolean;
  connect(): unknown;
  disconnect(): unknown;
  emit(evenement: string, ...arguments_: unknown[]): unknown;
  on(evenement: string, ecouteur: Ecouteur): unknown;
  timeout(ms: number): { emit(evenement: string, ...arguments_: unknown[]): unknown };
  readonly io: { on(evenement: string, ecouteur: Ecouteur): unknown };
};

type ModuleSocket = { readonly io: (url: string, options: Readonly<Record<string, unknown>>) => Socket };

const DELAI_D_ACCUSE_MS = 10_000;
const DELAI_D_ACCUSE_DE_LECTURE_MS = 1_000;

const objet = (valeur: unknown): Readonly<Record<string, unknown>> | null =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Readonly<Record<string, unknown>>)
    : null;

const chaine = (valeur: unknown): string | null =>
  typeof valeur === 'string' && valeur !== '' ? valeur : null;

const liste = (valeur: string | undefined): readonly string[] => (valeur ?? '').split(',').filter((entree) => entree !== '');

const configuration = (main: HTMLElement): Configuration | null => {
  const { socket, passerelle, conversation, porte, lien, moi, nom, langues, ecrire, fichiers, images, historique, participants, presents } = main.dataset;
  if (socket === undefined || passerelle === undefined || conversation === undefined) return null;
  if (porte !== 'membre' && porte !== 'invite') return null;
  const cle = lien === undefined ? null : cleDeLien({ linkId: lien });
  if (porte === 'invite' && cle === null) return null;
  return {
    socket,
    passerelle,
    conversation,
    porte,
    lien: cle,
    moi: moi ?? null,
    nom: nom ?? FIL.vous,
    langues: liste(langues),
    droits: {
      canSendMessages: ecrire === '1',
      canSendFiles: fichiers === '1',
      canSendImages: images === '1',
      canViewHistory: porte === 'membre' || historique === '1',
    },
    participants: liste(participants),
    presents: liste(presents),
  };
};

const creanceDe = (config: Configuration): Creance | null => {
  if (config.porte === 'membre') {
    const jeton = valeurDuCookie(document.cookie, COOKIE_DE_JETON);
    return jeton === null ? null : { genre: 'membre', jeton };
  }
  const jeton = config.lien === null ? null : jetonDuCookie(document.cookie, config.lien);
  return jeton === null ? null : { genre: 'invite', jeton };
};

const identifiantClient = (): string => `cid_${crypto.randomUUID()}`;

type Contexte = {
  readonly main: HTMLElement;
  readonly config: Configuration;
  readonly creance: Creance;
  readonly p: Peintre;
  readonly r: Reserve;
  readonly defile: Defilement;
  /** Les clés de la réserve pour CE lecteur — `null` quand le document n'a servi aucune identité. */
  readonly cles: { readonly file: string; readonly brouillon: string } | null;
  /** Les fichiers d'une bulle qui attend son envoi, par `clientMessageId` — un `File` ne vit pas dans l'état. */
  readonly fichiers: Map<string, readonly File[]>;
  /** Ce qui a été affiché et n'a pas encore été DIT à la passerelle. */
  readonly lus: Set<string>;
  etat: F.EtatDuFil;
  /** Les droits tels que le lecteur les TIENT — servis par le document, puis changés par `participant:rights-updated`. */
  droits: Droits;
  socket: Socket | null;
  /**
   * Le socket est AUTHENTIFIÉ — `authenticated` reçu, pas seulement le transport
   * ouvert : la passerelle refuse tout `message:send`, `reaction:add` ou
   * `typing:start` qui la devance (`User not authenticated`), exactement comme
   * elle refuse un `conversation:join` prématuré. Tombe à `disconnect`.
   */
  pret: boolean;
  /** Un vidage de la file est en cours : un second, déclenché par `conversation:joined`, attend son tour — FIFO, jamais deux envois croisés. */
  vidageEnCours: boolean;
  composeur: ControleurDuComposeur | null;
  enLigne: boolean;
  cache: boolean;
  deconnecteDepuis: number | null;
  checkpoint: string | null;
  /** Le dernier curseur GLOBAL connu — `checkpointSeq` de `/sync`, ou un `_seq` reçu — renvoyé en `seq` (`routes/sync/index.ts:279`). */
  seq: number | null;
  plusAncien: string | null;
  ferme: boolean;
  dernierBattementA: number;
  accuseProgramme: ReturnType<typeof setTimeout> | null;
};

const point = (ctx: Contexte, etat: 'connecte' | 'creux' | 'hors-ligne'): void => {
  const noeud = ctx.main.querySelector<HTMLElement>('.etat');
  if (noeud !== null) noeud.dataset.etat = etat;
};

const bandeau = (ctx: Contexte, identifiant: string, visible: boolean): void => {
  const noeud = ctx.main.querySelector<HTMLElement>(`#${identifiant}`);
  if (noeud !== null) noeud.hidden = !visible;
};

/**
 * DIRE ce qui vient d'être affiché — d'autrui seulement (`aAccuser`), groupé
 * une seconde, jamais depuis un onglet caché ni hors ligne : un accusé de
 * lecture posé par un onglet que personne ne regarde serait un mensonge.
 */
const noteLus = (ctx: Contexte, bulles: readonly F.Bulle[]): void => {
  aAccuser(bulles.filter((bulle) => bulle.envoi === 'servi')).forEach((id) => ctx.lus.add(id));
  programmeLAccuse(ctx);
};

const programmeLAccuse = (ctx: Contexte): void => {
  if (ctx.accuseProgramme !== null || ctx.lus.size === 0 || ctx.cache || !ctx.enLigne) return;
  ctx.accuseProgramme = setTimeout(() => {
    ctx.accuseProgramme = null;
    void envoieLAccuse(ctx);
  }, DELAI_D_ACCUSE_DE_LECTURE_MS);
};

const envoieLAccuse = async (ctx: Contexte): Promise<void> => {
  if (ctx.cache || !ctx.enLigne || ctx.lus.size === 0) return;
  const messageIds = [...ctx.lus];
  ctx.lus.clear();
  const dit = await accuseLecture({ cle: ctx.config.conversation, creance: ctx.creance, messageIds, base: ctx.config.passerelle });
  if (!dit) messageIds.forEach((id) => ctx.lus.add(id));
};

const suspendsLAccuse = (ctx: Contexte): void => {
  if (ctx.accuseProgramme !== null) clearTimeout(ctx.accuseProgramme);
  ctx.accuseProgramme = null;
};

/**
 * Repeindre, puis décider du défilement. Le conteneur est ancré en BAS
 * (`column-reverse`) : en bas, un message reçu glisse de lui-même ; plus haut,
 * ce qu'on lit ne bouge pas (`conserveLeHaut`) et une pastille compte les
 * nouveaux — sauf pour ce que j'envoie, qui me ramène en bas.
 */
const applique = (ctx: Contexte, suivant: F.EtatDuFil): void => {
  const enBas = ctx.defile.estEnBas();
  ctx.etat = suivant;
  let neuves: readonly HTMLElement[] = [];
  const peindre = (): void => {
    neuves = peins(ctx.p, suivant, Date.now());
  };
  if (enBas) peindre();
  else ctx.defile.conserveLeHaut(peindre);
  if (neuves.length === 0) return;

  const identifiants = new Set(neuves.map((ligne) => ligne.dataset.id ?? ''));
  noteLus(ctx, suivant.bulles.filter((bulle) => identifiants.has(bulle.id)));

  const recues = neuves.filter((ligne) => !ligne.classList.contains('mien'));
  if (!enBas) {
    if (recues.length < neuves.length) ctx.defile.versLeBas();
    else ctx.defile.signaleNouveaux(recues.length);
  }
  // Une ARRIVÉE se signale — 1,5 s de teinte, qui explique (charte règle 24) ;
  // c'est ce chemin, et lui seul, qui la pose : une page d'historique ou une
  // file relue à l'ouverture passent par `peins` sans être des arrivées.
  neuves.forEach((ligne) => ligne.classList.add('neuve'));
  setTimeout(() => neuves.forEach((ligne) => ligne.classList.remove('neuve')), 1_500);
};

const requete = async (ctx: Contexte, chemin: string, options: RequestInit = {}): Promise<Response | null> =>
  fetch(`${ctx.config.passerelle}${chemin}`, {
    ...options,
    headers: { accept: 'application/json', ...entetesDeCreance(ctx.creance), ...(options.headers ?? {}) },
    cache: 'no-store',
  }).catch(() => null);

type Issue =
  | { readonly ok: true; readonly id: string | null }
  | { readonly ok: false; readonly raison: string; readonly statut: number | null };

/**
 * L'envoi par le TRANSPORT disponible : le socket quand il est là (`message:send`,
 * accusé `{ success, data: { messageId } }` — `MessageHandler.handleMessageSend`),
 * sinon `POST /conversations/:id/messages` avec le même `clientMessageId`,
 * clé d'idempotence que la passerelle déduplique (§ 6.2 de la phase 4).
 *
 * Une bulle qui porte des PIÈCES les téléverse d'abord (`POST /attachments/
 * upload`, `lib/api/fil.ts` › `televerse`), puis part par la ROUTE avec leurs
 * `attachmentIds` (`messages-send.ts:76`) — le chemin primaire des médias
 * (`CLAUDE.md` § Audio Pipeline), et le seul que ce module emprunte pour eux.
 */
const expedie = async (ctx: Contexte, bulle: F.Bulle): Promise<Issue> => {
  const clientMessageId = bulle.clientMessageId ?? identifiantClient();
  const fichiers = ctx.fichiers.get(clientMessageId) ?? [];
  const televersement = fichiers.length === 0 ? null : await televerse({ creance: ctx.creance, fichiers, base: ctx.config.passerelle });
  if (televersement?.genre === 'refus') return { ok: false, raison: televersement.message, statut: televersement.statut };
  const attachmentIds = televersement === null ? [] : televersement.identifiants;

  const charge = {
    conversationId: ctx.config.conversation,
    content: bulle.texte,
    originalLanguage: bulle.langueOriginale ?? undefined,
    clientMessageId,
  };

  if (attachmentIds.length === 0 && ctx.socket !== null && ctx.pret) {
    const socket = ctx.socket;
    return new Promise((resoud) => {
      socket.timeout(DELAI_D_ACCUSE_MS).emit('message:send', charge, (erreur: unknown, reponse: unknown) => {
        const accuse = objet(reponse);
        if (erreur !== null && erreur !== undefined) {
          resoud({ ok: false, raison: FIL.echec, statut: null });
          return;
        }
        if (accuse?.success === true) {
          resoud({ ok: true, id: chaine(objet(accuse.data)?.messageId) });
          return;
        }
        resoud({ ok: false, raison: chaine(accuse?.error) ?? FIL.refuse, statut: null });
      });
    });
  }

  const reponse = await requete(ctx, `/api/v1/conversations/${encodeURIComponent(ctx.config.conversation)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(attachmentIds.length === 0 ? charge : { ...charge, attachmentIds }),
  });
  if (reponse === null) return { ok: false, raison: FIL.horsLigne, statut: null };
  const enveloppe = objet(await reponse.json().catch(() => null));
  if (enveloppe?.success === true) return { ok: true, id: chaine(objet(enveloppe.data)?.id) };
  return { ok: false, raison: chaine(objet(enveloppe?.error)?.message) ?? chaine(enveloppe?.message) ?? FIL.refuse, statut: reponse.status };
};

const memoriseHorsLigne = async (ctx: Contexte, bulle: F.Bulle): Promise<void> => {
  if (bulle.clientMessageId === null || ctx.cles === null) return;
  await ctx.r.ecris(`${ctx.cles.file}${bulle.ecritA ?? ''}:${bulle.clientMessageId}`, {
    clientMessageId: bulle.clientMessageId,
    texte: bulle.texte,
    langue: bulle.langueOriginale,
    ecritA: bulle.ecritA,
    pieces: ctx.fichiers.get(bulle.clientMessageId) ?? [],
  }).catch(() => undefined);
};

const oublieHorsLigne = async (ctx: Contexte, clientMessageId: string): Promise<void> => {
  ctx.fichiers.delete(clientMessageId);
  if (ctx.cles === null) return;
  const cles = await ctx.r.cles(ctx.cles.file).catch(() => []);
  await Promise.all(cles.filter((cle) => cle.endsWith(`:${clientMessageId}`)).map((cle) => ctx.r.efface(cle)));
};

const envoieLaBulle = async (ctx: Contexte, bulle: F.Bulle): Promise<void> => {
  if (bulle.clientMessageId === null) return;
  if (!ctx.enLigne) {
    await memoriseHorsLigne(ctx, bulle);
    return;
  }
  applique(ctx, F.enAttente(ctx.etat, bulle.clientMessageId));
  const issue = await expedie(ctx, bulle);
  if (issue.ok) {
    applique(ctx, F.confirme(ctx.etat, bulle.clientMessageId, issue.id));
    await oublieHorsLigne(ctx, bulle.clientMessageId);
    return;
  }
  if (issue.statut === null && !ctx.enLigne) {
    await memoriseHorsLigne(ctx, bulle);
    applique(ctx, { ...ctx.etat, bulles: ctx.etat.bulles.map((b) => (b.clientMessageId === bulle.clientMessageId ? { ...b, envoi: 'hors-ligne' as const } : b)) });
    return;
  }
  // Un refus de SAISIE (400 : trop long, vide, pièce inconnue — `messages-send.ts:194-196`, `:337`)
  // n'est pas un envoi à réessayer tel quel : le texte REVIENT dans le champ, avec sa raison, et la
  // bulle en attente se retire. Une bulle « non envoyée » dont « Réessayer » rejouerait le même refus
  // ne laisserait au lecteur que la recopie à la main.
  if (issue.statut === 400 && ctx.composeur !== null) {
    applique(ctx, F.retire(ctx.etat, bulle.id));
    await oublieHorsLigne(ctx, bulle.clientMessageId);
    ctx.composeur.rends(bulle.texte, bulle.texte.length > LONGUEUR_MAX_DU_MESSAGE ? FIL.tropLong(bulle.texte.length, LONGUEUR_MAX_DU_MESSAGE) : issue.raison);
    return;
  }
  applique(ctx, F.echoue(ctx.etat, bulle.clientMessageId, issue.raison));
};

/**
 * Le retour en ligne : la file repart FIFO, dans l'ordre d'écriture (§ 7). UN
 * vidage à la fois — la reprise et `conversation:joined` le demandent tous deux,
 * et deux boucles croisées enverraient le second message avant le premier.
 */
const videLaFile = async (ctx: Contexte): Promise<void> => {
  if (ctx.vidageEnCours) return;
  ctx.vidageEnCours = true;
  try {
    for (const bulle of F.aEnvoyer(ctx.etat)) {
      if (ctx.ferme) {
        applique(ctx, F.echoue(ctx.etat, bulle.clientMessageId ?? '', BANDEAUX.placeFermee.titre));
        continue;
      }
      await envoieLaBulle(ctx, bulle);
    }
  } finally {
    ctx.vidageEnCours = false;
  }
};

const GENRE_PAR_TYPE: readonly (readonly [string, PieceJointe['genre']])[] = [
  ['image/', 'image'],
  ['audio/', 'audio'],
  ['video/', 'video'],
];

/** Les pièces d'une bulle qui n'est pas encore partie : nommées et pesées, sans adresse — rien ne se télécharge. */
const piecesLocales = (clientMessageId: string, fichiers: readonly File[]): readonly PieceJointe[] =>
  fichiers.map((fichier, rang) => ({
    id: `${clientMessageId}:${rang}`,
    genre: GENRE_PAR_TYPE.find(([prefixe]) => fichier.type.startsWith(prefixe))?.[1] ?? 'fichier',
    nom: fichier.name,
    url: '',
    octets: fichier.size,
    dureeMs: null,
    largeur: null,
    hauteur: null,
    transcription: null,
    langueDeTranscription: null,
    langueServie: null,
  }));

const fichiersDe = (valeur: unknown): readonly File[] =>
  (Array.isArray(valeur) ? valeur : []).filter((entree): entree is File => entree instanceof Blob);

/** Ce qui attendait dans la réserve à l'ouverture (une page rechargée hors ligne) reprend sa place. */
const relisLaFile = async (ctx: Contexte): Promise<void> => {
  if (ctx.cles === null) return;
  const cles = await ctx.r.cles(ctx.cles.file).catch(() => []);
  for (const cle of cles) {
    const entree = objet(await ctx.r.lis(cle).catch(() => null));
    const clientMessageId = chaine(entree?.clientMessageId);
    const texte = chaine(entree?.texte) ?? '';
    const fichiers = fichiersDe(entree?.pieces);
    if (clientMessageId === null || (texte === '' && fichiers.length === 0)) continue;
    if (fichiers.length > 0) ctx.fichiers.set(clientMessageId, fichiers);
    ctx.etat = F.insere(ctx.etat, {
      ...F.bulleOptimiste({
        clientMessageId,
        texte,
        auteur: ctx.config.nom,
        auteurId: ctx.config.moi,
        langue: chaine(entree?.langue) ?? ctx.config.langues[0] ?? 'fr',
        horsLigne: true,
        maintenant: Date.parse(chaine(entree?.ecritA) ?? '') || Date.now(),
      }),
      pieces: piecesLocales(clientMessageId, fichiers),
    });
  }
};

/** Un curseur GLOBAL reçu sur le fil (`emitWithSeq` pose `_seq` sur les émissions vers la room du compte) — noté, jamais reculé. */
const noteLeSeq = (ctx: Contexte, charge: unknown): void => {
  const seq = objet(charge)?._seq;
  if (typeof seq === 'number' && Number.isFinite(seq)) ctx.seq = Math.max(ctx.seq ?? 0, seq);
};

/**
 * Le rattrapage par `GET /sync` (`routes/sync/index.ts`) depuis le dernier
 * checkpoint — ou depuis le dernier instant servi au premier tour. `hasGap`
 * n'est calculé par la passerelle QUE si `seq` est annoncé (`:279`, `seq <
 * checkpointSeq - GAP_THRESHOLD`) : le module renvoie donc le dernier curseur
 * connu, et adopte `checkpointSeq` à chaque tour. Une session INVITÉE n'a pas
 * de curseur (`:274-278`, `checkpointSeq` vaut 0 pour elle) — son rattrapage ne
 * peut jamais rendre `hasGap`, et ce n'est pas un défaut du client.
 */
const rattrape = async (ctx: Contexte): Promise<void> => {
  const depuis = ctx.checkpoint ?? F.dernierInstantServi(ctx.etat);
  if (depuis === null) return;
  const reponse = await fetch(
    urlDeSync({ base: ctx.config.passerelle, depuis, scope: ctx.config.conversation, ...(ctx.seq === null ? {} : { seq: ctx.seq }) }),
    { headers: { accept: 'application/json', ...entetesDeCreance(ctx.creance) }, cache: 'no-store' },
  ).catch(() => null);
  if (reponse === null || !reponse.ok) return;
  const delta = litLeDelta(await reponse.json().catch(() => null));
  if (delta === null) return;
  ctx.checkpoint = delta.checkpoint;
  if (delta.checkpointSeq !== null) ctx.seq = Math.max(ctx.seq ?? 0, delta.checkpointSeq);
  let etat = ctx.etat;
  delta.messages.forEach((brut) => {
    const bulle = F.depuisLaCharge(brut, ctx.config.moi, ctx.config.langues, ctx.config.passerelle);
    if (bulle !== null) etat = F.insere(etat, bulle);
  });
  delta.supprimes.forEach((id) => {
    etat = F.retire(etat, id);
  });
  applique(ctx, etat);
  if (delta.hasGap) montreLeTrou(ctx);
};

/** « Des messages manquent ici » — posé au BAS du fil (le début du DOM), là où la suite aurait dû arriver. */
const montreLeTrou = (ctx: Contexte): void => {
  if (ctx.main.querySelector('.trou') !== null) return;
  const trou = document.createElement('li');
  trou.className = 'trou';
  const lien = document.createElement('a');
  lien.href = window.location.pathname;
  lien.textContent = `${FIL.trou} — ${FIL.trouAction}`;
  trou.append(lien);
  ctx.p.liste.prepend(trou);
};

/** Relire UN message servi (transcription, traduction audio) — jamais le fil entier. */
const relisLeMessage = async (ctx: Contexte, messageId: string): Promise<void> => {
  const reponse = await requete(
    ctx,
    `/api/v1/conversations/${encodeURIComponent(ctx.config.conversation)}/messages?around=${encodeURIComponent(messageId)}&limit=1`,
  );
  if (reponse === null || !reponse.ok) return;
  const enveloppe = objet(await reponse.json().catch(() => null));
  const brut = messagesServis(enveloppe?.data, ctx.config.moi, ctx.config.langues, ctx.config.passerelle).find((m) => m.id === messageId);
  if (brut === undefined) return;
  applique(ctx, F.insere(ctx.etat, F.bulleServie(brut)));
};

/**
 * La page PLUS ANCIENNE, par le haut — curseur `before` (`messages-list.ts`).
 * Le conteneur est ancré en bas : ce qui s'ajoute en haut ne déplace rien.
 */
const chargeLePlusAncien = async (ctx: Contexte): Promise<void> => {
  if (ctx.plusAncien === null) return;
  const curseur = ctx.plusAncien;
  ctx.plusAncien = null;
  const reponse = await requete(
    ctx,
    `/api/v1/conversations/${encodeURIComponent(ctx.config.conversation)}/messages?limit=40&before=${encodeURIComponent(curseur)}`,
  );
  if (reponse === null || !reponse.ok) {
    ctx.plusAncien = curseur;
    return;
  }
  const enveloppe = objet(await reponse.json().catch(() => null));
  const pagination = objet(enveloppe?.cursorPagination);
  const anciens = messagesServis(enveloppe?.data, ctx.config.moi, ctx.config.langues, ctx.config.passerelle);
  let etat = ctx.etat;
  anciens.forEach((m) => {
    etat = F.insere(etat, F.bulleServie(m));
  });
  ctx.etat = etat;
  peins(ctx.p, etat, Date.now());
  recale(ctx.p, Date.now());
  noteLus(ctx, anciens.map(F.bulleServie));
  ctx.plusAncien = pagination?.hasMore === true ? chaine(pagination.nextCursor) : null;
  const lien = ctx.main.querySelector<HTMLElement>('a.plus-ancien');
  if (lien !== null) lien.hidden = ctx.plusAncien === null;
};

/**
 * Le battement de bail (invité) — `rafraichis` (`lib/api/invite.ts`), le MÊME
 * appel que le serveur fait au montage, sur la route de re-validation que ce
 * module-là est seul à nommer (jeton en en-tête, jamais dans un corps). Son
 * 401 est CONTRÔLÉ avant d'être cru (§ 6.3 état F).
 */
const bats = async (ctx: Contexte): Promise<void> => {
  if (ctx.creance.genre !== 'invite' || ctx.config.lien === null || ctx.ferme) return;
  // La reprise bat, et le battement DÛ pendant l'absence bat aussi, au même
  // instant : un seul part. Deux requêtes identiques dans la même seconde
  // n'apportent aucune preuve de présence de plus.
  if (Date.now() - ctx.dernierBattementA < 1_000) return;
  ctx.dernierBattementA = Date.now();
  const issue = await rafraichis({ jeton: ctx.creance.jeton, base: ctx.config.passerelle });
  if (issue.genre === 'invalide') {
    const controle = await rafraichis({ jeton: ctx.creance.jeton, base: ctx.config.passerelle });
    if (controle.genre !== 'invalide') return;
    effaceLaPlace(ctx.config.lien);
    ferme(ctx, BANDEAUX.placeFermee.titre, 'bandeau-place-fermee');
    return;
  }
  if (issue.genre === 'clos') ferme(ctx, raisonDeFermeture(issue.code), null);
  // Un battement VALIDE ne repeint rien : sa charge est l'instantané du join
  // (`participantConversationPayload`, `link-admission.ts:554-577`), pas les
  // droits en vigueur — la relire effacerait ce que `participant:rights-updated`
  // vient de changer. C'est une preuve de BAIL (§ 6.4), rien d'autre.
};

/**
 * Les droits CHANGÉS PAR L'HÔTE (§ 6.3.B), reçus par `participant:rights-updated`
 * — la seule porte par laquelle la passerelle les dit après le join
 * (`participants-writes.ts:403-425`) : le bandeau les dit, le trombone les
 * suit, le composeur se ferme avec sa raison ou se ROUVRE — le document a servi
 * son formulaire caché derrière une fermeture par droit (`fil-vue.ts`) —, sans
 * rechargement, et sans toucher à un fil déjà FERMÉ (lien clos, session
 * expirée), dont la raison prime.
 */
const appliqueLesDroits = (ctx: Contexte, droits: Droits): void => {
  ctx.droits = droits;
  peinsLesDroits(ctx.main, droits);
  peinsLeTrombone(ctx.main, droits);
  if (ctx.ferme || ctx.composeur === null) return;
  if (droits.canSendMessages) ctx.composeur.ouvre();
  else ctx.composeur.ferme(raisonDeFermeture('DROIT_RETIRE'));
};

const ferme = (ctx: Contexte, raison: string, bandeauAMontrer: string | null): void => {
  ctx.ferme = true;
  ctx.composeur?.ferme(raison);
  retireLesControlesDeReaction(ctx.p);
  if (bandeauAMontrer !== null) bandeau(ctx, bandeauAMontrer, true);
  const enFile = F.aEnvoyer(ctx.etat);
  let etat = ctx.etat;
  enFile.forEach((bulle) => {
    etat = F.echoue(etat, bulle.clientMessageId ?? '', raison);
  });
  if (enFile.length > 0) applique(ctx, etat);
  ctx.socket?.disconnect();
};

/** Un accusé de socket — `{ success }` (`ReactionHandler.ts`, `AckResponseOf`) —, ou `false` sans transport ni réponse. */
const emetsAvecAccuse = (socket: Socket, evenement: string, charge: unknown): Promise<boolean> =>
  new Promise((resoud) => {
    socket.timeout(DELAI_D_ACCUSE_MS).emit(evenement, charge, (erreur: unknown, reponse: unknown) => {
      resoud((erreur === null || erreur === undefined) && objet(reponse)?.success === true);
    });
  });

/**
 * MON geste sur une pastille : peint d'abord (`reagisMoiMeme`), dit ensuite —
 * `reaction:add` / `reaction:remove` `{ messageId, emoji }` sur le socket
 * (`ReactionHandler.ts`), ou `POST` / `DELETE /reactions` par la route quand
 * le socket manque (`lib/api/fil.ts` › `reagis`). Un refus rejoue le geste à
 * l'envers ; l'agrégat exact arrive par `reaction:added` / `reaction:removed`.
 */
const basculeLaReaction = async (ctx: Contexte, messageId: string, emoji: string, ajoute: boolean): Promise<void> => {
  if (ctx.ferme || emoji === '' || messageId === '') return;
  applique(ctx, F.reagisMoiMeme(ctx.etat, messageId, emoji, ajoute));
  const fait =
    ctx.socket !== null && ctx.pret
      ? await emetsAvecAccuse(ctx.socket, ajoute ? 'reaction:add' : 'reaction:remove', { messageId, emoji })
      : (await reagis({ creance: ctx.creance, messageId, emoji, retirer: !ajoute, base: ctx.config.passerelle })).genre === 'fait';
  if (!fait) applique(ctx, F.reagisMoiMeme(ctx.etat, messageId, emoji, !ajoute));
};

const prendsLesReactions = (ctx: Contexte): void => {
  ctx.p.liste.addEventListener('submit', (evenement) => {
    const formulaire = (evenement.target as HTMLElement | null)?.closest<HTMLFormElement>('form.reagir-par');
    if (formulaire === null || formulaire === undefined) return;
    evenement.preventDefault();
    const emoji = formulaire.querySelector<HTMLInputElement>('input[name="reaction"]')?.value ?? '';
    const messageId = formulaire.querySelector<HTMLInputElement>('input[name="message"]')?.value ?? '';
    const bulle = ctx.etat.bulles.find((b) => b.id === messageId);
    const mienne = bulle?.reactions.find((r) => r.emoji === emoji)?.mienne ?? false;
    void basculeLaReaction(ctx, messageId, emoji, !mienne);
  });

  ctx.p.liste.addEventListener('click', (evenement) => {
    const cible = evenement.target as HTMLElement | null;
    const reagir = cible?.closest<HTMLElement>('button.reagir');
    if (reagir !== null && reagir !== undefined) {
      const messageId = reagir.closest<HTMLElement>('li.ligne')?.dataset.id ?? '';
      void choisisUneReaction(ctx.p).then((emoji) => basculeLaReaction(ctx, messageId, emoji, true));
      return;
    }
    const reessayer = cible?.closest<HTMLElement>('button.reessayer');
    if (reessayer === null || reessayer === undefined) return;
    const ligne = reessayer.closest<HTMLElement>('li.ligne');
    const bulle = ctx.etat.bulles.find((b) => b.clientMessageId !== null && b.clientMessageId === ligne?.dataset.cid);
    if (bulle !== undefined) void envoieLaBulle(ctx, { ...bulle, envoi: 'en-attente' });
  });
};

const branche = (ctx: Contexte, socket: Socket): void => {
  const conversationId = ctx.config.conversation;
  const concerne = (charge: unknown): boolean => {
    const id = chaine(objet(charge)?.conversationId);
    return id === null || id === conversationId;
  };
  const ecoute = (evenement: string, ecouteur: (charge: unknown) => void): void => {
    socket.on(evenement, (charge: unknown) => {
      noteLeSeq(ctx, charge);
      ecouteur(charge);
    });
  };

  // La room se rejoint une fois AUTHENTIFIÉ — et à chaque reconnexion, la
  // passerelle ré-authentifie puis ré-émet `authenticated`.
  ecoute('authenticated', () => {
    ctx.pret = true;
    point(ctx, 'connecte');
    socket.emit('conversation:join', { conversationId });
  });
  ecoute('conversation:joined', () => {
    point(ctx, 'connecte');
    const absence = ctx.deconnecteDepuis === null ? 0 : Date.now() - ctx.deconnecteDepuis;
    ctx.deconnecteDepuis = null;
    if (absence >= SEUIL_DE_RATTRAPAGE_MS) void rattrape(ctx);
    void videLaFile(ctx);
  });
  ecoute('conversation:join-error', (charge) => {
    // `not_authenticated` : la jonction a devancé l'authentification asynchrone
    // de la passerelle — `authenticated` suit, et rejoint.
    if (chaine(objet(charge)?.reason) === 'not_authenticated') return;
    point(ctx, 'creux');
  });
  socket.on('disconnect', () => {
    ctx.pret = false;
    if (ctx.deconnecteDepuis === null) ctx.deconnecteDepuis = Date.now();
    point(ctx, ctx.enLigne ? 'creux' : 'hors-ligne');
  });
  ecoute('auth:token-expired', () => {
    ctx.pret = false;
    point(ctx, 'creux');
    bandeau(ctx, 'bandeau-session-expiree', true);
    ctx.composeur?.ferme(BANDEAUX.sessionExpiree.corps);
    retireLesControlesDeReaction(ctx.p);
    ctx.ferme = true;
  });

  ecoute('message:new', (charge) => {
    const brut = objet(charge);
    if (brut === null || !concerne(brut)) return;
    const bulle = F.depuisLaCharge(brut, ctx.config.moi, ctx.config.langues, ctx.config.passerelle);
    if (bulle === null) return;
    applique(ctx, F.frappe(F.insere(ctx.etat, bulle), { id: bulle.auteurId ?? '', nom: '' }, false));
  });
  ecoute('message:translation', (charge) => {
    const brut = objet(charge);
    const messageId = chaine(brut?.messageId);
    if (brut === null || messageId === null) return;
    applique(ctx, F.traduit(ctx.etat, messageId, brut.translations, ctx.config.langues));
  });
  ecoute('message:edited', (charge) => {
    const brut = objet(charge);
    if (brut === null || !concerne(brut)) return;
    applique(ctx, F.edite(ctx.etat, brut, ctx.config.moi, ctx.config.langues, ctx.config.passerelle));
  });
  ecoute('message:deleted', (charge) => {
    const messageId = chaine(objet(charge)?.messageId);
    if (messageId === null || !concerne(charge)) return;
    applique(ctx, F.retire(ctx.etat, messageId));
  });
  const surReaction = (charge: unknown): void => {
    const reaction = F.reactionDe(charge, ctx.config.moi);
    if (reaction === null || !concerne(charge)) return;
    applique(ctx, F.reagit(ctx.etat, reaction.messageId, reaction.emoji, reaction.nombre, reaction.mienne));
  };
  ecoute('reaction:added', surReaction);
  ecoute('reaction:removed', surReaction);
  ecoute('typing:start', (charge) => {
    const frappeur = F.frappeurDe(charge);
    if (frappeur === null || !concerne(charge) || frappeur.id === ctx.config.moi) return;
    applique(ctx, F.frappe(ctx.etat, frappeur, true));
  });
  ecoute('typing:stop', (charge) => {
    const frappeur = F.frappeurDe(charge);
    if (frappeur === null || !concerne(charge)) return;
    applique(ctx, F.frappe(ctx.etat, frappeur, false));
  });
  ecoute('read-status:updated', (charge) => {
    const brut = objet(charge);
    if (brut === null || !concerne(brut)) return;
    const acteur = chaine(brut.userId) ?? chaine(brut.participantId);
    if (acteur === ctx.config.moi) return;
    const type = brut.type === 'read' ? 'read' : brut.type === 'received' ? 'received' : null;
    const jusquA = Date.parse(chaine(brut.updatedAt) ?? '');
    if (type === null || Number.isNaN(jusquA)) return;
    applique(ctx, F.accuse(ctx.etat, { type, jusquA }));
  });
  const surAudio = (charge: unknown): void => {
    const messageId = chaine(objet(charge)?.messageId);
    if (messageId !== null) void relisLeMessage(ctx, messageId);
  };
  ecoute('audio:transcription-ready', surAudio);
  ecoute('audio:translation-ready', surAudio);
  // L'hôte a changé MES droits (`PATCH …/participants/:id/rights`) : la
  // passerelle les pousse sur la room de conversation (sans `canViewHistory`)
  // et, en charge complète, sur ma room personnelle (`participants-writes.ts:
  // 403-425`) — deux charges, un ordre qui ne se suppose pas, une seule
  // lecture (`droitsDuChangement`). Un membre n'a pas de droits d'entrée.
  ecoute('participant:rights-updated', (charge) => {
    if (ctx.config.porte !== 'invite' || !concerne(charge)) return;
    const droits = droitsDuChangement(charge, ctx.config.moi, ctx.droits);
    if (droits !== null) appliqueLesDroits(ctx, droits);
  });
  // La présence — poussée aux rooms des AMIS acceptés et des administrateurs
  // (`presence-audience.ts`, directive 2026-08-25), jamais à une room de
  // conversation : la recevoir prouve que la passerelle la sert au lecteur. Le
  // compte ne bouge que pour un participant que le document a NOMMÉ.
  ecoute('user:status', (charge) => {
    const transition = F.presenceDe(charge);
    if (transition !== null) applique(ctx, F.presence(ctx.etat, ctx.config.participants, transition));
  });
  ecoute('presence:snapshot', (charge) => {
    applique(ctx, F.presencesDe(charge).reduce((etat, transition) => F.presence(etat, ctx.config.participants, transition), ctx.etat));
  });
};

const connecte = async (ctx: Contexte): Promise<void> => {
  const client = (await import(/* webpackIgnore: true */ ctx.config.socket).catch(() => null)) as ModuleSocket | null;
  if (client === null) return;
  const auth = ctx.creance.genre === 'membre' ? { token: ctx.creance.jeton } : { sessionToken: ctx.creance.jeton };
  const socket = client.io(ctx.config.passerelle, {
    ...POLITIQUE_DE_RECONNEXION,
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    autoConnect: false,
    auth,
  });
  ctx.socket = socket;
  branche(ctx, socket);
  if (!ctx.cache && ctx.enLigne) socket.connect();
};

/**
 * LE COURT-CIRCUIT DU BACKOFF (§ 7, « au retour : reconnectAttempts = 0,
 * connect() »). Quand le transport est tombé de lui-même (une coupure de
 * réseau, jamais un `disconnect()` du module), le gestionnaire de socket.io a
 * ARMÉ une minuterie de reconnexion et `connect()` seul ne fait RIEN tant
 * qu'elle est pendante (`socket.js`, `if (!this.io._reconnecting) this.io.open()`).
 * `disconnect()` la vide (`Manager._close` → `cleanup`) ; `connect()` ouvre
 * alors sur-le-champ. Mesuré sans ce détour : un retour en ligne attendait le
 * backoff — jusqu'à 30 s —, et jamais sous une horloge figée.
 */
const reconnecteSansAttendre = (socket: Socket): void => {
  socket.disconnect();
  socket.connect();
};

const surTransition = (ctx: Contexte) => (transition: TransitionDeCycle): void => {
  if (transition.type === 'masquage') {
    ctx.cache = true;
    suspendsLAccuse(ctx);
    if (ctx.deconnecteDepuis === null) ctx.deconnecteDepuis = Date.now();
    ctx.socket?.disconnect();
    return;
  }
  if (transition.type === 'perte-du-reseau') {
    ctx.enLigne = false;
    suspendsLAccuse(ctx);
    // L'absence commence ICI, pas à la chute du socket qu'un tunnel coupé ne
    // signale qu'au délai de ping : c'est cette durée que la reprise compare au
    // seuil de rattrapage (§ 7, « socket tombée 30 s – 5 min ⇒ GET /sync »).
    if (ctx.deconnecteDepuis === null) ctx.deconnecteDepuis = Date.now();
    point(ctx, 'hors-ligne');
    bandeau(ctx, 'bandeau-hors-ligne', true);
    return;
  }
  if (transition.type === 'reprise') {
    ctx.cache = false;
    ctx.enLigne = true;
    bandeau(ctx, 'bandeau-hors-ligne', false);
    if (ctx.ferme) return;
    if (ctx.socket !== null && !ctx.socket.connected) reconnecteSansAttendre(ctx.socket);
    programmeLAccuse(ctx);
    // L'absence est SOLDÉE ici : `conversation:joined`, qui suit la reconnexion,
    // ne la rattrapera pas une seconde fois. Et un retour RATTRAPE TOUJOURS
    // (§ 7, « retour d'arrière-plan : refresh, GET /sync ») : le socket a été
    // coupé au masquage et ne rejoue rien — sans `/sync`, ce qui s'est dit
    // pendant une absence même courte n'arriverait jamais. Le seuil de 30 s ne
    // vaut que pour un socket tombé SOUS les yeux du lecteur (`conversation:joined`).
    ctx.deconnecteDepuis = null;
    void bats(ctx).then(() => rattrape(ctx)).then(() => videLaFile(ctx));
    return;
  }
  if (transition.type === 'destruction') {
    ctx.socket?.emit('conversation:leave', { conversationId: ctx.config.conversation });
    ctx.socket?.disconnect();
    return;
  }
  if (transition.type === 'jeton-externe' && ctx.creance.genre === 'invite' && transition.valeur === null) {
    ferme(ctx, BANDEAUX.placeFermee.titre, 'bandeau-place-fermee');
  }
};

const demarre = async (): Promise<void> => {
  const main = document.querySelector<HTMLElement>('main[data-participation="fil"]');
  if (main === null) return;
  const config = configuration(main);
  if (config === null) return;
  const creance = creanceDe(config);
  if (creance === null) return;
  const p = peintre(main);
  if (p === null) return;

  if (creance.genre === 'invite' && config.lien !== null && config.moi !== null) {
    poseSession(config.lien, { jeton: creance.jeton, participantId: config.moi, pseudo: config.nom });
  }

  const r = await reserve();
  const cles = clesDeLaReserve({ moi: config.moi, conversation: config.conversation });
  if (config.moi !== null) await purgeLesAutres(r, config.moi);

  const ctx: Contexte = {
    main,
    config,
    creance,
    p,
    r,
    defile: defilement({ main, libelle: FIL.nouveaux }),
    cles,
    fichiers: new Map(),
    lus: new Set(),
    etat: { bulles: bullesDuDocument(p), frappeurs: [], presents: config.presents },
    droits: config.droits,
    socket: null,
    pret: false,
    vidageEnCours: false,
    composeur: null,
    enLigne: true,
    cache: false,
    deconnecteDepuis: null,
    checkpoint: null,
    seq: null,
    plusAncien: (() => {
      const lien = main.querySelector<HTMLAnchorElement>('a.plus-ancien');
      return lien === null ? null : new URL(lien.href, window.location.href).searchParams.get('avant');
    })(),
    ferme: false,
    // Le serveur vient de battre au montage (§ 6.3 état B) : le premier battement du module est dû dans une période.
    dernierBattementA: Date.now(),
    accuseProgramme: null,
  };

  // Le document est arrivé en bas de lui-même (`column-reverse`) : rien à faire
  // sauter. Les heures passent en locale et les jours dans le fuseau du
  // lecteur — au-dessus de ce qu'il lit, sans en déplacer une ligne.
  recaleLesHeures(p);
  recale(p, Date.now());

  await relisLaFile(ctx);
  // Peindre l'état servi UNE fois, même sans file en attente : c'est ainsi que
  // chaque ligne servie reçoit son bouton « Réagir » (cloné du gabarit, jamais
  // servi inerte) — la peinture est idempotente, une ligne déjà juste n'est pas
  // touchée. Mesuré sans ce tour : aucun contrôle de réaction avant le premier
  // événement reçu.
  peins(p, ctx.etat, Date.now());

  const brouillon = cles === null ? null : chaine(await r.lis(cles.brouillon).catch(() => null));
  ctx.composeur = prendsLeComposeur({
    main,
    brouillon,
    surBrouillon: (texte) => {
      if (cles === null) return;
      void (texte === '' ? r.efface(cles.brouillon) : r.ecris(cles.brouillon, texte)).catch(() => undefined);
    },
    frappe: {
      commence: () => ctx.socket !== null && ctx.pret && ctx.socket.emit('typing:start', { conversationId: config.conversation }),
      cesse: () => ctx.socket !== null && ctx.pret && ctx.socket.emit('typing:stop', { conversationId: config.conversation }),
    },
    surEnvoi: (texte, fichiers) => {
      const clientMessageId = identifiantClient();
      if (fichiers.length > 0) ctx.fichiers.set(clientMessageId, fichiers);
      const bulle: F.Bulle = {
        ...F.bulleOptimiste({
          clientMessageId,
          texte,
          auteur: config.nom,
          auteurId: config.moi,
          langue: config.langues[0] ?? 'fr',
          horsLigne: !ctx.enLigne,
          maintenant: Date.now(),
        }),
        pieces: piecesLocales(clientMessageId, fichiers),
      };
      applique(ctx, F.insere(ctx.etat, bulle));
      void envoieLaBulle(ctx, bulle);
    },
  });

  prendsLesReactions(ctx);
  oublieLaJonctionFraiche();

  const lienPlusAncien = main.querySelector<HTMLElement>('a.plus-ancien');
  if (lienPlusAncien !== null) {
    lienPlusAncien.addEventListener('click', (evenement) => {
      evenement.preventDefault();
      void chargeLePlusAncien(ctx);
    });
    ctx.defile.surApproche(() => void chargeLePlusAncien(ctx));
  }

  observeCycleDeVie({
    cleDuJeton: config.lien === null ? `meeshy-membre-${config.conversation}` : cleDuLien(config.lien),
    sur: surTransition(ctx),
    ...(creance.genre === 'invite'
      ? { battement: { intervalleMs: PERIODE_DU_BATTEMENT_MS, battre: () => void bats(ctx) } }
      : {}),
  });

  await connecte(ctx);
};

void demarre();
