/**
 * **Rattrapage des droits vidéo/audio d'un ENTRANT PAR LIEN — anonyme ou nommé
 * (#6091).**
 *
 * `routes/conversations/link-admission.ts` inventait `canSendVideos: false,
 * canSendAudios: false` sur les DEUX portes d'entrée par lien, sans jamais
 * consulter le lien : ni `allowAnonymousFiles` (qui gouverne déjà la vidéo,
 * une vidéo ÉTANT un fichier — `classifyAnonymousAttachment`,
 * `services/attachments/ContentSignature.ts`), ni le droit d'écrire dans la
 * conversation (dont la voix suit le sort, même fonction, même commentaire :
 * `if (isAudio) return { allowed: true }`, jamais soumis à
 * `allowAnonymousFiles`/`allowAnonymousImages`). Les deux portes sont
 * corrigées ; une table n'est pas rétroactive : ce module rouvre les lignes
 * `Participant` déjà écrites par un lien.
 *
 * ## Deux formes d'écriture, pour deux formes de participant
 *
 * - **Anonyme** (`type === 'anonymous'`) : ses droits passent par
 *   `anonymousSession.rights` EN PRIORITÉ sur `permissions`
 *   (`resolveParticipantRights`, `services/participantRights.ts`) — le
 *   rattrapage pose donc son OUVERTURE dans ce delta, sans toucher à
 *   `permissions` ni écraser une surcharge déjà posée par un hôte
 *   (`PATCH …/rights`).
 * - **Nommé** (tout le reste) : `PATCH …/rights` REFUSE d'écrire un delta sur
 *   qui n'est pas anonyme (`routes/conversations/participant-rights-core.ts`,
 *   code `PARTICIPANT_HAS_ACCOUNT`) — `permissions` est donc sa SEULE source,
 *   et c'est elle que le rattrapage corrige directement.
 *
 * ## Ce qui n'est JAMAIS ouvert
 *
 * `canSendFiles` et `canSendImages` ne sont jamais touchés : ce sont des choix
 * EXPLICITES de l'hôte, y compris quand ils valent `false`. Et un droit dont
 * la cible calculée est `false` (lien qui refuse les fichiers, pour un
 * invité anonyme) n'est pas non plus écrit : le rattrapage n'OUVRE que ce que
 * le lien implique, jamais plus — une ligne dont les deux valeurs sont déjà
 * correctes ne produit AUCUNE écriture.
 *
 * FAÇADE MINCE attendue côté script :
 * `scripts/backfill-link-admission-media-rights.ts`, sur le modèle de
 * `scripts/backfill-named-member-attachment-rights.ts` (#6080).
 *
 * Sans écriture par défaut : `apply` est OBLIGATOIRE pour corriger.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ParticipantRightsOverride } from '../participantRights';

/** Les deux seuls drapeaux du lien dont ce rattrapage a besoin. */
export type LinkMediaFlags = {
  readonly allowAnonymousFiles: boolean;
  readonly allowAnonymousMessages: boolean;
};

export type MediaRights = {
  readonly canSendVideos: boolean;
  readonly canSendAudios: boolean;
};

/**
 * Ce que #6091 aurait écrit à la naissance, pour CE type de participant et CE
 * lien — la décision produit du critère de fin #1/#2 de l'issue, sous forme
 * de fonction PURE plutôt que rejouée à la main dans la boucle.
 */
export function targetMediaRightsFor(participantType: string, shareLink: LinkMediaFlags): MediaRights {
  if (participantType === 'anonymous') {
    return {
      canSendVideos: shareLink.allowAnonymousFiles,
      canSendAudios: shareLink.allowAnonymousMessages,
    };
  }
  // Un utilisateur NOMMÉ entrant par lien naît membre à part entière —
  // `NEW_MEMBER_PERMISSIONS` (`services/participantRights.ts:119`) l'ouvre
  // déjà pour les deux, quel que soit le lien emprunté.
  return { canSendVideos: true, canSendAudios: true };
}

/**
 * Les droits RÉSOLUS d'une ligne — une surcharge d'hôte déjà posée
 * (`anonymousSession.rights`) l'emporte sur l'instantané, exactement comme
 * `resolveParticipantRights`. Pure : ni Prisma ni forme de ligne particulière,
 * seulement les deux primitives dont la décision a besoin.
 */
export function currentMediaRights(
  permissions: MediaRights,
  override?: { readonly canSendVideos?: boolean | null; readonly canSendAudios?: boolean | null } | null,
): MediaRights {
  return {
    canSendVideos: typeof override?.canSendVideos === 'boolean' ? override.canSendVideos : permissions.canSendVideos,
    canSendAudios: typeof override?.canSendAudios === 'boolean' ? override.canSendAudios : permissions.canSendAudios,
  };
}

/**
 * Le delta à OUVRIR sur ce participant — jamais plus que ce que la cible
 * implique. Un champ ABSENT du résultat veut dire « rien à changer » : soit
 * déjà ouvert, soit la cible elle-même est fermée (le lien refuse les
 * fichiers) et ce n'est pas au rattrapage de l'ouvrir.
 */
export function mediaRightsOpeningFor(current: MediaRights, target: MediaRights): ParticipantRightsOverride {
  const opening: { canSendVideos?: boolean; canSendAudios?: boolean } = {};
  if (target.canSendVideos && !current.canSendVideos) opening.canSendVideos = true;
  if (target.canSendAudios && !current.canSendAudios) opening.canSendAudios = true;
  return opening;
}

