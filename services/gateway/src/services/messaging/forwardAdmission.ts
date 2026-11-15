import {
  contentExitLawOfSource,
  forwardedCopyProtection,
  type ContentExitProjection,
} from '@meeshy/shared/utils/content-exit-law';
import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';
import { FORWARD_REFUSAL_CODES, type ForwardRefusalCode } from '@meeshy/shared/types/forward-refusal';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { loadMessageReadableByParticipant, type ReaderVisibleMessageRow } from './messageReadAccess';
import { refusesContentGesture } from './captureNoticeVisibility';

/**
 * Ce qui empêche le transfert de défaire ce que les cycles 92 et 93 ont détruit.
 *
 * Transférer un message crée une ligne `Message` INDÉPENDANTE :
 * `forwardedFromId` ne pointe que vers l'origine, il ne transporte aucun état.
 * La copie naissait donc sans `expiresAt`, sans `isViewOnce` et sans bit
 * `EPHEMERAL` — en clair, sans échéance et sans budget. Le balayage éphémère
 * détruisait consciencieusement l'original à l'heure dite pendant que la copie,
 * faite deux secondes après réception, restait lisible pour toujours dans une
 * autre conversation.
 *
 * Aucun garde ne s'y opposait à AUCUN des trois transports d'envoi (REST,
 * socket texte, socket pièces jointes) : `forwardedFromId` traversait
 * `MessagingService.handleMessage` sans qu'une seule ligne de code serveur ne
 * lise l'état de la source. Côté clients, `MessageActionResolver` propose
 * `.forward` INCONDITIONNELLEMENT — la promesse n'était donc pas même respectée
 * par convention. Contrairement aux deux défauts précédents de la même veine,
 * celui-ci ne demandait pas un client modifié : un appui long suffisait.
 *
 * C'est la même question que celle ouverte au cycle 92, posée au dernier champ
 * de la famille : *qui, côté serveur, fait respecter cette promesse ?*
 *
 * ─── LES DEUX PROMESSES N'ONT PAS LA MÊME RÉPONSE, ET CE N'EST PAS UN CHOIX ──
 *
 * La tête du cycle 93 laissait ouvert « propager ou refuser ». Ce n'est pas une
 * préférence produit : chaque promesse force sa réponse, et elles diffèrent.
 *
 * **Éphémère → propager.** La copie hérite de la DURÉE de l'original, dont le
 * décompte repartira de la réception de chaque nouveau destinataire. Le compte
 * repart de zéro parce que les nouveaux destinataires n'ont rien vu : leur
 * servir les 3 secondes résiduelles d'un minuteur de 24 h ne voudrait rien
 * dire. La copie meurt, et elle meurt TRANSITIVEMENT — la copie étant à son
 * tour une source éphémère bien formée, un transfert de transfert conserve la
 * durée sans érosion, sans que ce module ait à remonter la chaîne.
 *
 * **Vue unique → refuser.** Propager ne fermerait RIEN : `viewOnceCount` repart
 * à zéro sur la ligne neuve. Se transférer à soi-même une photo à vue unique
 * rendrait un budget de vues neuf, autant de fois que voulu — la propagation
 * reconduit la promesse en la vidant de son sens. Seul le refus la tient.
 * C'est aussi ce que font WhatsApp et Signal, qui interdisent l'un comme
 * l'autre le transfert d'un contenu à vue unique.
 *
 * ─── LA DURÉE SE LIT, ET NE SE RECALCULE QUE POUR LE LEGACY (#7451) ─────────
 *
 * Ce module a d'abord dérivé la durée d'`expiresAt − createdAt`, en écrivant sa
 * raison : `Message.ephemeralDuration` existait au schéma et n'avait AUCUN
 * écrivain. Elle en a un depuis #7451 — et la dérivation est devenue FAUSSE dans
 * le même mouvement : `expiresAt` ne porte plus l'échéance du client mais
 * l'heure de DESTRUCTION, qui vaut le plafond de rétention (sept jours) tant que
 * personne n'a reçu. Transférer un éphémère de trente secondes en aurait fait
 * une copie de sept jours, sans qu'un seul témoin ne tombe.
 *
 * La colonne prime donc, et `expiresAt − createdAt` reste le repli pour les
 * lignes écrites AVANT ce lot, qui n'ont pas de durée. Ce qui voyage vers
 * `saveMessage` est la DURÉE, jamais une échéance : c'est le serveur qui décide
 * de l'échéance, à la réception de chacun.
 *
 * ─── BEST-EFFORT DÉLIBÉRÉ, ET SA SEULE EXCEPTION ────────────────────────────
 *
 * Une source introuvable (purgée, id fabriqué) ou une lecture qui échoue
 * n'interrompt pas l'envoi : le transfert dégénère en message ordinaire, ce qui
 * est le comportement d'avant ce module et ne fuit rien de plus. Transformer un
 * envoi en erreur parce que la base a hoqueté coûterait plus que ce que ce
 * garde protège.
 *
 * Sauf quand le message n'a QUE la source pour corps (`bodyOnlyFromSource`) :
 * un transfert de média n'envoie ni texte, ni `attachmentIds`, ni payload
 * chiffré — ses pièces jointes sont copiées côté serveur. Dégénérer y produit
 * une ligne `Message` sans contenu, sans pièce jointe et sans chiffré, créée
 * puis diffusée : une bulle vide et irrécupérable chez tous les destinataires.
 * Le refus est alors le seul comportement qui ne détruit rien, et le sachant
 * ne coûte AUCUNE lecture de plus — la même requête compte les pièces jointes
 * de la source au passage.
 *
 * ─── LA LOI DE SORTIE DÉCIDE, CE MODULE LUI REMET LA SOURCE (#9572) ─────────
 *
 * Trois sorties restaient ouvertes après ce qui précède : une flamme APRÈS
 * LECTURE se transférait en copie de sept jours sans son bit (elle n'a pas de
 * durée, et `expiresAt − createdAt` y lit le plafond de rétention) ; une PIÈCE
 * en vue unique sous un message qui ne l'est pas passait la garde ; le flou de
 * la copie venait de la requête. Le verdict vient désormais de
 * `contentExitLaw` (`@meeshy/shared`), lue sur le message ET sur ses pièces,
 * et ce module rend ce que la source IMPOSE à la copie — `saveMessage`
 * l'applique après la contagion des réponses, pour qu'aucune des deux règles
 * ne desserre l'autre. Une source déclarée éphémère dont la durée ne se lit
 * pas est REFUSÉE : elle dégénérait en copie ordinaire, donc immortelle. Le
 * repli `expiresAt − createdAt` décrit plus haut est RETIRÉ pour la même
 * raison : il lisait sept jours sur toute ligne sans colonne de durée.
 *
 * La dégradation en message ordinaire (source introuvable ou illisible, corps
 * fourni par le client) se DIT : `sourceUnavailable`. L'appelant retire alors
 * `forwardedFromId`, sans quoi `saveMessage` recopierait les pièces d'une
 * source dont on n'a pas pu lire la protection.
 *
 * ─── ON NE TRANSFÈRE QUE CE QU'ON A LE DROIT DE LIRE (#9579) ────────────────
 *
 * Tout ce qui précède lit ce que la source IMPOSE. Rien ne demandait si
 * l'EXPÉDITEUR a le droit de la lire — or un transfert en tire des pièces
 * recopiées, puis une provenance que le fil sert. Ce droit se juge EN PREMIER,
 * par la loi de lecture de la messagerie (`messageReadAccess.ts`) : participant
 * actif de la conversation de la source, message non supprimé, historique ni
 * borné ni masqué pour lui — et contenu encore à SON écran : un éphémère dont
 * son décompte est fini, une flamme qu'il a consommée, une vue unique qu'il a
 * ouverte ne se désignent plus (borne de la bulle, sans la grâce du service).
 *
 * Une source que l'expéditeur ne lit pas est une source INDISPONIBLE — le même
 * verdict qu'un identifiant qui ne désigne rien, pour qu'aucune réponse ne
 * distingue « n'existe pas » de « existe, mais pas pour toi ». Elle ne passe
 * donc jamais par la loi de sortie : sa nature ne se dit pas à qui ne la lit
 * pas. Et une lecture d'accès qui échoue ferme de la même façon — ce droit-là
 * n'a pas de best-effort.
 *
 * La CONVERSATION de provenance suit la même loi : c'est un fait lu sur la
 * source, jamais une déclaration. `provenanceConversationId` n'est rendu que
 * si l'envoi nomme la conversation où la source vit réellement.
 *
 * ─── UNE PIÈCE, OU UN SOUS-ENSEMBLE (#9914) ─────────────────────────────────
 *
 * `forwardedAttachmentIds` nomme les pièces de la source à recopier. Absent :
 * tout le lot, comme avant. Présent : chaque id doit être une pièce DE CE
 * message (sinon `forwarded-attachment-not-in-source`) — et la loi de sortie
 * se lit alors sur le message et sur les SEULES pièces choisies : une pièce
 * ordinaire voisine d'une pièce à vue unique se transfère seule (D6), la pièce
 * à vue unique jamais, et le message lui-même protégé ferme tout. Le verdict
 * `copySelection` dit à `saveMessage` ce qu'il recopie — jamais la requête.
 *
 * ─── UNE SOURCE CHIFFRÉE NE SE COPIE JAMAIS ICI (D7, #10949) ────────────────
 *
 * Conversation chiffrée (`encryptionEnabledAt` ou `encryptionMode`), message
 * chiffré (`isEncrypted`, `encryptionMode`) ou pièce chiffrée : la passerelle
 * ne recopie rien de la source. Un transfert qui n'en vivrait que de cette
 * copie est REFUSÉ (`encrypted-source-not-server-copyable`) ; celui dont le
 * CLIENT renvoie lui-même le contenu (rechiffré pour une destination chiffrée,
 * en clair après avertissement pour une autre) est admis avec
 * `copySelection: []`. Une projection non chargée vaut chiffrée — l'absence
 * ne prouve rien.
 */

