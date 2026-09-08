import type { EngagementProgressPayload } from '@meeshy/shared/types/engagement';

/**
 * LA PROGRESSION DE DÉMONSTRATION — dans la FORME que sert `GET /me/engagement`
 * (#5670), servie quand `apiConfig.source` vaut `'fixtures'` (même règle que
 * `fixtures.ts` : le jour où le transport est câblé partout, ce fichier
 * disparaît sans qu'aucun composant ne bouge).
 *
 * Fixture FIXE et VOLONTAIREMENT INÉGALE, comme `fixtures.ts` : un utilisateur
 * à mi-chemin, pas un héros — des axes à plusieurs paliers, un axe qui vient
 * de commencer, deux axes à ZÉRO (« Réels », « Commentaires vocaux ») et un
 * succès verrouillé de ce fait. C'est le seul jeu qui fait tomber une vue qui
 * cacherait un axe vide ou peindrait un succès comme obtenu : un jeu où tout
 * est acquis rendrait vert n'importe quel écran.
 *
 * Le score est CELUI que `EngagementService.updateEngagementScore` aurait
 * accumulé sur ces compteurs (contenu ×3, commentaires ×2, conversations ×5,
 * outils ×1 — § 7 du modèle) : 87 × 3 + 8 × 2 + 9 × 5 + 28 × 1 = 350. Une
 * fixture dont le score contredirait ses compteurs ferait mentir la barre de
 * niveau sans qu'aucun témoin ne rougisse.
 *
 * Les DATES sont ancrées sur MAINTENANT (`daysAgo`), jamais écrites en dur —
 * même raison que les horaires de `fixtures.ts` : une capture qui dit « obtenu
 * hier » doit le dire encore demain.
 */
const daysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString();

export const ENGAGEMENT_PROGRESS_FIXTURE: EngagementProgressPayload = {
  counters: [
    { axisKey: 'content.text_message', count: 42 },
    { axisKey: 'content.audio_message', count: 3 },
    { axisKey: 'content.post', count: 12 },
    { axisKey: 'content.story', count: 30 },
    { axisKey: 'comment.text', count: 8 },
    { axisKey: 'conversation.private', count: 6 },
    { axisKey: 'conversation.public', count: 1 },
    { axisKey: 'conversation.community', count: 2 },
    { axisKey: 'tool.sticker', count: 15 },
    { axisKey: 'tool.in_app_edit', count: 4 },
    { axisKey: 'tool.direct_publish', count: 9 },
  ],
  milestones: [
    { milestoneType: 'badge', milestoneKey: 'content.text_message:1', reachedAt: daysAgo(40) },
    { milestoneType: 'badge', milestoneKey: 'content.text_message:10', reachedAt: daysAgo(31) },
    { milestoneType: 'badge', milestoneKey: 'content.audio_message:1', reachedAt: daysAgo(12) },
    { milestoneType: 'badge', milestoneKey: 'content.post:1', reachedAt: daysAgo(38) },
    { milestoneType: 'badge', milestoneKey: 'content.post:10', reachedAt: daysAgo(9) },
    { milestoneType: 'badge', milestoneKey: 'content.story:1', reachedAt: daysAgo(35) },
    { milestoneType: 'badge', milestoneKey: 'content.story:10', reachedAt: daysAgo(20) },
    { milestoneType: 'badge', milestoneKey: 'comment.text:1', reachedAt: daysAgo(30) },
    { milestoneType: 'badge', milestoneKey: 'conversation.private:1', reachedAt: daysAgo(40) },
    { milestoneType: 'badge', milestoneKey: 'conversation.public:1', reachedAt: daysAgo(14) },
    { milestoneType: 'badge', milestoneKey: 'conversation.community:1', reachedAt: daysAgo(22) },
    { milestoneType: 'badge', milestoneKey: 'tool.sticker:1', reachedAt: daysAgo(33) },
    { milestoneType: 'badge', milestoneKey: 'tool.sticker:10', reachedAt: daysAgo(11) },
    { milestoneType: 'badge', milestoneKey: 'tool.in_app_edit:1', reachedAt: daysAgo(6) },
    { milestoneType: 'badge', milestoneKey: 'tool.direct_publish:1', reachedAt: daysAgo(38) },
    { milestoneType: 'streak', milestoneKey: 'streak:3', reachedAt: daysAgo(3) },
    { milestoneType: 'streak', milestoneKey: 'streak:7', reachedAt: daysAgo(25) },
    { milestoneType: 'level', milestoneKey: 'level:10', reachedAt: daysAgo(39) },
    { milestoneType: 'level', milestoneKey: 'level:50', reachedAt: daysAgo(30) },
    { milestoneType: 'level', milestoneKey: 'level:150', reachedAt: daysAgo(15) },
    { milestoneType: 'achievement', milestoneKey: 'achievement.first_content', reachedAt: daysAgo(40) },
    { milestoneType: 'achievement', milestoneKey: 'achievement.first_voice', reachedAt: daysAgo(12) },
    { milestoneType: 'achievement', milestoneKey: 'achievement.editor', reachedAt: daysAgo(6) },
    { milestoneType: 'achievement', milestoneKey: 'achievement.three_conversation_kinds', reachedAt: daysAgo(14) },
  ],
  streak: { currentStreakDays: 5, longestStreakDays: 12 },
  level: { engagementScore: 350 },
};