/**
 * Le filtre COARSE remis à la base — il ne décide de rien,
 * `targetMediaRightsFor` décide ; il évite seulement de rapatrier toute la
 * collection `Participant` d'une base de production pour n'en garder qu'une
 * poignée en mémoire. `shareLinkId` non nul : ce rattrapage ne vise QUE les
 * entrées par lien (anonymes et nommées portent toutes deux ce champ, cf.
 * `joinAsGuest`/`joinAsRegistered` dans `link-admission.ts`).
 */
export const LINK_ADMISSION_MEDIA_RIGHTS_CANDIDATE_WHERE = {
  shareLinkId: { not: null },
  OR: [
    { permissions: { is: { canSendVideos: { equals: false } } } },
    { permissions: { is: { canSendAudios: { equals: false } } } },
  ],
} as const;

export type LinkAdmissionMediaRightsBackfillReport = {
  /** Lignes examinées — celles que le filtre coarse a ramenées. */
  readonly scanned: number;
  /** Lignes où au moins un droit doit s'ouvrir : ce que `--apply` écrirait. */
  readonly reopenable: number;
  /** Lignes effectivement réécrites — toujours `0` à blanc. */
  readonly reopened: number;
  /** Combien de fois CHAQUE droit a été ouvert, tous participants confondus. */
  readonly byRight: { readonly canSendVideos: number; readonly canSendAudios: number };
  /** Combien de participants ouverts, PAR LIEN emprunté. */
  readonly byLink: Readonly<Record<string, number>>;
};

export type LinkAdmissionMediaRightsBackfillOptions = {
  readonly apply?: boolean;
  readonly batchSize?: number;
  readonly onReopen?: (row: { readonly participantId: string; readonly shareLinkId: string }) => void;
};

const DEFAULT_BATCH_SIZE = 200;

/** La projection minimale dont la décision et l'écriture ont besoin. */
const SCANNED_SELECT = {
  id: true,
  type: true,
  shareLinkId: true,
  permissions: true,
  anonymousSession: true,
} as const;

type PrismaForBackfill = Pick<PrismaClient, 'participant' | 'conversationShareLink'>;

export async function backfillLinkAdmissionMediaRights(
  prisma: PrismaForBackfill,
  options: LinkAdmissionMediaRightsBackfillOptions = {},
): Promise<LinkAdmissionMediaRightsBackfillReport> {
  const apply = options.apply === true;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  let scanned = 0;
  let reopenable = 0;
  let reopened = 0;
  const byRight = { canSendVideos: 0, canSendAudios: 0 };
  const byLink: Record<string, number> = {};
  let cursor: string | undefined;

  for (;;) {
    const pageArgs = {
      where: LINK_ADMISSION_MEDIA_RIGHTS_CANDIDATE_WHERE,
      select: SCANNED_SELECT,
      orderBy: { id: 'asc' as const },
      take: batchSize,
    };
    const page = cursor
      ? await prisma.participant.findMany({ ...pageArgs, cursor: { id: cursor }, skip: 1 })
      : await prisma.participant.findMany(pageArgs);

    if (page.length === 0) break;

    // Un aller-retour PAR PAGE, jamais par ligne : les liens se répètent
    // largement plus que les participants qui les empruntent.
    const linkIds = [...new Set(page.map((row) => row.shareLinkId).filter((id): id is string => Boolean(id)))];
    const links = linkIds.length > 0
      ? await prisma.conversationShareLink.findMany({
          where: { id: { in: linkIds } },
          select: { id: true, allowAnonymousFiles: true, allowAnonymousMessages: true },
        })
      : [];
    const linkById = new Map(links.map((link) => [link.id, link]));

    for (const row of page) {
      scanned += 1;

      // Lien introuvable (supprimé depuis) — rien à décider sans lui.
      const link = row.shareLinkId ? linkById.get(row.shareLinkId) : undefined;
      if (!link) continue;

      const target = targetMediaRightsFor(row.type, link);
      const current = currentMediaRights(row.permissions, row.anonymousSession?.rights);
      const opening = mediaRightsOpeningFor(current, target);
      if (Object.keys(opening).length === 0) continue;

      reopenable += 1;
      if (opening.canSendVideos) byRight.canSendVideos += 1;
      if (opening.canSendAudios) byRight.canSendAudios += 1;
      const linkKey = row.shareLinkId as string;
      byLink[linkKey] = (byLink[linkKey] ?? 0) + 1;
      options.onReopen?.({ participantId: row.id, shareLinkId: linkKey });

      if (!apply) continue;

      if (row.anonymousSession) {
        await prisma.participant.update({
          where: { id: row.id },
          data: {
            anonymousSession: {
              ...row.anonymousSession,
              rights: { ...(row.anonymousSession.rights ?? {}), ...opening },
            },
          },
        });
      } else {
        await prisma.participant.update({
          where: { id: row.id },
          data: { permissions: { ...row.permissions, ...opening } },
        });
      }
      reopened += 1;
    }

    if (page.length < batchSize) break;
    cursor = page[page.length - 1].id;
  }

  return { scanned, reopenable, reopened, byRight, byLink };
}