/**
 * La seule lecture que la LOI DE SORTIE demande, en structural : son double de
 * test reste trivial. Le droit de lire, lui, passe par `messageReadAccess.ts`
 * et le vrai client (#9579).
 *
 * Le `select` est typé en littéraux `true` — et non en `Record<string, boolean>`
 * — pour que la surcharge générique de Prisma résolve la ligne rendue. La forme
 * large compile ici mais fait échouer l'appelant qui passe le vrai client.
 */
export interface ForwardSourceReader {
  message: {
    findUnique(args: {
      where: { id: string };
      select: {
        isViewOnce: true;
        isBlurred: true;
        effectFlags: true;
        ephemeralDuration: true;
        expiresAt: true;
        isEncrypted: true;
        encryptionMode: true;
        conversation: { select: { encryptionEnabledAt: true; encryptionMode: true } };
        attachments: {
          select: { id: true; isViewOnce: true; isBlurred: true; effectFlags: true; isEncrypted: true; encryptionMode: true };
        };
        _count: { select: { attachments: true } };
        messageType: true;
        metadata: true;
      };
    }): Promise<ForwardSourceRow | null>;
  };
}

/** La projection ENTIÈRE qu'exige la loi de sortie côté serveur, et le compte des pièces. */
export interface ForwardSourcePiece {
  readonly id?: string;
  readonly isViewOnce: boolean | null;
  readonly isBlurred: boolean | null;
  readonly effectFlags: number | null;
  readonly isEncrypted?: boolean | null;
  readonly encryptionMode?: string | null;
}

