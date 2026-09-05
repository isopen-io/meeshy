import { demande, FENETRE_D_EDITION_MS, type Creance, type Message, type Recuperateur } from './fil';
import { chaine, objet } from './lecture';
import { baseDeLaPasserelle } from './links';

/**
 * MODIFIER, RETIRER, RÉAGIR, ACCUSER LECTURE — les routes de MUTATION du fil,
 * extraites de `lib/api/fil.ts` (§ 4 étape 0 de la spécification #5061 :
 * `fil.ts` pesait 919 lignes, proche du seuil de 1000 — CLAUDE.md § budget,
 * « on extrait d'abord, on ajoute ensuite »). Aucun comportement ne change :
 * seule la frontière du fichier bouge, `fil.ts` reste la seule source des
 * types `Message`/`Fil`, de la lecture d'une page et de l'envoi d'un message.
 */

export type { Creance, Recuperateur } from './fil';

export type ReactionPosee =
  | {
      readonly genre: 'fait';
      /** `POST /reactions` a rendu 200 — la pastille était DÉJÀ la mienne (`unchanged`) — plutôt que 201. */
      readonly dejaLa: boolean;
    }
  | { readonly genre: 'refus'; readonly message: string; readonly statut: number | null };

const REFUS_REACTION = 'La réaction n’a pas pu être enregistrée.';

/**
 * `POST /api/v1/reactions` `{ messageId, emoji }` (`routes/reactions.ts:78`,
 * `requiredAuth` avec `allowAnonymous: true` — « les anonymes peuvent aussi
 * réagir ») et `DELETE /api/v1/reactions/:messageId/:emoji` (`:290`) — les deux
 * portes REST par lesquelles le formulaire d'une pastille bascule un emoji
 * sans JavaScript ; le module de participation, lui, émet `reaction:add` /
 * `reaction:remove` sur le socket (`ReactionHandler.ts`).
 */
export const reagis = async ({
  creance,
  messageId,
  emoji,
  retirer,
  base,
  recuperer,
}: {
  readonly creance: Creance;
  readonly messageId: string;
  readonly emoji: string;
  readonly retirer: boolean;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<ReactionPosee> => {
  const racine = `${base ?? baseDeLaPasserelle()}/api/v1/reactions`;
  const reponse = retirer
    ? await demande(`${racine}/${encodeURIComponent(messageId)}/${encodeURIComponent(emoji)}`, creance, recuperer, { method: 'DELETE' })
    : await demande(racine, creance, recuperer, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messageId, emoji }),
      });
  if (reponse === null) return { genre: 'refus', message: REFUS_REACTION, statut: null };
  // Retirer une réaction déjà absente est un 200 IDEMPOTENT pour la passerelle
  // (`routes/reactions.ts:379-386`, « the caller's desired end-state is
  // achieved ») — un état atteint pour le lecteur : la pastille n'est plus la
  // sienne. Une passerelle plus ancienne rendait 404 ; il dit la même chose.
  if (reponse.ok || (retirer && reponse.status === 404)) return { genre: 'fait', dejaLa: !retirer && reponse.status === 200 };
  const enveloppe = objet(await reponse.json().catch(() => null));
  return {
    genre: 'refus',
    message: chaine(objet(enveloppe?.error)?.message) ?? chaine(enveloppe?.message) ?? REFUS_REACTION,
    statut: reponse.status,
  };
};

/**
 * `POST /api/v1/conversations/:id/receipts` `{ type: 'read', messageIds }`
 * (`routes/conversations/receipts.ts:946`, `requireAuth` + `allowAnonymous` :
 * « un invité de lien est un participant de plein droit […] le serveur COMPTE
 * ses non-lus ») — la porte par laquelle le fil DIT ce qui a été affiché. Les
 * messages du lecteur lui-même sont écartés par la passerelle (« un accusé de
 * soi à soi n'apprend rien ») ; on ne les rapporte pas. Un lot vide n'est pas
 * envoyé : `messageIds: []` signifierait « rien n'a été affiché ».
 */
export const accuseLecture = async ({
  cle,
  creance,
  messageIds,
  base,
  recuperer,
}: {
  readonly cle: string;
  readonly creance: Creance;
  readonly messageIds: readonly string[];
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<boolean> => {
  if (messageIds.length === 0) return false;
  const reponse = await demande(
    `${base ?? baseDeLaPasserelle()}/api/v1/conversations/${encodeURIComponent(cle)}/receipts`,
    creance,
    recuperer,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'read', messageIds }),
    },
  );
  return reponse !== null && reponse.ok;
};

/** Les identifiants à ACCUSER : ce qui est affiché et n'est pas de moi. */
export const aAccuser = (lus: readonly Message[]): readonly string[] =>
  lus.filter((m) => !m.deMoi && !m.systeme).map((m) => m.id);

/**
 * CE QU'IL FAUT D'UN MESSAGE POUR SAVOIR SI ON PEUT LE MODIFIER OU LE
 * RETIRER — la forme que `Message` (servi) et `Bulle` (`lib/realtime/
 * fil-etat.ts`, en direct) satisfont toutes deux. `envoi` est ABSENT sur un
 * message SERVI (il n'existe que sur une bulle) : son absence vaut « servi »,
 * jamais « en attente » — une ligne rechargée est toujours confirmée.
 */
export type CandidatDeMutation = {
  readonly deMoi: boolean;
  readonly systeme: boolean;
  readonly supprime: boolean;
  readonly protege: boolean;
  readonly ecritA?: string | null;
  readonly envoi?: 'servi' | 'en-attente' | 'hors-ligne' | 'en-echec';
};

