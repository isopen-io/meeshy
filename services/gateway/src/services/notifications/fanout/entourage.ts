/**
 * L'ENTOURAGE PRÉVENU d'une action — qui, autour de son propriétaire, reçoit le
 * relais (#13929, cercles de proximité). Partagé par les éventails existants
 * (`friend-content`, `story-comment`) : ce n'est pas un service, c'est la lecture
 * commune qu'ils faisaient chacun par leur propre `friendRequest.findMany`.
 *
 * 1. le cran choisi par le PROPRIÉTAIRE pour cette action (`notification.<clé>`,
 *    `CIRCLE_NOTIFY_KEYS`), absent ⇒ le défaut de sa famille, invalide ou base
 *    illisible ⇒ personne ;
 * 2. l'énumération NOMMÉE, bornée à `FANOUT_ROW_CAP` : les liens d'au moins ce cran
 *    (`comptesAuMoins`, du plus proche au plus lointain), et, aux crans Communauté et
 *    Public, les co-membres d'une communauté lus par une requête bornée. Public
 *    n'envoie jamais à tout Meeshy : faute de modèle d'abonnés, il nomme les mêmes
 *    personnes que Communauté (ADR du lot) ;
 * 3. le verdict de LA loi (`resolveRelationAccess`, `ownerAudience`) : le niveau
 *    effectif borne toujours le réglage, et le blocage, dans un sens ou dans
 *    l'autre, coupe tout. Une lecture de blocage qui échoue n'envoie rien.
 *
 * Ce que l'entourage ne dit PAS : qui a le droit de VOIR le contenu. C'est
 * l'admission de la publication (`filterPostConsumers`), que l'éventail applique
 * ensuite ; les préférences par type du destinataire restent celles de
 * `createNotification`.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { resolveRelationAccess } from '@meeshy/shared/utils/relation-access';
import {
  CIRCLE_NOTIFY_DEFAULTS,
  CIRCLE_NOTIFY_KEY_FEATURE,
  isRelationAudienceChoice,
  type CircleNotifyKey,
  type RelationAudienceChoice,
} from '@meeshy/shared/utils/relation-levels';
import type { RelationLevel } from '@meeshy/shared/types/relation';
import { notificationLogger } from '../../../utils/logger-enhanced';
import { getBlockedUserIdsAmong } from '../../../utils/blocking';
import { comptesAuMoins, niveauxParmi } from '../../friendship';
import { getCommunityCoMemberIdsBounded } from '../../posts/communityVisibility';
import { linkedAmong, type ChosenLinkDb } from '../../posts/chosenRecipientLinks';
import { FANOUT_ROW_CAP } from './row-cap';

export type EntourageDb = Pick<PrismaClient, 'friendRequest' | 'userRelation' | 'communityMember' | 'user' | 'userPreferences'>;

export type Entourage = { readonly ids: string[]; readonly truncated: boolean };

const NOBODY: Entourage = { ids: [], truncated: false };

const widensToCommunity = (choice: RelationAudienceChoice): boolean => choice === 'COMMUNITY' || choice === 'PUBLIC';

/**
 * Le cran du propriétaire pour `key` : clé ABSENTE ⇒ défaut de sa famille ;
 * valeur présente mais hors des sept crans, ou base illisible ⇒ `NOBODY` (fermé) —
 * un `NOBODY` réécrit de travers ne doit jamais rouvrir au défaut.
 */
export async function readCircleSetting(
  prisma: Pick<PrismaClient, 'userPreferences'>,
  ownerId: string,
  key: CircleNotifyKey
): Promise<RelationAudienceChoice> {
  try {
    const row = await prisma.userPreferences.findUnique({ where: { userId: ownerId }, select: { notification: true } });
    const stored = (row?.notification as Record<string, unknown> | null | undefined)?.[key];
    if (stored === undefined || stored === null) return CIRCLE_NOTIFY_DEFAULTS[key];
    return isRelationAudienceChoice(stored) ? stored : 'NOBODY';
  } catch (error) {
    notificationLogger.error('Réglage d’entourage illisible : relais fermé', { ownerId, key, error });
    return 'NOBODY';
  }
}

/**
 * Les personnes NOMMÉES par `ownerId` — choisies d'un post `ONLY` (#14105) ou
 * mentionnées (#14168) — qu'on a le droit de PRÉVENIR : celles qui lui sont LIÉES
 * (Connaissance et plus, ou conversation directe où elles ont écrit —
 * `linkedAmong`), plus celles que l'action prévient déjà par ailleurs
 * (`alreadyAddressedUserIds` : l'auteur du post commenté, celui du commentaire
 * parent), jamais un inconnu. Blocage dans un sens ou dans l'autre, compte
 * supprimé ou inactif et exclusions de l'appelant écartent toujours. Bornées à
 * `FANOUT_ROW_CAP` ; une lecture qui échoue n'envoie rien.
 */
export async function resolveLinkedAudience(
  prisma: Pick<PrismaClient, 'user'> & ChosenLinkDb,
  params: {
    readonly ownerId: string;
    readonly candidateUserIds: readonly string[];
    readonly excludeUserIds?: readonly string[];
    readonly alreadyAddressedUserIds?: readonly string[];
  }
): Promise<string[]> {
  const excluded = new Set([params.ownerId, ...(params.excludeUserIds ?? [])]);
  const candidates = [...new Set(params.candidateUserIds)].filter((id) => !excluded.has(id)).slice(0, FANOUT_ROW_CAP);
  if (candidates.length === 0) return [];
  const addressed = new Set(params.alreadyAddressedUserIds ?? []);
  try {
    const [blocked, living, linked] = await Promise.all([
      getBlockedUserIdsAmong(prisma, params.ownerId, candidates),
      prisma.user.findMany({ where: { id: { in: candidates }, deletedAt: null, isActive: true }, select: { id: true } }),
      linkedAmong(prisma, params.ownerId, candidates.filter((id) => !addressed.has(id))),
    ]);
    if (linked === null) return [];
    const alive = new Set(living.map((row) => row.id));
    return candidates.filter((id) => alive.has(id) && (addressed.has(id) || linked.has(id)) && !blocked.has(id));
  } catch (error) {
    notificationLogger.error('Destinataires nommés abandonnés : lecture illisible', { ownerId: params.ownerId, error });
    return [];
  }
}