export interface ForwardSourceRow extends ContentExitProjection {
  readonly attachments: ReadonlyArray<ForwardSourcePiece>;
  /** D7 — de quoi savoir que la source est chiffrée. Absent ⇒ chiffrée (fail-closed). */
  readonly isEncrypted?: boolean | null;
  readonly encryptionMode?: string | null;
  readonly conversation?: { readonly encryptionEnabledAt: Date | null; readonly encryptionMode: string | null } | null;
  /** #9629 — de quoi reconnaître un avis de capture, qui ne se transfère pas. */
  readonly messageType?: string | null;
  readonly metadata?: unknown;
  readonly expiresAt: Date | null;
  /** Ce que la copie serveur des pièces jointes pourra donner au transfert. */
  readonly _count?: { readonly attachments: number } | null;
}

export interface ForwardAdmissionParams {
  /** Absent quand l'envoi n'est pas un transfert — le cas très majoritaire. */
  readonly forwardedFromId?: string;
  /**
   * La ligne `Participant` de l'expéditeur (#9579). REQUISE : c'est lui qui
   * doit pouvoir lire la source, et sans lui personne ne la lit.
   */
  readonly senderParticipantId: string;
  /** La conversation de provenance que l'envoi DÉCLARE — retenue seulement si la source y vit. */
  readonly forwardedFromConversationId?: string;
  /** L'instant de l'envoi du transfert. D'où repart le minuteur hérité. */
  readonly at: Date;
  /**
   * Le message envoyé n'a AUCUN corps propre — ni texte, ni `attachmentIds`,
   * ni payload chiffré : il n'existera que par ce que la source lui donne.
   * Absent (défaut) = le message porte déjà son corps, et rien de ce que dit
   * la source ne peut le vider.
   */
  readonly bodyOnlyFromSource?: boolean;
  /**
   * #9914 — les pièces de la source à recopier, dans l'ordre voulu. Absent :
   * tout le lot. Chaque id doit appartenir au message source.
   */
  readonly forwardedAttachmentIds?: readonly string[];
  /**
   * #10987 — la requête apporte ses PROPRES pièces (`attachmentIds` /
   * `attachments`) ou son enveloppe chiffrée : le client a lui-même rendu ce
   * que la passerelle ne peut pas recopier d'une source chiffrée. Absent
   * (défaut) = rien de tel, et une source chiffrée qui porte des pièces est
   * refusée plutôt que d'arriver sans elles.
   */
  readonly bringsOwnPieces?: boolean;
}

