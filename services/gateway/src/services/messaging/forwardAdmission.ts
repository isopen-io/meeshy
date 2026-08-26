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
 * **Éphémère → propager.** La copie hérite de la DURÉE de l'original
 * (`expiresAt − createdAt`), recomptée depuis l'envoi du transfert. Le compte
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
 * ─── POURQUOI LA DURÉE SE RECALCULE, ET NE SE LIT PAS ───────────────────────
 *
 * `Message.ephemeralDuration` existe au schéma et dit exactement ce qu'il
 * faudrait ici. Il est ÉCRIT PAR PERSONNE : aucun des trois transports ne le
 * transmet, `MessageProcessor.saveMessage` ne le range pas, et il vaut `null`
 * sur toute la collection. S'y fier aurait rendu ce module inopérant en
 * silence. `expiresAt − createdAt` reconstitue la même valeur à partir de deux
 * colonnes réellement peuplées — c'est la seule source de vérité disponible.
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
      /** L'échéance héritée de la source. Absente si elle n'était pas éphémère. */
      readonly expiresAt?: Date;
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

  const { expiresAt, createdAt } = source;
  if (!(expiresAt instanceof Date) || !(createdAt instanceof Date)) {
    return ADMITTED_WITHOUT_INHERITANCE;
  }

  // Une durée négative — décalage d'horloge, ou client qui a envoyé une échéance
  // déjà passée — rend la copie immédiatement échue plutôt que durable : elle ne
  // doit en aucun cas vivre PLUS que l'original.
  const lifespanMs = Math.max(0, expiresAt.getTime() - createdAt.getTime());

  return { admitted: true, expiresAt: new Date(params.at.getTime() + lifespanMs) };
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