/**
 * Ceux qu'une mention de `mentionerId` PRÉVIENT réellement (#14168) : ses liens,
 * plus ceux que son action prévient déjà. Seuls ceux-là sortent des seaux moins
 * prioritaires d'un éventail (`friend_new_*`, `story_thread_reply`,
 * `friend_story_comment`) : un nommé sans lien, que la mention ne prévient pas,
 * y reste.
 */
export async function mentionReceivers(
  prisma: Pick<PrismaClient, 'user'> & ChosenLinkDb,
  params: {
    readonly mentionerId: string;
    readonly mentionedUserIds: readonly string[];
    readonly alreadyAddressedUserIds?: readonly string[];
  }
): Promise<string[]> {
  return resolveLinkedAudience(prisma, {
    ownerId: params.mentionerId,
    candidateUserIds: params.mentionedUserIds,
    alreadyAddressedUserIds: params.alreadyAddressedUserIds,
  });
}

/** Les choisis d'un post `ONLY` prévenus de sa publication (#14080, #14105) : les seuls LIÉS. */
export async function resolveChosenAudience(
  prisma: Pick<PrismaClient, 'user'> & ChosenLinkDb,
  params: { readonly ownerId: string; readonly chosenUserIds: readonly string[]; readonly excludeUserIds?: readonly string[] }
): Promise<string[]> {
  return resolveLinkedAudience(prisma, {
    ownerId: params.ownerId,
    candidateUserIds: params.chosenUserIds,
    excludeUserIds: params.excludeUserIds,
  });
}

type EntourageParams = { readonly ownerId: string; readonly key: CircleNotifyKey; readonly excludeUserIds?: readonly string[] };

/** L'entourage prévenu ; une lecture qui échoue (réglage, liens, niveaux, blocage) n'envoie RIEN. */
export async function resolveEntourage(prisma: EntourageDb, params: EntourageParams): Promise<Entourage> {
  try {
    return await readEntourage(prisma, params);
  } catch (error) {
    notificationLogger.error('Entourage abandonné : lecture illisible', { ownerId: params.ownerId, key: params.key, error });
    return NOBODY;
  }
}

async function readEntourage(prisma: EntourageDb, params: EntourageParams): Promise<Entourage> {
  const { ownerId, key } = params;
  const setting = await readCircleSetting(prisma, ownerId, key);
  if (setting === 'NOBODY') return NOBODY;

  const plancher: RelationLevel = widensToCommunity(setting) ? 'ACQUAINTANCE' : setting;
  const [comptes, coMembers] = await Promise.all([
    comptesAuMoins(prisma, ownerId, plancher, { limit: FANOUT_ROW_CAP + 1 }),
    widensToCommunity(setting) ? getCommunityCoMemberIdsBounded(prisma, ownerId, FANOUT_ROW_CAP + 1) : Promise.resolve([]),
  ]);

  const excluded = new Set([ownerId, ...(params.excludeUserIds ?? [])]);
  const known = new Map(comptes.map((c) => [c.id, c.niveau]));
  const ordered = [...new Set([...comptes.map((c) => c.id), ...coMembers])].filter((id) => !excluded.has(id));
  const truncated = comptes.length > FANOUT_ROW_CAP || coMembers.length > FANOUT_ROW_CAP || ordered.length > FANOUT_ROW_CAP;
  const candidates = ordered.slice(0, FANOUT_ROW_CAP);
  if (truncated) notificationLogger.warn('Entourage tronqué à la borne', { ownerId, key, cap: FANOUT_ROW_CAP });
  if (candidates.length === 0) return { ids: [], truncated };

  const coMemberSet = new Set(coMembers);
  const unknownLevels = candidates.filter((id) => !known.has(id));
  const [levels, blocked] = await Promise.all([
    unknownLevels.length === 0 ? Promise.resolve(known) : niveauxParmi(prisma, ownerId, unknownLevels),
    getBlockedUserIdsAmong(prisma, ownerId, candidates),
  ]);

  const levelOf = (id: string): RelationLevel => known.get(id) ?? levels.get(id) ?? 'PUBLIC';
  const feature = CIRCLE_NOTIFY_KEY_FEATURE[key];
  // Le niveau lu est déjà le MINIMUM des deux accords : le passer des deux côtés le rend tel quel.
  const ids = candidates.filter(
    (id) =>
      resolveRelationAccess({
        viewerId: id,
        targetId: ownerId,
        grantedByViewer: levelOf(id),
        grantedByTarget: levelOf(id),
        sharesCommunity: coMemberSet.has(id),
        blockedEitherWay: blocked.has(id),
        // L'âge ne garde aujourd'hui que la Connaissance AUTOMATIQUE (loi #13927) ;
        // une garde d'âge ajoutée à une feature d'entourage exigera de le lire ici.
        viewerMinor: 'unknown',
        targetMinor: 'unknown',
        feature,
        ownerAudience: setting,
      }).allowed
  );
  return { ids, truncated };
}