/** Le motif EST le code stable servi au client (#9598). */
export type ForwardRefusal = ForwardRefusalCode;

/**
 * Ce que la source IMPOSE à sa copie, en sujet de la loi de sortie : sa durée
 * (nulle quand elle n'est pas une flamme) et son flou. `forwardedCopyFields`
 * le compose avec ce que l'envoi déclare.
 */
export interface ForwardImposition {
  readonly ephemeralDuration: number | null;
  readonly isBlurred: boolean;
}

export type ForwardAdmission =
  | {
      readonly admitted: true;
      /**
       * `null` : la source a été LUE et n'impose rien. Absent : aucune source
       * n'a été lue (pas un transfert, ou `sourceUnavailable`). La durée n'est
       * jamais une échéance : le serveur la dérive à la réception (#7451).
       */
      readonly imposes?: ForwardImposition | null;
      /**
       * La conversation de provenance PROUVÉE (#9579) : celle que l'envoi
       * déclare, quand la source y vit. Absente ⇒ rien n'est prouvé, et
       * l'appelant ne garde aucune conversation de provenance.
       */
      readonly provenanceConversationId?: string;
      /**
       * La source est introuvable ou illisible et le message porte son propre
       * corps : l'envoi dégénère en message ORDINAIRE. L'appelant DOIT alors
       * retirer `forwardedFromId` — rien de la source n'est recopié.
       */
      readonly sourceUnavailable?: true;
      /**
       * Ce que `saveMessage` recopie de la source (#9914, D7) : ces pièces-là,
       * dans cet ordre, et rien d'autre — `[]` ne recopie rien. Absent : tout
       * le lot (aucune sélection, source en clair).
       */
      readonly copySelection?: readonly string[];
    }
  | { readonly admitted: false; readonly reason: ForwardRefusal };

export type ForwardRefused = Extract<ForwardAdmission, { admitted: false }>;

/**
 * Le gateway compile en `strict: false`, où TypeScript ne rétrécit PAS une
 * union sur un discriminant littéral booléen : `if (!admission.admitted)`
 * laisse le type entier et `admission.reason` ne compile pas. Même prédicat
 * explicite que `isEditRefused` / `isDeleteRefused`, pour la même raison.
 */
export const isForwardRefused = (admission: ForwardAdmission): admission is ForwardRefused =>
  admission.admitted === false;

