import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'sharedTranslationErasure' });

/** Combien d'identifiants un journal d'échec nomme — un lot de 200 ne s'imprime pas en entier. */
const LOGGED_MESSAGE_IDS_MAX = 20;

/**
 * L'EFFACEMENT des traductions partagées (#9899) — le pendant, sur la table
 * `SharedTranslation`, de ce que chaque écrivain fait déjà de
 * `Message.translations`.
 *
 * ## Pourquoi cette unité existe
 *
 * Une traduction partagée est la version SCELLÉE d'un message que les appareils
 * des membres se passent par la passerelle (`routes/conversations/shared-translations.ts`).
 * Elle vit dans sa PROPRE table, à côté de `Message.translations` (les
 * traductions du SERVEUR), et c'est précisément ce voisinage qui l'a fait
 * survivre : chaque écrivain qui retire ou périme un message vide
 * `translations: null` — sa propre table de traductions — sans jamais regarder
 * la table voisine. Mesuré à l'audit : la ligne survivait à la suppression, à
 * l'édition, à l'échéance d'un éphémère, à la purge d'une vue unique, à
 * l'anonymisation des messages d'un compte supprimé, et à la purge du compte
 * qui l'avait partagée. Le texte d'un message supprimé restait lisible, pour
 * qui détenait la clé, aussi longtemps que la base le gardait.
 *
 * ## Deux entrées, deux sorts de panne
 *
 * - {@link eraseSharedTranslations} — par MESSAGE. BEST-EFFORT, comme
 *   `applyMessageRemovalEffects` qui l'appelle : quand elle s'exécute, l'écriture
 *   de la personne (`deletedAt`, `editedAt`, le contenu vidé) est DÉJÀ
 *   committée. Une panne ici ne doit jamais la transformer en 500 — le message
 *   est retiré, c'est l'invariant qui compte. Le prix est connu et accepté : une
 *   ligne orpheline qu'un client ne sait plus joindre (la lecture est servie pour
 *   la version COURANTE du message seule, et un message supprimé n'a plus de
 *   version servie).
 * - {@link eraseSharedTranslationsOfAccount} — par COMPTE. La purge d'un compte
 *   propage ses pannes (`purgeAccountIsolatedData` : `Promise.all` sans
 *   `.catch`), et ses deux appelants les journalisent puis REJOUENT à la passe
 *   suivante. Se taire ici ferait compter comme purgé un compte dont des
 *   contributions subsistent.
 */

/** Le seul délégué que l'effacement par message lit — un double de test n'a que lui à fournir. */
export type SharedTranslationErasureClient = Pick<PrismaClient, 'sharedTranslation'>;

/** Le délégué `participant` s'ajoute pour l'effacement par compte : `sharedById` est un `Participant.id`. */
export type SharedTranslationAccountErasureClient = Pick<PrismaClient, 'participant' | 'sharedTranslation'>;

export type SharedTranslationErasure = {
  readonly messageIds: readonly string[];
  /**
   * La version de la source qu'une ÉDITION vient d'écrire, et que l'effacement
   * doit épargner : toutes les AUTRES versions du message sont périmées (leur
   * texte source n'est plus celui que le message porte). Absent ⇒ toutes les
   * versions partent — suppression, échéance, purge, anonymisation.
   *
   * Une ligne de la version COURANTE n'est jamais effacée par une édition : elle
   * a pu être partagée par un appareil entre l'écriture de l'édition et cet
   * appel, et c'est la seule que le serveur sert encore.
   */
  readonly keepSourceVersion?: string;
};

/**
 * Efface les traductions partagées des messages nommés — toutes leurs
 * langues, et toutes leurs versions sauf `keepSourceVersion`.
 *
 * Une liste vide n'émet AUCUNE requête, et c'est une garde, pas une
 * économie : `deleteMany({ where: { messageId: { in: [] } } })` est correct sous
 * Prisma, mais un `where` que l'appelant a oublié de construire viderait la
 * table de TOUTES les conversations. La seule façon de ne jamais l'émettre est
 * de ne jamais appeler la base quand il n'y a rien à nommer.
 */
export async function eraseSharedTranslations(
  prisma: SharedTranslationErasureClient,
  { messageIds, keepSourceVersion }: SharedTranslationErasure
): Promise<void> {
  if (messageIds.length === 0) return;

  try {
    await prisma.sharedTranslation.deleteMany({
      where: {
        messageId: { in: [...messageIds] },
        ...(keepSourceVersion ? { sourceVersion: { not: keepSourceVersion } } : {}),
      },
    });
  } catch (err) {
    log.warn('shared translations: erasure failed', {
      messageIds: messageIds.slice(0, LOGGED_MESSAGE_IDS_MAX),
      messageCount: messageIds.length,
      keepSourceVersion,
      err,
    });
  }
}

/**
 * Efface les traductions que les participants d'un COMPTE ont partagées, dans
 * toutes ses conversations, et rend combien de lignes sont parties (le bilan
 * de la purge).
 *
 * `SharedTranslation.sharedById` est un `Participant.id` — l'espace de
 * `Message.senderId` — jamais un `User.id` : un compte a UN participant par
 * conversation, et c'est la requête sur `userId` qui les nomme tous. Ceux qui
 * ont QUITTÉ une conversation, ou en ont été exclus, comptent aussi : la ligne
 * partagée avant leur départ ne les a pas suivis.
 *
 * Les traductions que d'AUTRES participants ont partagées — y compris sur les
 * messages du compte — ne sont pas visées ici : elles suivent le message
 * (`eraseSharedTranslations`, appelé par l'anonymisation).
 *
 * Une panne PROPAGE (voir l'en-tête du module). Un compte sans participant
 * n'émet aucun `deleteMany` : `sharedById: { in: [] }` ne désigne rien, et le
 * seul `where` qui pourrait lui répondre par erreur est un `where` vide.
 */
export async function eraseSharedTranslationsOfAccount(
  prisma: SharedTranslationAccountErasureClient,
  userId: string
): Promise<number> {
  const participants = await prisma.participant.findMany({ where: { userId }, select: { id: true } });
  if (participants.length === 0) return 0;

  const erased = await prisma.sharedTranslation.deleteMany({
    where: { sharedById: { in: participants.map((participant) => participant.id) } },
  });
  return erased.count;
}
