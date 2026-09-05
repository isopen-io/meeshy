import {
  entetesDeCreance,
  LONGUEUR_MAX_DU_MESSAGE,
  messages as messagesServis,
  televerse,
} from '@/lib/api/fil';
import { aAccuser, accuseLecture } from '@/lib/api/fil-mutations';
import { cleDuLien, effaceLaPlace, poseSession } from '@/lib/api/guest-session';
import { rafraichis, raisonDeFermeture, type Droits } from '@/lib/api/invite';
import { BANDEAUX, ETATS_DU_TEMPS_REEL, FIL } from '@/lib/contenu/fil';

import { brancheLaBanniere } from './banniere';
import { montreLeBandeau } from './bandeau';
import { prendsLaCapture } from './capture';
import { prendsLeComposeur } from './composeur';
import { defilement } from './defilement';
import { droitsDuChangement, oublieLaJonctionFraiche, peinsLesDroits, peinsLeTrombone } from './droits-peinture';
import * as F from './fil-etat';
import { configuration, creanceDe, identifiantClient, type Contexte, type ModuleSocket, type Socket } from './fil-contexte';
import { envoieLaModification, prendsLesGestes } from './fil-gestes';
import {
  bullesDuDocument,
  peins,
  peintre,
  recale,
  recaleLesHeures,
  retireLesControlesDeReaction,
  retireLesMenus,
  type ContexteMenu,
} from './fil-peinture';
import { memoriseHorsLigne, oublieHorsLigne, piecesLocales, relisLaFile } from './fil-reserve';
import { observeCycleDeVie, type TransitionDeCycle } from './lifecycle';
import { armeLaFeuilleDeLien } from './feuille-de-lien';
import { prendsLePleinEcran } from './plein-ecran';
import {
  doitRattraper,
  PERIODE_DU_BATTEMENT_MS,
  POLITIQUE_DE_RECONNEXION,
} from './reconnect-policy';
import { clesDeLaReserve, purgeLesAutres, reserve } from './reserve';
import { demandeLeDelta } from './sync/delta-client';

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

/**
 * `Porte`, `Configuration`, `Socket`, `ModuleSocket`, `Contexte`, ainsi que
 * les lecteurs `configuration()` et `creanceDe()` du `<main>`, vivent dans
 * `lib/realtime/fil-contexte.ts` depuis l'extraction de l'issue #5163 (§ 4
 * étape 0 de la spécification — ce module était hors budget, 1 056 lignes).
 * `identifiantClient` les accompagne. Aucun comportement ne change.
 */

const DELAI_D_ACCUSE_MS = 10_000;
const DELAI_D_ACCUSE_DE_LECTURE_MS = 1_000;

const objet = (valeur: unknown): Readonly<Record<string, unknown>> | null =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Readonly<Record<string, unknown>>)
    : null;

const chaine = (valeur: unknown): string | null =>
  typeof valeur === 'string' && valeur !== '' ? valeur : null;

/**
 * LE POINT D'ÉTAT — l'attribut ET son nom, jamais l'un sans l'autre.
 *
 * L'attribut seul ne disait rien à qui n'a pas d'yeux : le libellé hors-écran
 * naissait rempli par le serveur (`ETATS_DU_TEMPS_REEL.inconnu`) et n'était
 * plus jamais touché, si bien qu'un fil parfaitement vivant continuait
 * d'annoncer « pas encore actif » à un lecteur d'écran. Les deux se posent
 * donc ensemble, depuis la table que le serveur a lue.
 */
const point = (ctx: Contexte, etat: 'connecte' | 'creux' | 'hors-ligne'): void => {
  const noeud = ctx.main.querySelector<HTMLElement>('.etat');
  if (noeud === null) return;
  noeud.dataset.etat = etat;
  const nom = noeud.querySelector<HTMLElement>('.hors-ecran');
  if (nom !== null) nom.textContent = ETATS_DU_TEMPS_REEL[etat];
};