const NOT_A_FORWARD: ForwardAdmission = { admitted: true };
const DEGRADED_TO_ORDINARY: ForwardAdmission = { admitted: true, sourceUnavailable: true };
const SOURCE_UNAVAILABLE: ForwardAdmission = {
  admitted: false,
  reason: FORWARD_REFUSAL_CODES.SOURCE_UNAVAILABLE
};
const refused = (reason: ForwardRefusal): ForwardAdmission => ({ admitted: false, reason });

/**
 * Ce que l'appelant dit au sender quand la règle refuse. Même forme que
 * `describeConversationWriteRefusal` — le motif est une donnée, sa phrase
 * appartient à ce module.
 */
export const describeForwardRefusal = (refusal: ForwardRefused): string => {
  switch (refusal.reason) {
    case FORWARD_REFUSAL_CODES.SOURCE_UNAVAILABLE:
      return 'Le message d’origine n’est plus disponible : rien à transférer';
    case FORWARD_REFUSAL_CODES.EPHEMERAL:
      return 'Un message qui disparaît après lecture ne peut pas être transféré';
    case FORWARD_REFUSAL_CODES.ENCRYPTED_SOURCE:
      return 'Un message chiffré se transfère depuis l’appareil : la passerelle n’en copie rien';
    case FORWARD_REFUSAL_CODES.ATTACHMENT_NOT_IN_SOURCE:
      return 'Une pièce demandée n’appartient pas au message transféré';
    case FORWARD_REFUSAL_CODES.VIEW_ONCE:
    default:
      return 'Un message à vue unique ne peut pas être transféré';
  }
};

/**
 * La règle, pour les trois transports d'envoi à la fois.
 *
 * Appelée depuis `MessagingService.handleMessage`, le seul point où REST,
 * socket texte et socket pièces jointes convergent avant l'écriture — un garde
 * posé plus près de chaque route aurait été la quatrième copie d'une règle de
 * permission, exactement la maladie que `messageEditAdmission` soigne.
 *
 * Deux gardes INDÉPENDANTES, dans cet ordre : le droit de l'expéditeur à lire
 * la source (#9579), puis ce que la source impose à sa copie (#9572). La
 * seconde n'est jamais consultée pour une source que la première refuse.
 */
export async function admitMessageForward(
  prisma: ForwardSourceReader & PrismaClient,
  params: ForwardAdmissionParams,
): Promise<ForwardAdmission> {
  if (!params.forwardedFromId) return NOT_A_FORWARD;

  const readable = await sourceReadableBySender(prisma, {
    senderParticipantId: params.senderParticipantId,
    forwardedFromId: params.forwardedFromId,
    at: params.at,
  });
  if (!readable) return params.bodyOnlyFromSource ? SOURCE_UNAVAILABLE : DEGRADED_TO_ORDINARY;

  const admission = await admitReadableSource(prisma, params);
  if (isForwardRefused(admission) || admission.sourceUnavailable) return admission;
  if (params.forwardedFromConversationId !== readable.conversationId) return admission;
  return { ...admission, provenanceConversationId: readable.conversationId };
}

/**
 * Fermé sur tout ce qui n'est pas une preuve : expéditeur inconnu, source
 * introuvable, source que l'expéditeur ne lit pas ou dont le contenu a déjà
 * disparu POUR LUI (décompte fini, flamme consommée, vue unique ouverte),
 * lecture qui échoue — une seule réponse, `null`.
 */
async function sourceReadableBySender(
  prisma: PrismaClient,
  params: { readonly senderParticipantId: string; readonly forwardedFromId: string; readonly at: Date },
): Promise<ReaderVisibleMessageRow | null> {
  try {
    return await loadMessageReadableByParticipant(prisma, {
      participantId: params.senderParticipantId,
      messageId: params.forwardedFromId,
      now: params.at,
    });
  } catch {
    return null;
  }
}

