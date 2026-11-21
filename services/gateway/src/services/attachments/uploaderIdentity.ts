import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'uploaderIdentity' });

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

/** Ce que ce module demande à Prisma, et rien de plus. */
export type UploaderIdentityPrisma = Pick<PrismaClient, 'participant'>;

/**
 * **QUI a déposé une pièce jointe, dans UN seul espace de clés (#20113).**
 *
 * `MessageAttachment.uploadedBy` avait deux écrivains et deux espaces : les
 * quatre sites de téléversement (`UploadProcessor` ×2, `tus-handler` ×2) y
 * posent l'identité de COMPTE, les deux sites de copie (`copyAttachments`,
 * `MessageProcessor.copyForwardedAttachments`) y posaient un `Participant.id`.
 *
 * Ce n'était pas un détail interne : le champ est SERVI aux clients — le schéma
 * de la galerie le décrit « *Uploader id — gates the delete affordance* » — et
 * seul le serveur peut faire la jointure `Participant → User` qui lui donnerait
 * un sens. Le web comparait donc `uploadedBy` à l'identifiant du lecteur et
 * CACHAIT le bouton sur une copie transférée, que la route de suppression
 * accordait pourtant (#13608).
 *
 * `GlobalAchievements` avait déjà tranché la sémantique voulue sans le savoir :
 * il compte sur `uploadedBy` **plutôt que** sur `message.sender.userId`,
 * « (indexé) … deux `$lookup` imbriqués par pièce jointe ». Ce site lit donc
 * `uploadedBy` comme un identifiant d'utilisateur, et c'est ce que les
 * écrivains de téléversement y mettent : **les écrivains de copie étaient la
 * déviation, pas la norme.**
 *
 * Deux responsabilités vivent ici, et elles ne se confondent pas :
 *  - {@link uploaderIdentityOf} / {@link resolveUploaderIdentity} ÉCRIVENT
 *    l'identité de compte (`userId ?? id`, la convention que le dépôt applique
 *    partout où une identité de participant sert de clé de compte) ;
 *  - {@link ownsAsUploader} RECONNAÎT les lignes héritées, écrites avant
 *    l'unification et que rien ne réécrit.
 */

/**
 * L'identité de compte d'un participant chargé.
 *
 * Le repli (participant absent) est le comportement d'AVANT l'unification, et
 * c'est délibéré : une ligne écrite ainsi reste reconnue par
 * {@link ownsAsUploader}, alors qu'échouer ferait naître une pièce sans
 * déposant — bien pire que l'ancien défaut.
 */
export function uploaderIdentityOf(
  participant: { readonly userId?: string | null } | null | undefined,
  fallbackParticipantId: string
): string {
  return participant?.userId ?? fallbackParticipantId;
}

/** La même, quand seul l'identifiant du participant est en main. */
export async function resolveUploaderIdentity(
  prisma: UploaderIdentityPrisma,
  participantId: string
): Promise<string> {
  try {
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      select: { userId: true },
    });
    return uploaderIdentityOf(participant, participantId);
  } catch (error: unknown) {
    logger.warn('uploader identity lookup failed — falling back to the participant id', { participantId, error });
    return participantId;
  }
}

/**
 * Le lecteur est-il le déposant de cette pièce ?
 *
 * Extraite de `routes/attachments/metadata.ts`, où #13608 l'avait écrite — et
 * où elle était restée PRIVÉE, sans autre appelant : la règle valait là où
 * quelqu'un l'avait récitée, et nulle part ailleurs.
 *
 * Depuis l'unification des écrivains, son second test ne sert plus qu'aux
 * lignes HÉRITÉES. Il ne peut pas partir pour autant : rien ne réécrit les
 * lignes déjà en base.
 *
 * Le `!= null` sur `participant.userId` et le refus en tête sur `userId` sont
 * un DURCISSEMENT par rapport à l'original (`participant?.userId === userId`),
 * pas un déplacement : sur l'arbre d'aujourd'hui aucun appelant ne passe une
 * identité nulle — tracé depuis `routes/attachments/metadata.ts` jusqu'à
 * `middleware/auth.ts`, la branche inscrite pose toujours un ObjectId — mais
 * la fonction est désormais PUBLIQUE, et le prochain appelant ne sera pas
 * gardé par cette trace.
 *
 * Elle reconnaît le propriétaire sous les deux identifiants, et **seulement
 * s'il s'agit de SON participant** : l'identifiant d'un participant d'autrui,
 * anonyme ou inconnu ne donne rien. Une lecture en échec refuse — fail-closed,
 * puisque le verdict ouvre l'accès.
 */