const mienEtVivant = (candidat: CandidatDeMutation): boolean =>
  candidat.deMoi && !candidat.systeme && !candidat.supprime && !candidat.protege && (candidat.envoi ?? 'servi') === 'servi';

/**
 * « MODIFIER » N'EST OFFERT QUE SUR SES PROPRES MESSAGES, DE MOINS DE 24 H
 * (borne INCLUSIVE, comme la passerelle — § 2 de la spécification #5163).
 * Un rôle global (modérateur) n'est pas connu de ce prédicat : la v3 ne
 * l'offre pas (régime 3) ; un modérateur passe par le legacy.
 */
export const peutModifier = (candidat: CandidatDeMutation & { readonly maintenant: number }): boolean =>
  mienEtVivant(candidat) &&
  candidat.ecritA !== null &&
  candidat.ecritA !== undefined &&
  candidat.maintenant - Date.parse(candidat.ecritA) <= FENETRE_D_EDITION_MS;

/** « RETIRER » N'A PAS DE FENÊTRE DE TEMPS — seulement l'auteur, sur un message vivant, déjà servi. */
export const peutRetirer = (candidat: CandidatDeMutation): boolean => mienEtVivant(candidat);

export type Mutation =
  | { readonly genre: 'fait' }
  | { readonly genre: 'refus'; readonly message: string; readonly statut: number | null };

const REFUS_MODIFICATION = 'Le message n’a pas pu être modifié.';
const REFUS_RETRAIT = 'Le message n’a pas pu être retiré.';

/**
 * LA TRADUCTION DES REFUS DE MODIFICATION NOMMÉS — un site UNIQUE pour les
 * DEUX transports d'édition (`PUT /messages/:id` ci-dessous, et l'accusé du
 * socket `message:edit` relu par `envoieLaModification`, `fil-gestes.ts`),
 * qui portent chacun le MÊME refus sous un vocabulaire ANGLAIS différent —
 * « modify » côté REST (`routes/messages-writes.ts:160,196`), « edit » côté
 * socket (`MessageHandler.ts:825,908,923`). Une interface FRANÇAISE ne doit
 * jamais relayer une phrase anglaise (défaut #5163 §6) ; une raison DÉJÀ
 * française (410 « Cette conversation est terminée », les deux refus de
 * `DELETE`) traverse INCHANGÉE — ne rien traduire qu'on ne reconnaît pas,
 * plutôt que de deviner.
 */
const REFUS_NOMMES: ReadonlyMap<string, string> = new Map([
  ['Message not found or you are not authorized to modify it', REFUS_MODIFICATION],
  ['Message not found or you are not authorized to edit it', REFUS_MODIFICATION],
  ['You can no longer edit this message (24-hour limit exceeded)', 'Ce message ne peut plus être modifié : la fenêtre de 24 heures est dépassée.'],
  ['Message content cannot be empty (unless attachments are included)', 'Le message est vide.'],
]);

export const traduitLeRefusServi = (message: string): string => REFUS_NOMMES.get(message) ?? message;

/**
 * `PUT /api/v1/messages/:messageId` (`routes/messages-writes.ts:127`,
 * `requiredAuth` avec `allowAnonymous: false` — § 2 : un invité n'a JAMAIS
 * cette capacité). Fail-closed : un invité qui poste `modifie` reçoit ce
 * refus SANS qu'aucune requête ne parte (dimension 1, la passerelle
 * refuserait de toute façon — ne pas payer une 401 en 3G).
 */
export const modifie = async ({
  creance,
  messageId,
  texte,
  base,
  recuperer,
}: {
  readonly creance: Creance;
  readonly messageId: string;
  readonly texte: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Mutation> => {
  if (creance.genre === 'invite') return { genre: 'refus', message: REFUS_MODIFICATION, statut: 403 };
  const reponse = await demande(`${base ?? baseDeLaPasserelle()}/api/v1/messages/${encodeURIComponent(messageId)}`, creance, recuperer, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: texte }),
  });
  if (reponse === null) return { genre: 'refus', message: REFUS_MODIFICATION, statut: null };
  const enveloppe = objet(await reponse.json().catch(() => null));
  if (enveloppe?.success === true) return { genre: 'fait' };
  return {
    genre: 'refus',
    message: traduitLeRefusServi(chaine(objet(enveloppe?.error)?.message) ?? chaine(enveloppe?.message) ?? REFUS_MODIFICATION),
    statut: reponse.status,
  };
};

/** `DELETE /api/v1/messages/:messageId` (`routes/messages-writes.ts:428`) — même garde fail-closed que `modifie`. */
export const retire = async ({
  creance,
  messageId,
  base,
  recuperer,
}: {
  readonly creance: Creance;
  readonly messageId: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Mutation> => {
  if (creance.genre === 'invite') return { genre: 'refus', message: REFUS_RETRAIT, statut: 403 };
  const reponse = await demande(`${base ?? baseDeLaPasserelle()}/api/v1/messages/${encodeURIComponent(messageId)}`, creance, recuperer, {
    method: 'DELETE',
  });
  if (reponse === null) return { genre: 'refus', message: REFUS_RETRAIT, statut: null };
  const enveloppe = objet(await reponse.json().catch(() => null));
  if (enveloppe?.success === true) return { genre: 'fait' };
  return {
    genre: 'refus',
    message: chaine(objet(enveloppe?.error)?.message) ?? chaine(enveloppe?.message) ?? REFUS_RETRAIT,
    statut: reponse.status,
  };
};