async function admitReadableSource(
  prisma: ForwardSourceReader,
  params: ForwardAdmissionParams,
): Promise<ForwardAdmission> {
  if (!params.forwardedFromId) return NOT_A_FORWARD;

  let source: ForwardSourceRow | null;
  try {
    source = await prisma.message.findUnique({
      where: { id: params.forwardedFromId },
      select: {
        isViewOnce: true,
        isBlurred: true,
        effectFlags: true,
        // La colonne fait foi (#7451). `expiresAt` ne donne plus jamais la
        // durée : sa seule présence déclare un éphémère (#9572).
        ephemeralDuration: true,
        expiresAt: true,
        isEncrypted: true,
        encryptionMode: true,
        conversation: { select: { encryptionEnabledAt: true, encryptionMode: true } },
        attachments: {
          select: { id: true, isViewOnce: true, isBlurred: true, effectFlags: true, isEncrypted: true, encryptionMode: true },
        },
        // Compté par CETTE lecture, pas par une seconde : le chemin nominal
        // (envoi ordinaire) n'y passe même pas, `forwardedFromId` étant absent.
        _count: { select: { attachments: true } },
        messageType: true,
        metadata: true,
      },
    });
  } catch {
    return params.bodyOnlyFromSource ? SOURCE_UNAVAILABLE : DEGRADED_TO_ORDINARY;
  }

  if (!source) {
    return params.bodyOnlyFromSource ? SOURCE_UNAVAILABLE : DEGRADED_TO_ORDINARY;
  }

  // #9629 — un avis de capture n'est pas un contenu : il ne quitte pas sa
  // conversation, ni son audience. Refusé comme une source introuvable.
  if (refusesContentGesture({ messageType: source.messageType ?? null, metadata: source.metadata })) {
    return SOURCE_UNAVAILABLE;
  }

  const selection = selectedPieces(source, params.forwardedAttachmentIds);
  if (selection === 'foreign') return refused(FORWARD_REFUSAL_CODES.ATTACHMENT_NOT_IN_SOURCE);
  const judged: ForwardSourceRow = selection ? { ...source, attachments: selection.pieces } : source;

  // La loi lit la colonne ET le bit, sur le message ET sur chaque pièce : un
  // contournement ne doit pas coûter qu'un champ, ni qu'un niveau. Une
  // sélection (#9914) restreint les pièces lues, jamais le message.
  const { forward } = contentExitLawOfSource(judged);
  if (forward.allowed === false) {
    return refused(forward.reason === 'view-once' ? FORWARD_REFUSAL_CODES.VIEW_ONCE : FORWARD_REFUSAL_CODES.EPHEMERAL);
  }

  // D7 — dit APRÈS la nature : une vue unique chiffrée se refuse comme vue unique.
  // #10987 — un texte joint ne dispense pas : sans pièces propres, une source
  // chiffrée qui en porte arriverait sans elles, et l'expéditeur lirait « envoyé ».
  const encrypted = sourceIsEncrypted(judged);
  const copiable = selection ? selection.pieces.length : source._count?.attachments ?? 0;
  const wouldLosePieces = copiable > 0 && params.bringsOwnPieces !== true;
  if (encrypted && (params.bodyOnlyFromSource || wouldLosePieces)) return refused(FORWARD_REFUSAL_CODES.ENCRYPTED_SOURCE);

  // Dit APRÈS les refus de nature : des motifs, celui-là est le moins
  // informatif pour l'expéditeur.
  if (params.bodyOnlyFromSource && copiable === 0) {
    return SOURCE_UNAVAILABLE;
  }

  const copySelection = encrypted ? [] : selection?.ids;
  const withSelection = (admission: Extract<ForwardAdmission, { admitted: true }>): ForwardAdmission =>
    copySelection === undefined ? admission : { ...admission, copySelection };

  const unrequested = forwardedCopyProtection({ source: judged, requested: null });
  if (!unrequested) return refused(FORWARD_REFUSAL_CODES.EPHEMERAL);
  if (forward.maxDurationSeconds === null && !unrequested.isBlurred) return withSelection({ admitted: true, imposes: null });

  return withSelection({
    admitted: true,
    imposes: { ephemeralDuration: forward.maxDurationSeconds, isBlurred: unrequested.isBlurred },
  });
}

/**
 * Les pièces choisies, dans l'ordre demandé, doublons retirés. `null` : aucune
 * sélection (tout le lot). `'foreign'` : un id ne désigne aucune pièce de CE
 * message — refus, jamais une pièce prise ailleurs.
 */