const bandeau = (ctx: Contexte, identifiant: string, visible: boolean): void =>
  montreLeBandeau(ctx.main, identifiant, visible);

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
 * CE QUE LE MENU D'UNE LIGNE GOUVERNE, LU SUR LE CONTEXTE COURANT (§ 12.10.1,
 * issue #5163) — le composeur est ouvert pour un membre, et selon `canSend
 * Messages` pour un invité ; l'invité, lui, ne modifie ni ne retire JAMAIS
 * (régime 3). Recalculé à chaque peinture : un droit rendu par l'hôte
 * (`participant:rights-updated`) doit faire réapparaître « Répondre » au
 * prochain message reçu, pas seulement au rechargement.
 */
const menuDe = (ctx: Contexte): ContexteMenu => ({
  composeurOuvert: ctx.config.porte === 'membre' || ctx.droits.canSendMessages,
  estInvite: ctx.config.porte === 'invite',
});

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
    neuves = peins(ctx.p, suivant, Date.now(), menuDe(ctx));
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

  // `replyToId` VOYAGE AVEC LA CITATION (issue #5163) — jamais un champ de
  // plus sur `Bulle` : `bulleOptimiste({ reponseA })` a DÉJÀ posé la
  // citation (`fil-etat.ts`), et c'est la MÊME donnée qui arme le bandeau du
  // composeur ET nomme la cible sur le fil.
  const replyToId = bulle.citations.find((citation) => citation.genre === 'reponse')?.cible;
  // UN LIEU PARTAGÉ (#5061, § 2.1) — posté au premier niveau, jamais dans
  // `metadata` : `parseSharedPlace` (`services/location/sharedPlace.ts`) ne
  // lit QUE `latitude`/`longitude`/`name`/`address` ; le nom et l'adresse ne
  // sont jamais posés ici (§ 2.5 — aucun géocodage inverse côté v3, zéro
  // requête externe de plus).
  const lieu = bulle.lieu ?? null;
  const aUnLieu = lieu !== null;
  const charge = {
    conversationId: ctx.config.conversation,
    content: bulle.texte,
    originalLanguage: bulle.langueOriginale ?? undefined,
    clientMessageId,
    ...(replyToId === undefined ? {} : { replyToId }),
    ...(lieu === null ? {} : { location: { latitude: lieu.latitude, longitude: lieu.longitude } }),
  };

  // LA POSITION EST FORCÉE PAR LA ROUTE (§ 2.1 de la spécification #5061,
  // « poste … au premier niveau de POST /conversations/:id/messages ») —
  // jamais le socket, même quand il est prêt : c'est ce que le critère de
  // fin observe.
  if (attachmentIds.length === 0 && !aUnLieu && ctx.socket !== null && ctx.pret) {
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
  const issue = await demandeLeDelta({
    base: ctx.config.passerelle,
    depuis,
    scope: ctx.config.conversation,
    seq: ctx.seq,
    entetes: entetesDeCreance(ctx.creance),
  });
  if (issue.genre !== 'delta') return;
  const delta = issue.delta;
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
  peins(ctx.p, etat, Date.now(), menuDe(ctx));
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
  // Le micro et la position (#5061) suivent le MÊME droit que le trombone
  // repeint juste au-dessus — jamais un canSendFiles/canSendLocations que la
  // passerelle n'applique pas à l'envoi (§ 2.3).
  ctx.capture?.actualise();
  if (ctx.ferme || ctx.composeur === null) return;
  if (droits.canSendMessages) ctx.composeur.ouvre();
  else ctx.composeur.ferme(raisonDeFermeture('DROIT_RETIRE'));
};

const ferme = (ctx: Contexte, raison: string, bandeauAMontrer: string | null): void => {
  ctx.ferme = true;
  ctx.composeur?.ferme(raison);
  retireLesControlesDeReaction(ctx.p);
  // Les menus suivent les réactions au même moment (§ 12.10.1, issue #5163) :
  // rien ne se répond, ne se modifie ni ne se retire sur un fil FERMÉ.
  retireLesMenus(ctx.p);
  if (bandeauAMontrer !== null) bandeau(ctx, bandeauAMontrer, true);
  const enFile = F.aEnvoyer(ctx.etat);
  let etat = ctx.etat;
  enFile.forEach((bulle) => {
    etat = F.echoue(etat, bulle.clientMessageId ?? '', raison);
  });
  if (enFile.length > 0) applique(ctx, etat);
  ctx.socket?.disconnect();
};

/**
 * RÉAGIR, RÉPONDRE, MODIFIER, RETIRER — `lib/realtime/fil-gestes.ts` (§ 4
 * étape 0 de la spécification #5163, extraction ; § 12.10.1, les trois
 * gestes nouveaux). `applique` et `envoieLaBulle` sont INJECTÉS : ce module
 * possède le socket et la boucle de peinture, `fil-gestes.ts` ne les importe
 * pas (jamais d'import circulaire).
 */

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
    const rattraper = doitRattraper({ deconnecteDepuis: ctx.deconnecteDepuis, maintenant: Date.now() });
    ctx.deconnecteDepuis = null;
    if (rattraper) void rattrape(ctx);
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
  // LA BANNIÈRE (#4454) — branchée ICI, sur le socket qui vient d'être ouvert,
  // et jamais ailleurs : cet écran en tient DÉJÀ un, donc le toast ne coûte
  // aucune connexion. La région est cherchée une fois ; absente (un document
  // servi sans temps réel), la porte ne fait rien.
  brancheLaBanniere({ socket, region: document.querySelector<HTMLElement>('.banniere') });
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
    ctx.composeur?.detruit();
    ctx.gestes?.detruit();
    ctx.capture?.detruit();
    ctx.feuilleDeLien?.();
    return;
  }
  if (transition.type === 'jeton-externe' && ctx.creance.genre === 'invite' && transition.valeur === null) {
    ferme(ctx, BANDEAUX.placeFermee.titre, 'bandeau-place-fermee');
  }
};

/**
 * LA CIBLE DE LA FEUILLE « NOUVEAU LIEN » DEPUIS CE FIL (#5034, § 12.10.5) —
 * la région propre à cet hôte (`#lien-cree`, l'avis SEUL — jamais tout
 * `#main-content`, dont le remplacement perdrait l'état vivant du fil : les
 * bulles déjà peintes, le socket, les écouteurs) et le contrôle qui reprend
 * le focus. `/links` paramètre le MÊME site (`lib/realtime/liens.ts`) avec SA
 * région (`#carnet`, la liste ENTIÈRE — elle n'a pas d'état vivant à perdre).
 */
