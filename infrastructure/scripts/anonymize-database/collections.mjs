// Le MONDE FERMÉ des collections. Avant toute écriture, le script liste les
// collections de la base (`listCollections`) et REFUSE d'en écrire une seule
// tant qu'une collection n'est ni inventoriée (inventory.mjs) ni déclarée ici
// « sans donnée personnelle », avec sa raison écrite. Le contrôle final rejoue
// la même règle. Une collection héritée (ancien nom, sauvegarde manuelle,
// `User_backup_*`) se retire explicitement : `--drop-collection <nom>`.
//
// « Sans donnée personnelle » veut dire ici : rien d'autre que des identifiants
// Mongo, des compteurs, des dates et des énumérations — les identifiants et le
// graphe qu'ils dessinent restent (pseudonymisation, voir le README).

const IDS_AND_COUNTERS = 'identifiants Mongo, compteurs, dates et énumérations seulement : aucun texte saisi, aucun identifiant de contact';

const withReason = (reason, ...collections) => Object.fromEntries(collections.map((c) => [c, reason]));

export const INTERNAL_COLLECTIONS = Object.freeze({
  _anonymizationRuns: 'journal des exécutions de ce script : dates de début et de fin, nombre de documents par collection',
});

export const COLLECTION_EXEMPTIONS = Object.freeze({
  ...withReason(IDS_AND_COUNTERS,
    'ContactJoinNotice', 'ConversationReadCursor', 'Mention', 'CommunityMember', 'UserStats', 'AffiliateRelation',
    'CallRecording', 'UserMessageDeletion', 'SoundUsage', 'PostView', 'PostImpression', 'MessageStar', 'PostBookmark',
    'PostMediaDownload', 'AgentAnalytic', 'AgentTopicUsageLog', 'mutation_logs', 'user_event_seq', 'CommentMention',
    'PostMention', 'EngagementCounter', 'EngagementMilestone', 'EngagementConversationCredit', 'EngagementSignatureCredit',
    'ConversationEngagement', 'EngagementPostPoints', 'DailyMission', 'GameDay', 'GameProfile', 'MythicSeat',
    'MythicEdition', 'LeagueMembership', 'GameWeekPoints', 'GameDuo', 'GameDuoSlot', 'GameSeason', 'GameTrophy',
    'AtlasStamp', 'AchievementRarityStat'),
  ...withReason('une réaction ne porte qu’un emoji et les identifiants de son auteur et de sa cible',
    'AttachmentReaction', 'Reaction', 'CommentReaction', 'PostReaction'),
  notification_preferences: 'interrupteurs de notification et heures de « ne pas déranger » (HH:MM), sans texte saisi',
  LeaguePseudonym: 'pseudonymes GÉNÉRÉS par le jeu à partir d’un lexique, déjà des alias, jamais saisis par l’utilisateur',
  EngagementScaleConfig: 'barème du jeu, configuration éditoriale de l’équipe, sans utilisateur',
  AgentGlobalConfig: 'configuration éditoriale globale de l’agent (invite système, fournisseur, modèle), sans utilisateur',
  AgentTopicCatalog: 'catalogue éditorial des sujets de l’agent, écrit par l’équipe, sans utilisateur',
});

export function knownCollections(inventory) {
  return new Set([...inventory.map((spec) => spec.collection), ...Object.keys(COLLECTION_EXEMPTIONS), ...Object.keys(INTERNAL_COLLECTIONS)]);
}

/**
 * Le relevé des collections de `db` face à l'inventaire. `drop` nomme les
 * collections que l'opérateur a demandé de retirer : elles doivent être
 * INCONNUES (on ne retire jamais une collection inventoriée).
 */
export async function auditCollections(db, { inventory, drop = [] }) {
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).sort();
  const known = knownCollections(inventory);
  const requested = new Set(drop);
  return {
    names,
    unknown: names.filter((n) => !known.has(n) && !requested.has(n)),
    toDrop: names.filter((n) => requested.has(n) && !known.has(n)),
    forbiddenDrops: [...requested].filter((n) => known.has(n)),
  };
}
