import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';

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
 */

/**
 * La seule lecture que la décision demande, en structural : le double de test
 * reste trivial et l'unité n'importe pas `PrismaClient`.
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
        effectFlags: true;
        ephemeralDuration: true;
        expiresAt: true;
        createdAt: true;
        _count: { select: { attachments: true } };
      };
    }): Promise<ForwardSourceRow | null>;
  };
}

export interface ForwardSourceRow {
  readonly isViewOnce?: boolean | null;
  readonly effectFlags?: number | null;
  readonly ephemeralDuration?: number | null;
  readonly expiresAt?: Date | null;
  readonly createdAt?: Date | null;
  /** Ce que la copie serveur des pièces jointes pourra donner au transfert. */
  readonly _count?: { readonly attachments: number } | null;
}

export interface ForwardAdmissionParams {
  /** Absent quand l'envoi n'est pas un transfert — le cas très majoritaire. */
  readonly forwardedFromId?: string;
  /** L'instant de l'envoi du transfert. D'où repart le minuteur hérité. */
  readonly at: Date;
  /**
   * Le message envoyé n'a AUCUN corps propre — ni texte, ni `attachmentIds`,
   * ni payload chiffré : il n'existera que par ce que la source lui donne.
   * Absent (défaut) = le message porte déjà son corps, et rien de ce que dit
   * la source ne peut le vider.
   */
  readonly bodyOnlyFromSource?: boolean;
}

export type ForwardRefusal = 'view-once-not-forwardable' | 'forward-source-unavailable';

export type ForwardAdmission =
  | {
      readonly admitted: true;
      /**
       * La DURÉE héritée de la source, en secondes. Absente si elle n'était pas
       * éphémère. Ce n'est plus une échéance : le serveur la dérive à la
       * réception de chaque destinataire (#7451).
       */
      readonly ephemeralDuration?: number;
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

const ADMITTED_WITHOUT_INHERITANCE: ForwardAdmission = { admitted: true };
const SOURCE_UNAVAILABLE: ForwardAdmission = {
  admitted: false,
  reason: 'forward-source-unavailable'
};

const hasFlag = (effectFlags: number | null, bit: number): boolean =>
  ((effectFlags ?? 0) & bit) !== 0;

/**
 * Ce que l'appelant dit au sender quand la règle refuse. Même forme que
 * `describeConversationWriteRefusal` — le motif est une donnée, sa phrase
 * appartient à ce module.
 */
export const describeForwardRefusal = (refusal: ForwardRefused): string => {
  switch (refusal.reason) {
    case 'forward-source-unavailable':
      return 'Le message d’origine n’est plus disponible : rien à transférer';
    case 'view-once-not-forwardable':
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
 */
export async function admitMessageForward(
  prisma: ForwardSourceReader,
  params: ForwardAdmissionParams,
): Promise<ForwardAdmission> {
  if (!params.forwardedFromId) return ADMITTED_WITHOUT_INHERITANCE;

  let source: ForwardSourceRow | null;
  try {
    source = await prisma.message.findUnique({
      where: { id: params.forwardedFromId },
      select: {
        isViewOnce: true,
        effectFlags: true,
        // La colonne d'abord (#7451) ; les deux suivantes ne servent plus qu'au
        // repli legacy, pour les lignes écrites avant qu'elle n'ait un écrivain.
        ephemeralDuration: true,
        expiresAt: true,
        createdAt: true,
        // Compté par CETTE lecture, pas par une seconde : le chemin nominal
        // (envoi ordinaire) n'y passe même pas, `forwardedFromId` étant absent.
        _count: { select: { attachments: true } },
      },
    });
  } catch {
    return params.bodyOnlyFromSource ? SOURCE_UNAVAILABLE : ADMITTED_WITHOUT_INHERITANCE;
  }

  if (!source) {
    return params.bodyOnlyFromSource ? SOURCE_UNAVAILABLE : ADMITTED_WITHOUT_INHERITANCE;
  }

  // La colonne ET le bit : `saveMessage` renseigne les deux, mais un client qui
  // n'aurait envoyé que `effectFlags` doit être tenu par la même règle — sinon
  // le contournement ne coûte qu'un champ.
  if (source.isViewOnce === true || hasFlag(source.effectFlags, MESSAGE_EFFECT_FLAGS.VIEW_ONCE)) {
    return { admitted: false, reason: 'view-once-not-forwardable' };
  }

  // Dit APRÈS la vue unique : des deux motifs, celui-là est le moins
  // informatif pour l'expéditeur.
  if (params.bodyOnlyFromSource && (source._count?.attachments ?? 0) === 0) {
    return SOURCE_UNAVAILABLE;
  }

  const inherited = inheritedDuration(source);
  if (inherited === null) return ADMITTED_WITHOUT_INHERITANCE;

  return { admitted: true, ephemeralDuration: inherited };
}

/**
 * La durée de la source, en secondes — la colonne, ou le repli legacy.
 *
 * Le repli borne à zéro : une distance négative (décalage d'horloge, ou client
 * qui avait envoyé une échéance déjà passée) ne doit en aucun cas faire vivre la
 * copie PLUS que l'original. Une durée nulle n'étant pas une durée, la copie
 * dégénère alors en message ordinaire plutôt qu'en message immortel — le même
 * arbitrage que `normalizeEphemeralDuration`, qui refuse zéro.
 */
function inheritedDuration(source: ForwardSourceRow): number | null {
  const { ephemeralDuration, expiresAt, createdAt } = source;
  if (typeof ephemeralDuration === 'number' && Number.isFinite(ephemeralDuration) && ephemeralDuration > 0) {
    return Math.floor(ephemeralDuration);
  }

  if (!(expiresAt instanceof Date) || !(createdAt instanceof Date)) return null;

  const seconds = Math.floor(Math.max(0, expiresAt.getTime() - createdAt.getTime()) / 1000);
  return seconds > 0 ? seconds : null;
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