const CIBLE_DU_LIEN = { region: '#lien-cree', ouvreur: 'a.partager' } as const;

const demarre = async (): Promise<void> => {
  const main = document.querySelector<HTMLElement>('main[data-participation="fil"]');
  if (main === null) return;
  // AVANT toute créance : une surimpression servie doit se fermer à Échap même
  // sur un fil dont l'authentification a échoué (`plein-ecran.ts`).
  prendsLePleinEcran();
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
    gestes: null,
    capture: null,
    // L'ÉCOUTE DE LA FEUILLE « NOUVEAU LIEN » — armée ici, RENDUE à
    // `destruction` : l'écoute se pose au document, qui survit à une
    // navigation douce, et le site partagé n'en tolère qu'UNE à la fois.
    feuilleDeLien: armeLaFeuilleDeLien(CIBLE_DU_LIEN),
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
  peins(p, ctx.etat, Date.now(), menuDe(ctx));

  const brouillon = cles === null ? null : chaine(await r.lis(cles.brouillon).catch(() => null));
  ctx.composeur = prendsLeComposeur({
    main,
    gabarit: p.gabarit,
    brouillon,
    surBrouillon: (texte) => {
      if (cles === null) return;
      void (texte === '' ? r.efface(cles.brouillon) : r.ecris(cles.brouillon, texte)).catch(() => undefined);
    },
    frappe: {
      commence: () => ctx.socket !== null && ctx.pret && ctx.socket.emit('typing:start', { conversationId: config.conversation }),
      cesse: () => ctx.socket !== null && ctx.pret && ctx.socket.emit('typing:stop', { conversationId: config.conversation }),
    },
    // LES TROIS GENRES D'UN ENVOI (§ 12.10.1, issue #5163) : un message NU et
    // une RÉPONSE partagent le MÊME transport (`envoieLaBulle` → `expedie`,
    // qui lit `replyToId` sur la citation que `bulleOptimiste({ reponseA })`
    // vient de poser) ; une MODIFICATION est un transport ENTIÈREMENT
    // DIFFÉRENT (`message:edit` / `PUT`, jamais `message:send`), servi par
    // `envoieLaModification` (`fil-gestes.ts`) — aucune bulle nouvelle n'est
    // insérée, la bulle EXISTANTE est modifiée sur place.
    surEnvoi: (texte, fichiers, contexte) => {
      if (contexte?.genre === 'modification') {
        void envoieLaModification(ctx, applique, contexte.cible, texte);
        return;
      }
      const clientMessageId = identifiantClient();
      if (fichiers.length > 0) ctx.fichiers.set(clientMessageId, fichiers);
      const cibleDeLaReponse = contexte?.genre === 'reponse' ? ctx.etat.bulles.find((b) => b.id === contexte.cible) : undefined;
      const bulle: F.Bulle = {
        ...F.bulleOptimiste({
          clientMessageId,
          texte,
          auteur: config.nom,
          auteurId: config.moi,
          langue: config.langues[0] ?? 'fr',
          horsLigne: !ctx.enLigne,
          maintenant: Date.now(),
          ...(contexte?.genre === 'reponse'
            ? { reponseA: { cible: contexte.cible, source: cibleDeLaReponse?.deMoi ? config.nom : (cibleDeLaReponse?.auteur ?? '') } }
            : {}),
        }),
        pieces: piecesLocales(clientMessageId, fichiers),
      };
      applique(ctx, F.insere(ctx.etat, bulle));
      void envoieLaBulle(ctx, bulle);
    },
  });

  ctx.gestes = prendsLesGestes({ ctx, applique, envoieLaBulle });
  ctx.capture = prendsLaCapture({ ctx, applique, envoieLaBulle });
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

/**
 * REMONTAGE PAR LE NAVIGATEUR DE ZONE (#5106) : un ES module réimporté ne se
 * ré-exécute pas — après une navigation douce, c'est cet export que le
 * navigateur appelle pour monter l'écran neuf. L'auto-démarrage ci-dessus
 * reste : sans navigateur (amélioration progressive), l'import du chargeur
 * suffit, comme avant.
 */
export const monte = demarre;