export async function ownsAsUploader(
  prisma: UploaderIdentityPrisma,
  uploadedBy: string | null | undefined,
  userId: string
): Promise<boolean> {
  // #20113 F6 — le refus explicite de l'APPELANT sans identité. Le `tsconfig`
  // du gateway porte `strictNullChecks: false` : la signature `userId: string`
  // accepte `null` et `undefined` sans erreur de compilation, et ce prédicat
  // OUVRE un accès. Il ne doit donc pas dépendre de ce qu'une comparaison
  // rendrait par chance.
  if (!userId) return false;
  if (!uploadedBy) return false;
  if (uploadedBy === userId) return true;
  if (!OBJECT_ID_PATTERN.test(uploadedBy)) return false;
  try {
    const participant = await prisma.participant.findUnique({
      where: { id: uploadedBy },
      select: { userId: true },
    });
    return participant?.userId != null && participant.userId === userId;
  } catch (error: unknown) {
    logger.warn('uploader participant lookup failed', { error });
    return false;
  }
}

/**
 * **Les DEUX espaces de clés qu'une pièce de CE compte a pu porter (#20129).**
 *
 * {@link ownsAsUploader} répond pour UNE ligne, par une jointure. Une requête à
 * l'échelle d'un compte entier ne peut pas joindre : elle doit apparier, et
 * `uploadedBy: userId` n'apparie que les lignes écrites APRÈS l'unification de
 * #20113. Les lignes héritées — les copies transférées, écrites avec un
 * `Participant.id` — y sont invisibles, et deux sites rataient ce que personne
 * ne peut rattraper plus tard :
 *
 *  - l'**export RGPD** (art. 15) ne contenait pas les médias transférés du
 *    compte ;
 *  - la **purge** de fin de période de grâce ne voyait pas leurs octets.
 *
 * Aucune migration n'est requise pour cela : la clé qui les trouve est
 * l'identifiant des participants du compte, que l'export calcule DÉJÀ pour ses
 * sections voisines. C'est la projection du paramètre, pas la donnée, qui
 * rendait la réponse impossible en aval (leçon 276).
 *
 * `userId` figure TOUJOURS dans les clés rendues, même quand la liste des
 * participants est vide ou que sa lecture a échoué : l'espace nominal ne dépend
 * pas d'une lecture auxiliaire.
 */
export function uploadedByOfAccount(
  userId: string,
  participantIds: readonly string[]
): { in: string[] } {
  return { in: [...new Set([userId, ...participantIds])].filter((key) => !!key) };
}

/** Participants lus par fournée : une liste bornée, jamais un `findMany` nu. */
const PARTICIPANT_KEY_BATCH = 200;

/**
 * Les clés d'un compte, par fournées, pour un balayage qui n'a que son
 * `userId` en main (la purge de fin de grâce).
 *
 * Pourquoi des FOURNÉES et non une liste : le nombre de participations d'un
 * compte est le nombre de conversations qu'il a rejointes — borné par
 * construction, mais par rien d'écrit. Un `findMany` nu rejoindrait la dette
 * gelée par `unbounded-findmany-guard.test.ts`, et un `take` SEUL tronquerait en
 * silence, c'est-à-dire laisserait des octets d'un compte supprimé hors de
 * portée de tout balayage futur. La pagination rend les deux impossibles.
 *
 * Elle est stable sans curseur : rien ne supprime de ligne `Participant` pendant
 * la purge — `purgeAccountIsolatedData` les garde délibérément, « ce qu'un AUTRE
 * participant continue de VOIR ».
 *
 * Chaque fournée porte `userId`, donc la toute première purge l'espace nominal
 * quoi qu'il arrive. Une lecture en ÉCHEC rend exactement le comportement
 * d'avant #20129 (le compte seul) plutôt que rien : la fournée manquée est
 * rejouée par la passe de maintenance suivante.
 */
export async function* accountUploaderKeyBatches(
  prisma: UploaderIdentityPrisma,
  userId: string,
  batchSize: number = PARTICIPANT_KEY_BATCH
): AsyncGenerator<{ in: string[] }> {
  let skip = 0;
  let yielded = false;

  for (;;) {
    let rows: Array<{ id: string }>;
    try {
      rows = await prisma.participant.findMany({
        where: { userId },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: batchSize,
        skip,
      });
    } catch (error: unknown) {
      logger.warn('account participant keys lookup failed — account key only for this pass', { userId, error });
      if (!yielded) yield uploadedByOfAccount(userId, []);
      return;
    }

    if (rows.length === 0) {
      if (!yielded) yield uploadedByOfAccount(userId, []);
      return;
    }

    yield uploadedByOfAccount(userId, rows.map((row) => row.id));
    yielded = true;

    if (rows.length < batchSize) return;
    skip += rows.length;
  }
}
