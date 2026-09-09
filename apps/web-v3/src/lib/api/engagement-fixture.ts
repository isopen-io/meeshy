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
 * accumulé sur ces compteurs, au barème COURANT (contenu ×9, social ×7,
 * conversations ×5, commentaires ×3, outils ×1 — le porteur l'a réglé le
 * 2026-09-09) : 87 × 9 + 52 × 7 + 9 × 5 + 8 × 3 + 28 × 1 = 1244. Une fixture
 * dont le score contredirait ses compteurs ferait mentir la barre de niveau
 * sans qu'aucun témoin ne rougisse — c'est exactement ce qui était arrivé :
 * elle valait encore 350, calculé sur le barème d'avant le réglage.
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
    { axisKey: 'social.tracked_link', count: 26 },
    { axisKey: 'social.share', count: 14 },
    { axisKey: 'social.friendship', count: 9 },
    { axisKey: 'social.invite_joined', count: 3 },
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
    { milestoneType: 'badge', milestoneKey: 'social.tracked_link:1', reachedAt: daysAgo(28) },
    { milestoneType: 'badge', milestoneKey: 'social.tracked_link:10', reachedAt: daysAgo(8) },
    { milestoneType: 'badge', milestoneKey: 'social.share:1', reachedAt: daysAgo(26) },
    { milestoneType: 'badge', milestoneKey: 'social.share:10', reachedAt: daysAgo(4) },
    { milestoneType: 'badge', milestoneKey: 'social.friendship:1', reachedAt: daysAgo(37) },
    { milestoneType: 'badge', milestoneKey: 'social.invite_joined:1', reachedAt: daysAgo(19) },
    { milestoneType: 'achievement', milestoneKey: 'achievement.parole.message.send.count:100', reachedAt: daysAgo(7) },
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
  level: { engagementScore: 1244 },
  /**
   * La CARTE D'ATTEIGNABILITÉ — partielle À DESSEIN.
   *
   * `conversation.join.size` et `community.join.size` sont mesurées, donc leurs
   * paliers d'ampleur s'affichent jusqu'à la mesure ; `community.create.size`
   * l'est à peine ; `call.start.size` est ABSENTE, donc ses paliers d'ampleur
   * se taisent pendant que ses paliers de volume vivent. Une carte complète
   * rendrait vert un écran qui ignorerait `isAttainable`.
   */
  achievementReach: {
    'conversation.join.size': 1000,
    'community.join.size': 10000,
    'community.create.size': 100,
  },
  /**
   * L'ÉLAN à ×3 : trois familles tenues sur la fenêtre, sans l'assise
   * permanente. Ni le neutre (qui ne montrerait pas la bannière) ni le plafond
   * (qui cacherait le fait qu'elle COMPTE) — le cran du milieu est le seul qui
   * fasse tomber une vue qui afficherait un facteur figé.
   */
  elan: { factor: 3, activeFamilyCount: 3, hasStanding: false, windowDays: 7 },
  /**
   * Une Meesh DÉJÀ frappée, et de quoi en frapper une seconde.
   *
   * Le porteur a demandé le bouton de conversion « quand les points le
   * permettent, sinon pas de bouton ». Une fixture SOUS le prix ne pourrait pas
   * distinguer « bouton correctement absent » de « bouton manquant » : l'absence
   * se lit comme la panne. La démonstration est donc frappable, et le solde
   * non nul prouve en plus que le hero sait afficher autre chose que zéro.
   *
   * `debitablePoints` exclut le plancher des conversations (9 actions × 5 = 45),
   * `floorPoints` le porte.
   */
  meesh: {
    balance: 1,
    mintedLifetime: 1,
    /**
     * La date de LA frappe — `mintedLifetime: 1` l'exige.
     *
     * Sans elle, le sous-menu disait « 1 frappée depuis toujours » ET « aucune
     * frappe pour l'instant » dans le même panneau. Une fixture qui déclare un
     * compte à vie sans lui donner de date se contredit — le même défaut que
     * son score contredisant ses compteurs, une ligne plus haut.
     *
     * Première et dernière sont ÉGALES parce qu'il n'y en a eu qu'une : c'est
     * le cas où la vue doit taire la seconde ligne plutôt que de répéter la
     * même date deux fois.
     */
    firstMintedAt: daysAgo(21),
    lastMintedAt: daysAgo(21),
    debitablePoints: 1244,
    floorPoints: 45,
    missingPoints: 0,
    mintCost: 1221,
  },
};