function selectedPieces(
  source: ForwardSourceRow,
  requested: readonly string[] | undefined,
): { readonly ids: readonly string[]; readonly pieces: ReadonlyArray<ForwardSourcePiece> } | 'foreign' | null {
  if (!requested || requested.length === 0) return null;
  const ids = [...new Set(requested)];
  const pieces = ids.map((id) => (source.attachments ?? []).find((piece) => piece.id === id));
  if (pieces.some((piece) => piece === undefined)) return 'foreign';
  return { ids, pieces: pieces as ReadonlyArray<ForwardSourcePiece> };
}

/** D7 — fermé : toute marque de chiffrement, ou une projection non chargée, vaut chiffrée. */
function sourceIsEncrypted(source: ForwardSourceRow): boolean {
  const conversation = source.conversation;
  if (conversation == null || source.isEncrypted === undefined || source.encryptionMode === undefined) return true;
  if (conversation.encryptionEnabledAt != null || conversation.encryptionMode != null) return true;
  if (source.isEncrypted === true || source.encryptionMode != null) return true;
  return (source.attachments ?? []).some((piece) => piece.isEncrypted === true || piece.encryptionMode != null);
}

/**
 * Les références de transfert arrivent de clients hétérogènes : le picker iOS
 * historique envoyait `forwardedFromConversationId: ""` (`conversation?.id ??
 * ""`), et un rejeu hors-ligne peut porter l'id LOCAL d'un message optimiste
 * (`ofq_*`). Zod (`z.string().optional()`) les laisse passer ; Prisma
 * (`@db.ObjectId`) les refuse à l'ÉCRITURE — l'envoi mourait en « Erreur
 * interne » APRÈS validation. Une référence de CONVERSATION illisible
 * s'abandonne (la provenance est facultative) ; une référence de MESSAGE
 * illisible dégrade l'envoi en message ordinaire — le même best-effort que
 * `admitMessageForward` applique à une source introuvable.
 */
export function sanitizeForwardReferences<
  T extends { forwardedFromId?: string; forwardedFromConversationId?: string }
>(request: T): T {
  const forwardedFromId =
    request.forwardedFromId && isValidMongoId(request.forwardedFromId)
      ? request.forwardedFromId
      : undefined;
  const forwardedFromConversationId =
    request.forwardedFromConversationId && isValidMongoId(request.forwardedFromConversationId)
      ? request.forwardedFromConversationId
      : undefined;
  if (
    forwardedFromId === request.forwardedFromId &&
    forwardedFromConversationId === request.forwardedFromConversationId
  ) {
    return request;
  }
  return { ...request, forwardedFromId, forwardedFromConversationId };
}

/**
 * Ce que `handleMessage` pose sur l'envoi une fois le transfert ADMIS, à
 * répandre APRÈS la requête : le verdict remplace tout `forwardImposes` venu
 * d'un client, et une source indisponible retire les références de transfert —
 * l'envoi devient un message ordinaire, et `saveMessage` ne recopie rien.
 *
 * `forwardedFromConversationId` est TOUJOURS posé (#9579), sur les trois
 * sorties : la conversation que l'admission a prouvée, ou rien. Ce que la
 * requête déclarait ne survit jamais par défaut — ni sans message source, ni
 * à côté d'une source qui vit ailleurs.
 */
export function forwardedCopyRequest(
  request: { readonly forwardedFromId?: string },
  admission: Extract<ForwardAdmission, { admitted: true }>,
): {
  readonly forwardImposes: ForwardImposition | null | undefined;
  readonly forwardedFromId?: undefined;
  readonly forwardedFromConversationId: string | undefined;
  readonly forwardCopySelection: readonly string[] | undefined;
} {
  const none = { forwardImposes: undefined, forwardedFromConversationId: undefined, forwardCopySelection: undefined };
  if (!request.forwardedFromId) return none;
  if (admission.sourceUnavailable || admission.imposes === undefined) return { ...none, forwardedFromId: undefined };
  return {
    forwardImposes: admission.imposes,
    forwardedFromConversationId: admission.provenanceConversationId,
    forwardCopySelection: admission.copySelection,
  };
}
