import type { PrismaClient, UserRole } from '@meeshy/shared/prisma/client';
import { PARTICIPATION_VIVANTE } from '@meeshy/shared/utils/participation-vivante';
import type { ToneProfile, ControlledUser, TraitValue } from '../graph/state';
import { toneProfileToGlobalFields } from './profile-merger';

// Single inactivity delay shared by pickup and pool cleanup: a user is only
// controllable after this many hours without connecting, and is released as
// soon as they reconnect. Mirrors AgentConfig.inactivityThresholdHours.
const DEFAULT_INACTIVITY_THRESHOLD_HOURS = 72;
// Upper bound of the configurable delay (see agentConfigSchema in the gateway).
const MAX_INACTIVITY_THRESHOLD_HOURS = 720;

/** Jours d'oisiveté par défaut au-delà desquels un rôle AUTO rend sa place. */
const DEFAULT_ROLE_MAX_IDLE_DAYS = 14;

/**
 * Combien de candidats on CHARGE avant de tirer au sort.
 *
 * Le vivier réel se compte en centaines (252 éligibles mesurés sur une seule
 * conversation), et il faut le voir en entier pour tirer dedans — mais pas au
 * prix d'une requête sans borne. Ce plafond est le compromis : assez large
 * pour que le tirage soit VRAIMENT ouvert, assez petit pour rester une
 * projection de quelques colonnes.
 */
const TAILLE_MAX_VIVIER = 500;

/**
 * Tirage sans remise, uniforme (Fisher-Yates partiel).
 *
 * Pourquoi un tirage et non un tri : en production, des centaines de
 * participants partagent la MÊME valeur de `lastActiveAt` — la date du seed,
 * à la seconde près. Un `orderBy` sur cette colonne n'a alors aucun pouvoir
 * discriminant : Mongo rend l'ordre naturel de la collection, et `take` élit
 * indéfiniment les mêmes premiers. Le hasard est ici la seule façon d'ouvrir
 * le vivier — c'est la décision porteur du 2026-09-08 (#5663).
 */
function tirerAuSort<T>(vivier: readonly T[], combien: number): T[] {
  if (combien >= vivier.length) return [...vivier];
  const copie = [...vivier];
  for (let i = 0; i < combien; i += 1) {
    const j = i + Math.floor(Math.random() * (copie.length - i));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie.slice(0, combien);
}

const TRAIT_FIELDS = [
  'verbosity', 'formality', 'responseSpeed', 'initiativeRate', 'clarity', 'argumentation',
  'socialStyle', 'assertiveness', 'agreeableness', 'humor', 'emotionality', 'openness',
  'confidence', 'creativity', 'patience', 'adaptability',
  'empathy', 'politeness', 'leadership', 'conflictStyle', 'supportiveness', 'diplomacy', 'trustLevel',
  'emotionalStability', 'positivity', 'sensitivity', 'stressResponse',
] as const;

const TRAIT_CATEGORY_MAP: Record<string, readonly string[]> = {
  communication: ['verbosity', 'formality', 'responseSpeed', 'initiativeRate', 'clarity', 'argumentation'],
  personality: ['socialStyle', 'assertiveness', 'agreeableness', 'humor', 'emotionality', 'openness', 'confidence', 'creativity', 'patience', 'adaptability'],
  interpersonal: ['empathy', 'politeness', 'leadership', 'conflictStyle', 'supportiveness', 'diplomacy', 'trustLevel'],
  emotional: ['emotionalStability', 'positivity', 'sensitivity', 'stressResponse'],
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function flattenTraits(traits: ToneProfile['traits']): Record<string, unknown> {
  if (!traits) return {};
  const flat: Record<string, unknown> = {};
  for (const [category, fields] of Object.entries(TRAIT_CATEGORY_MAP)) {
    const categoryTraits = (traits as Record<string, Record<string, TraitValue> | undefined>)[category];
    if (!categoryTraits) continue;
    for (const field of fields) {
      const tv = categoryTraits[field];
      if (tv) {
        flat[`trait${capitalize(field)}`] = tv.label;
        flat[`trait${capitalize(field)}Score`] = Math.round(tv.score);
      }
    }
  }
  return flat;
}

function unflattenTraits(row: Record<string, unknown>): ToneProfile['traits'] {
  const traits: NonNullable<ToneProfile['traits']> = {};
  let hasAny = false;
  for (const [category, fields] of Object.entries(TRAIT_CATEGORY_MAP)) {
    const categoryTraits: Record<string, TraitValue> = {};
    let hasCategoryTrait = false;
    for (const field of fields) {
      const label = row[`trait${capitalize(field)}`];
      const score = row[`trait${capitalize(field)}Score`];
      if (typeof label === 'string' && typeof score === 'number') {
        categoryTraits[field] = { label, score };
        hasCategoryTrait = true;
      }
    }
    if (hasCategoryTrait) {
      (traits as Record<string, Record<string, TraitValue>>)[category] = categoryTraits;
      hasAny = true;
    }
  }
  return hasAny ? traits : undefined;
}

function migrateRelationshipMap(raw: unknown): ToneProfile['relationshipMap'] {
  if (!raw || typeof raw !== 'object') return {};
  const result: ToneProfile['relationshipMap'] = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') {
      result[key] = value;
    } else if (value && typeof value === 'object' && 'attitude' in value) {
      const v = value as { attitude: unknown; score: unknown; detail: unknown };
      if (typeof v.attitude === 'string' && typeof v.score === 'number' && typeof v.detail === 'string') {
        result[key] = { attitude: v.attitude, score: v.score, detail: v.detail };
      }
    }
  }
  return result;
}

export type SummaryExtra = {
  healthScore?: number;
  engagementLevel?: string;
  conflictLevel?: string;
  dynamique?: string;
  dominantEmotions?: string[];
};

export class MongoPersistence {
  constructor(private prisma: PrismaClient) {}

  async getAgentConfig(conversationId: string) {
    return this.prisma.agentConfig.findUnique({ where: { conversationId } });
  }

  async ensureAgentConfig(conversationId: string) {
    return this.prisma.agentConfig.upsert({
      where: { conversationId },
      create: { conversationId, enabled: true },
      update: {},
    });
  }

  async upsertUserRole(conversationId: string, profile: ToneProfile) {
    const traitFields = flattenTraits(profile.traits);
    const baseData = {
      origin: profile.origin,
      archetypeId: profile.archetypeId ?? null,
      personaSummary: profile.personaSummary,
      tone: profile.tone,
      vocabularyLevel: profile.vocabularyLevel,
      typicalLength: profile.typicalLength,
      emojiUsage: profile.emojiUsage,
      topicsOfExpertise: profile.topicsOfExpertise,
      topicsAvoided: profile.topicsAvoided,
      relationshipMap: profile.relationshipMap as any,
      catchphrases: profile.catchphrases,
      responseTriggers: profile.responseTriggers,
      silenceTriggers: profile.silenceTriggers,
      commonEmojis: profile.commonEmojis,
      reactionPatterns: profile.reactionPatterns,
      messagesAnalyzed: profile.messagesAnalyzed,
      confidence: profile.confidence,
      locked: profile.locked,
      dominantEmotions: profile.dominantEmotions ?? [],
      ...traitFields,
    };

    return this.prisma.agentUserRole.upsert({
      where: { userId_conversationId: { userId: profile.userId, conversationId } },
      create: {
        userId: profile.userId,
        conversationId,
        ...baseData,
      },
      update: baseData,
    });
  }

  async upsertSummary(conversationId: string, summary: string, topics: string[], tone: string, lastMessageId: string, messageCount: number, extra?: SummaryExtra) {
    const extraFields = extra ? {
      ...(extra.healthScore !== undefined ? { healthScore: extra.healthScore } : {}),
      ...(extra.engagementLevel !== undefined ? { engagementLevel: extra.engagementLevel } : {}),
      ...(extra.conflictLevel !== undefined ? { conflictLevel: extra.conflictLevel } : {}),
      ...(extra.dynamique !== undefined ? { dynamique: extra.dynamique } : {}),
      ...(extra.dominantEmotions !== undefined ? { dominantEmotions: extra.dominantEmotions } : {}),
    } : {};

    return this.prisma.agentConversationSummary.upsert({
      where: { conversationId },
      create: { conversationId, summary, currentTopics: topics, overallTone: tone, lastMessageId, messageCount, ...extraFields },
      update: { summary, currentTopics: topics, overallTone: tone, lastMessageId, messageCount, ...extraFields },
    });
  }

  async getLlmConfig() {
    return this.prisma.agentLlmConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
  }

  async evictRecentlyActiveUsers(): Promise<number> {
    // Release a controlled user as soon as they reconnect within their
    // conversation's inactivity delay. Pre-filter with the widest possible
    // delay, then refine per conversation against its own threshold.
    const widestThreshold = new Date(Date.now() - MAX_INACTIVITY_THRESHOLD_HOURS * 60 * 60 * 1000);

    const roles = await this.prisma.agentUserRole.findMany({
      where: { user: { lastActiveAt: { gte: widestThreshold } } },
      select: { id: true, userId: true, conversationId: true, user: { select: { lastActiveAt: true } } },
    });
    if (roles.length === 0) return 0;

    const configs = await this.prisma.agentConfig.findMany({
      where: { conversationId: { in: [...new Set(roles.map((r) => r.conversationId))] } },
      select: { conversationId: true, manualUserIds: true, inactivityThresholdHours: true },
    });
    const configMap = new Map(configs.map((c) => [c.conversationId, c]));

    const now = Date.now();
    const toDelete = roles.filter((r) => {
      const config = configMap.get(r.conversationId);
      const manualIds = new Set((config?.manualUserIds ?? []) as string[]);
      if (manualIds.has(r.userId)) return false;
      const thresholdHours = config?.inactivityThresholdHours ?? DEFAULT_INACTIVITY_THRESHOLD_HOURS;
      const evictAfter = now - thresholdHours * 60 * 60 * 1000;
      return r.user.lastActiveAt.getTime() >= evictAfter;
    });
    if (toDelete.length === 0) return 0;

    await this.prisma.agentUserRole.deleteMany({
      where: { id: { in: toDelete.map((r) => r.id) } },
    });

    return toDelete.length;
  }

  /**
   * Libère les rôles AUTO qui n'ont pas servi depuis le délai de leur
   * conversation — la SECONDE cause d'éviction, à côté de
   * {@link evictRecentlyActiveUsers}.
   *
   * Celle-là ne libérait une place que si la personne REVENAIT. Un participant
   * durablement absent gardait donc la sienne à vie, et cinq places prises
   * gelaient la sélection pour toujours : mesuré en production, 252 candidats
   * éligibles derrière 5 élus figés (#5663). L'oisiveté du rôle est le seul
   * signal qui rouvre ce verrou.
   *
   * Un rôle sans `lastUsedAt` (tous ceux antérieurs au champ) est jugé sur sa
   * date de CRÉATION : sans ce repli, l'ensemble du parc existant serait soit
   * épargné pour toujours, soit balayé d'un coup.
   *
   * La ligne est SUPPRIMÉE, pas marquée — mais la persona n'est pas perdue
   * pour autant : `AgentGlobalProfile` la porte par UTILISATEUR, hors
   * conversation, et `getPotentialControlledUsers` la relit pour reconstruire
   * le rôle si la personne est reprise. C'est déjà ce que fait l'éviction
   * jumelle.
   */
  async evictStaleRoles(): Promise<number> {
    const roles = await this.prisma.agentUserRole.findMany({
      select: { id: true, userId: true, conversationId: true, lastUsedAt: true, createdAt: true },
    });
    if (roles.length === 0) return 0;

    const configs = await this.prisma.agentConfig.findMany({
      where: { conversationId: { in: [...new Set(roles.map((r) => r.conversationId))] } },
      select: { conversationId: true, manualUserIds: true, roleMaxIdleDays: true },
    });
    const configMap = new Map(configs.map((c) => [c.conversationId, c]));

    const now = Date.now();
    const toDelete = roles.filter((r) => {
      const config = configMap.get(r.conversationId);
      const manualIds = new Set((config?.manualUserIds ?? []) as string[]);
      // Un pilotage MANUEL est un choix explicite : l'oisiveté ne le défait pas.
      if (manualIds.has(r.userId)) return false;
      const idleDays = config?.roleMaxIdleDays ?? DEFAULT_ROLE_MAX_IDLE_DAYS;
      const derniereUtilisation = (r.lastUsedAt ?? r.createdAt).getTime();
      return derniereUtilisation < now - idleDays * 24 * 60 * 60 * 1000;
    });
    if (toDelete.length === 0) return 0;

    await this.prisma.agentUserRole.deleteMany({
      where: { id: { in: toDelete.map((r) => r.id) } },
    });

    return toDelete.length;
  }

  /**
   * Horodate les rôles qui viennent de SERVIR — l'unique alimentation de
   * `lastUsedAt`, et donc la seule chose qui protège une place de
   * {@link evictStaleRoles}.
   *
   * Sans cet appel, tous les rôles vieilliraient sur leur `createdAt` et
   * seraient évincés au bout du délai, y compris les plus actifs : l'éviction
   * et son horodatage se posent ENSEMBLE ou pas du tout.
   */
  async touchUserRoles(conversationId: string, userIds: readonly string[]): Promise<void> {
    if (userIds.length === 0) return;
    await this.prisma.agentUserRole.updateMany({
      where: { conversationId, userId: { in: [...userIds] } },
      data: { lastUsedAt: new Date() },
    });
  }

  /**
   * LA GARDE DE LIVRAISON — l'autre bout de #20111, et le plus important.
   *
   * Les trois lectures de `Participant` de ce fichier gardent l'ÉLECTION : qui
   * ENTRE sous contrôle de l'agent. Celle-ci est ce que les TROIS chemins de
   * livraison appellent avant de faire parler l'agent
   * (`reactive/reactive-handler.ts`, `scheduler/conversation-scanner.ts`,
   * `server.ts`), et elle ne lisait **aucune** participation : un
   * `agentUserRole.findMany({ where: { conversationId } })` nu, puis un filtre
   * sur la seule horloge `User.lastActiveAt`.
   *
   * Deux chemins par lesquels un banni parlait encore, et le second ne dépend
   * d'aucune ligne héritée :
   *
   * 1. **Le rôle déjà DÉTENU.** Rien, sur le chemin de bannissement, ne libère
   *    `AgentUserRole` (mesuré : seuls `routes/admin/agent-reset.ts` et
   *    `jobs/obsolete-conversation-purge.ts` y touchent) ; et le rôle ne se
   *    périme pas, `touchUserRoles` réécrivant `lastUsedAt` chaque fois qu'il
   *    SERT. Quiconque était élu avant son bannissement restait animé
   *    indéfiniment. Le retrait du rôle AU bannissement est le suivi #20208 —
   *    cette garde-ci couvre en plus les lignes DÉJÀ en base, ce qu'aucune
   *    écriture future ne peut faire.
   * 2. **L'épinglage manuel** (`AgentConfig.manualUserIds`) fabriquait un
   *    `ControlledUser` sans jamais lire `Participant`.
   *
   * > **Une garde posée sur l'ÉLECTION ne garde pas la LIVRAISON.** C'est la
   * > question du cycle 202 — « qui AUTORISE ce que cette clause rend ? » —
   * > retournée : la clause était juste, et personne ne la rejouait au moment
   * > où le message part.
   *
   * **Fail-closed** : un contrôlé sans participation vivante est LÂCHÉ. Le
   * silence d'un animateur ne coûte rien ; parler au nom d'un exclu, si. Et
   * l'épinglage manuel garde exactement ce qu'il a toujours contourné —
   * l'horloge d'inactivité — jamais l'appartenance.
   */
  async getControlledUsers(conversationId: string): Promise<ControlledUser[]> {
    const [roles, config] = await Promise.all([
      this.prisma.agentUserRole.findMany({ where: { conversationId } }),
      this.prisma.agentConfig.findUnique({
        where: { conversationId },
        select: { manualUserIds: true, inactivityThresholdHours: true },
      }),
    ]);

    const manualUserIds = new Set((config?.manualUserIds ?? []) as string[]);
    const roleUserIds = new Set(roles.map((r: { userId: string }) => r.userId));
    const missingManualIds = [...manualUserIds].filter((id) => !roleUserIds.has(id));

    const candidateUserIds = [...roleUserIds, ...missingManualIds];
    if (candidateUserIds.length === 0) return [];

    const vivants = await this.prisma.participant.findMany({
      where: { conversationId, ...PARTICIPATION_VIVANTE, userId: { in: candidateUserIds } },
      select: { userId: true },
    });
    const vivantUserIds = new Set(vivants.flatMap((p: { userId: string | null }) => (p.userId ? [p.userId] : [])));

    const allUserIds = candidateUserIds.filter((id) => vivantUserIds.has(id));
    if (allUserIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: allUserIds } },
      select: { id: true, displayName: true, username: true, systemLanguage: true, lastActiveAt: true },
    });
    type UserInfo = { displayName: string; username: string; systemLanguage: string | null; lastActiveAt: Date };
    const userMap: Map<string, UserInfo> = new Map(users.map((u: { id: string; displayName: string | null; username: string | null; systemLanguage: string | null; lastActiveAt: Date }) => [u.id, { displayName: u.displayName ?? u.username ?? u.id, username: u.username ?? u.id, systemLanguage: u.systemLanguage, lastActiveAt: u.lastActiveAt }]));

    // A user reconnecting within the inactivity delay is released from agent
    // control (manual picks are always kept).
    const thresholdHours = config?.inactivityThresholdHours ?? DEFAULT_INACTIVITY_THRESHOLD_HOURS;
    const recentLoginThreshold = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);

    const results: ControlledUser[] = roles
      .filter((r: Record<string, any>) => {
        // L'appartenance VIVANTE d'abord, et elle ne se contourne pas : un
        // épinglage manuel saute l'horloge d'inactivité (ci-dessous), jamais
        // cette ligne-ci.
        if (!vivantUserIds.has(r.userId as string)) return false;
        if (manualUserIds.has(r.userId as string)) return true;
        const userInfo = userMap.get(r.userId as string);
        if (!userInfo) return true;
        return userInfo.lastActiveAt < recentLoginThreshold;
      })
      .map((r: Record<string, any>) => ({
      userId: r.userId as string,
      displayName: userMap.get(r.userId as string)?.displayName ?? r.userId,
      username: userMap.get(r.userId as string)?.username ?? r.userId,
      systemLanguage: userMap.get(r.userId as string)?.systemLanguage ?? 'fr',
      source: manualUserIds.has(r.userId as string) ? 'manual' as const : 'auto_rule' as const,
      role: {
        userId: r.userId as string,
        displayName: userMap.get(r.userId as string)?.displayName ?? r.userId,
        origin: r.origin as ToneProfile['origin'],
        archetypeId: r.archetypeId ?? undefined,
        personaSummary: r.personaSummary,
        tone: r.tone,
        vocabularyLevel: r.vocabularyLevel,
        typicalLength: r.typicalLength,
        emojiUsage: r.emojiUsage,
        topicsOfExpertise: r.topicsOfExpertise,
        topicsAvoided: r.topicsAvoided,
        relationshipMap: migrateRelationshipMap(r.relationshipMap),
        catchphrases: r.catchphrases,
        responseTriggers: r.responseTriggers,
        silenceTriggers: r.silenceTriggers,
        commonEmojis: r.commonEmojis,
        reactionPatterns: r.reactionPatterns,
        messagesAnalyzed: r.messagesAnalyzed,
        confidence: r.confidence,
        locked: r.locked,
        traits: unflattenTraits(r),
        dominantEmotions: Array.isArray(r.dominantEmotions) ? r.dominantEmotions as string[] : [],
      },
    }));

    for (const uid of missingManualIds.filter((id) => vivantUserIds.has(id))) {
      results.push({
        userId: uid,
        displayName: userMap.get(uid)?.displayName ?? uid,
        username: userMap.get(uid)?.username ?? uid,
        systemLanguage: userMap.get(uid)?.systemLanguage ?? 'fr',
        source: 'manual',
        role: {
          userId: uid,
          displayName: userMap.get(uid)?.displayName ?? uid,
          origin: 'archetype',
          personaSummary: '',
          tone: 'neutre',
          vocabularyLevel: 'courant',
          typicalLength: 'court',
          emojiUsage: 'occasionnel',
          topicsOfExpertise: [],
          topicsAvoided: [],
          relationshipMap: {},
          catchphrases: [],
          responseTriggers: [],
          silenceTriggers: [],
          commonEmojis: [],
          reactionPatterns: [],
          messagesAnalyzed: 0,
          confidence: 0.1,
          locked: false,
        },
      });
    }

    return results;
  }

  /**
   * UN MEMBRE BANNI N'EST PAS ANIMÉ (#20111).
   *
   * Cette lecture décide **à la place de qui l'agent va parler**. Elle portait
   * `isActive: true` NU, et la ligne `{ isActive: true, bannedAt ≠ null }`
   * existe en base — bannir pendant qu'une participation est inactive n'écrit
   * que `bannedAt` (`conversationBanState.ts`). La migration qui reprendrait les
   * lignes existantes existe (#16690) et n'a été exécutée nulle part. Un membre actif-et-banni était donc éligible, et
   * l'agent publiait un message signé de quelqu'un d'EXCLU dans le fil dont il
   * est exclu : pas une fuite de lecture, une INJECTION de contenu attribuée à
   * une personne bannie.
   *
   * `PARTICIPATION_VIVANTE` vient de `@meeshy/shared` et ne se réécrit pas :
   * `bannedAt: null` seul fermerait l'agent à TOUTE la population (la colonne
   * est ABSENTE du document de qui n'a jamais été banni). C'est pour cette
   * lecture-ci, et ses deux sœurs, que la loi a déménagé dans le paquet
   * partagé — elle vivait dans la passerelle, que ce service ne peut pas
   * importer.
   */
  async getPotentialControlledUsers(
    conversationId: string,
    limit: number,
    thresholdHours: number,
    excludedRoles: string[],
    excludedUserIds: string[],
  ) {
    // Le seuil porte sur la CONNEXION, pas sur l'« activité ».
    //
    // `User.lastActiveAt` bouge sur toute activité de fond — socket rouverte,
    // requête d'une appli en arrière-plan — et ne dit RIEN de la présence.
    // Mesuré en production le 2026-09-08 : `clyf_tone` marqué actif il y a
    // 36 min pour une dernière connexion à 71 JOURS, `La_mignonne` 117 min
    // contre 92 jours. Sélectionner là-dessus écartait exactement les
    // personnes qu'il fallait prendre (#5702).
    //
    // Le signal est `UserSession.lastActivityAt` — l'USAGE du jeton, écrit par
    // le middleware d'authentification (access token) et par `AuthService`
    // (login / refresh). C'est la seule horloge que le porteur reconnaît comme
    // une présence : « le refresh token et l'access token rafraîchissent la
    // connexion, tout le reste non ».
    //
    // Et NON `createdAt` : quelqu'un qui utilise l'app depuis des semaines sans
    // se reconnecter garde une session ancienne mais VIVANTE — `clyf_tone`,
    // session créée il y a 71 jours mais utilisée il y a 66 minutes, serait
    // pilotée à tort.
    //
    // Ni `User.lastActiveAt` : une connexion SOCKET l'écrit
    // (`AuthHandler` → `updateUserOnlineStatus`) en s'authentifiant sur le JWT
    // sans vérifier que la session est encore valide. `La_mignonne` le montre —
    // activité il y a 148 min, sessions expirées depuis 62 JOURS, aucun
    // message : une appli installée qui rouvre sa socket, personne derrière.
    //
    // `sessions: { none: … }` retient qui n'a utilisé AUCUNE session depuis le
    // seuil ; quelqu'un qui n'en a jamais eu passe aussi, ce qui est juste.
    //
    // `isOnline: false` reste un garde-fou dur : quelle que soit l'ancienneté
    // de sa dernière connexion, on ne parle jamais à la place de quelqu'un qui
    // est là MAINTENANT.
    const threshold = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);
    const existingRoles = await this.prisma.agentUserRole.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    const existingRoleUserIds = existingRoles.map((r: { userId: string }) => r.userId);

    const participants = await this.prisma.participant.findMany({
      where: {
        conversationId,
        ...PARTICIPATION_VIVANTE,
        lastActiveAt: { lt: threshold },
        userId: { not: null, notIn: [...excludedUserIds, ...existingRoleUserIds] },
        user: {
          role: { notIn: excludedRoles as UserRole[] },
          isOnline: false,
          sessions: { none: { lastActivityAt: { gte: threshold } } },
        },
      },
      select: {
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            systemLanguage: true,
            agentGlobalProfile: true,
            lastActiveAt: true,
          },
        },
      },
      take: TAILLE_MAX_VIVIER,
    });

    return tirerAuSort(participants.flatMap((p) => (p.user ? [p.user] : [])), limit);
  }

  /** Le repli du sélecteur ci-dessus — même loi, pour la même raison (#20111). */
  async getLeastActiveParticipants(
    conversationId: string,
    limit: number,
    excludedUserIds: string[],
    existingControlledUserIds: string[],
    thresholdHours: number = DEFAULT_INACTIVITY_THRESHOLD_HOURS,
  ) {
    const recentLoginThreshold = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);
    const participants = await this.prisma.participant.findMany({
      where: {
        conversationId,
        ...PARTICIPATION_VIVANTE,
        userId: { not: null, notIn: [...excludedUserIds, ...existingControlledUserIds] },
        user: {
          // Même loi que ci-dessus : la connexion décide, jamais l'activité.
          isOnline: false,
          sessions: { none: { lastActivityAt: { gte: recentLoginThreshold } } },
        },
      },
      select: {
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            systemLanguage: true,
            agentGlobalProfile: true,
            lastActiveAt: true,
          },
        },
      },
      take: TAILLE_MAX_VIVIER,
    });

    return tirerAuSort(participants.flatMap((p) => (p.user ? [p.user] : [])), limit);
  }

  /**
   * La présence d'un utilisateur AU MOMENT DE LIVRER — les deux seules choses
   * qui décident si l'agent peut encore parler à sa place.
   *
   * La connexion se lit sur une session VIVANTE (`isValid` ET non expirée) :
   * 140 sessions expirées se déclaraient valides en production, et une session
   * morte ne prouve aucune présence (#5712). `User.lastActiveAt` est
   * délibérément ABSENT de cette lecture — il est écrit par une socket qui se
   * rouvre seule et déclare présents des gens partis depuis des mois (#5703).
   */
  async getPresenceForDelivery(userId: string): Promise<{ isOnline: boolean; derniereConnexionMs: number | null }> {
    const [session, user] = await Promise.all([
      this.prisma.userSession.findFirst({
        where: { userId, isValid: true, expiresAt: { gt: new Date() } },
        orderBy: { lastActivityAt: 'desc' },
        select: { lastActivityAt: true },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { isOnline: true } }),
    ]);

    return {
      isOnline: user?.isOnline ?? false,
      derniereConnexionMs: session?.lastActivityAt?.getTime() ?? null,
    };
  }

  async getGlobalProfile(userId: string) {
    return this.prisma.agentGlobalProfile.findUnique({ where: { userId } });
  }

  async upsertGlobalProfile(userId: string, data: ReturnType<typeof toneProfileToGlobalFields>) {
    return this.prisma.agentGlobalProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  async getEligibleConversations(options?: {
    eligibleTypes?: string[];
    freshnessHours?: number;
    maxConversations?: number;
  }) {
    const types = options?.eligibleTypes ?? ['group', 'channel', 'public', 'global'];
    const freshnessHours = options?.freshnessHours ?? 24;
    const maxConversations = options?.maxConversations ?? 0;

    const freshnessThreshold = new Date(Date.now() - freshnessHours * 60 * 60 * 1000);
    // Coarse "is this conversation worth scanning" gate; precise per-conversation
    // eligibility is enforced later by getPotentialControlledUsers.
    const recentLoginThreshold = new Date(Date.now() - DEFAULT_INACTIVITY_THRESHOLD_HOURS * 60 * 60 * 1000);

    const [configuredConversations, freshConversations] = await Promise.all([
      this.prisma.conversation.findMany({
        where: {
          type: { in: types },
          isActive: true,
          agentConfig: { enabled: true },
        },
        include: { agentConfig: true },
        orderBy: { lastMessageAt: 'desc' },
      }),
      this.prisma.conversation.findMany({
        where: {
          type: { in: types },
          isActive: true,
          lastMessageAt: { gte: freshnessThreshold },
          agentConfig: null,
        },
        include: { agentConfig: true },
        orderBy: { lastMessageAt: 'desc' },
      }),
    ]);

    const seen = new Set(configuredConversations.map((c: { id: string }) => c.id));
    const merged = [
      ...configuredConversations,
      ...freshConversations.filter((c: { id: string }) => !seen.has(c.id)),
    ];

    const allConvIds = merged.map((c: { id: string }) => c.id);

    const [roleHolders, eligibleParticipantCounts] = await Promise.all([
      // #20208 — un rôle ne compte que si son porteur est encore un
      // participant VIVANT.
      //
      // C'était un `groupBy` qui comptait les rôles SANS regarder la
      // participation, et `hasRoles` court-circuitait la MESURE d'éligibilité
      // que #20111 venait de resserrer : un fil dont tous les rôles sont des
      // bannis ou des partis était retenu à CHAQUE passe, pour que
      // `getControlledUsers` — fail-closed depuis #20111 — n'en serve aucun.
      // Un scan à vide, indéfiniment, puisque rien ne périme un rôle.
      //
      // Le retrait au bannissement et au départ (`releaseAgentRoleFor`, côté
      // passerelle) ferme la source ; cette lecture-ci couvre les lignes DÉJÀ
      // EN BASE, qu'aucune écriture future ne rattrape. Les deux moitiés ne se
      // substituent pas l'une à l'autre.
      this.prisma.agentUserRole.findMany({
        where: { conversationId: { in: allConvIds } },
        select: { conversationId: true, userId: true },
      }),
      this.prisma.participant.groupBy({
        by: ['conversationId'],
        where: {
          conversationId: { in: allConvIds },
          ...PARTICIPATION_VIVANTE,
          // La MESURE porte la même loi que les deux sélecteurs qu'elle garde
          // (#20111). Ici un banni n'est pas une fuite — c'est un nombre FAUX :
          // ce comptage élit les conversations qui valent un scan, et compter
          // un banni comme éligible envoyait scanner un fil dont les trois
          // sélecteurs d'aval ne retiendront personne. Un compte doit dire la
          // même chose que ce qu'il alimente.
          userId: { not: null },
          // Même loi qu'en aval : la CONNEXION décide, pas l'activité.
          //
          // Ce comptage choisit quelles CONVERSATIONS valent un scan. Le laisser
          // sur `lastActiveAt` aurait écarté des conversations entières dont les
          // participants paraissent actifs par une socket qui se rouvre seule —
          // le défaut de #5703, une couche plus haut, et invisible depuis les
          // sélecteurs d'utilisateurs.
          user: {
            isOnline: false,
            sessions: { none: { lastActivityAt: { gte: recentLoginThreshold } } },
          },
        },
        _count: true,
      }),
    ]);

    // La participation VIVANTE des porteurs de rôle, en UNE lecture bornée aux
    // conversations candidates. La paire `conversationId|userId` est la clé :
    // un rôle vaut pour SA conversation, jamais pour une autre.
    const roleHolderIds = [...new Set(roleHolders.flatMap((r: { userId: string | null }) => (r.userId ? [r.userId] : [])))];
    const vivants = roleHolderIds.length === 0 ? [] : await this.prisma.participant.findMany({
      where: { conversationId: { in: allConvIds }, ...PARTICIPATION_VIVANTE, userId: { in: roleHolderIds } },
      select: { conversationId: true, userId: true },
    });
    const paireVivante = new Set(vivants.map((p: { conversationId: string; userId: string | null }) => `${p.conversationId}|${p.userId}`));
    const roleCountMap = roleHolders.reduce<Map<string, number>>((tally, r: { conversationId: string; userId: string | null }) => {
      if (!r.userId || !paireVivante.has(`${r.conversationId}|${r.userId}`)) return tally;
      return tally.set(r.conversationId, (tally.get(r.conversationId) ?? 0) + 1);
    }, new Map());
    const eligibleCountMap = new Map(eligibleParticipantCounts.map((p) => [p.conversationId, p._count]));

    const filtered = merged.filter((c: { id: string; agentConfig: any }) => {
      const hasRoles = (roleCountMap.get(c.id) ?? 0) > 0;
      const hasEligible = (eligibleCountMap.get(c.id) ?? 0) > 0;
      const hasManualUsers = ((c.agentConfig?.manualUserIds as string[]) ?? []).length > 0;
      return hasRoles || hasEligible || hasManualUsers;
    });

    return maxConversations > 0 ? filtered.slice(0, maxConversations) : filtered;
  }

  async getConversationContext(conversationId: string) {
    return this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { title: true, description: true },
    });
  }

  async getConversationWithType(conversationId: string) {
    return this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { title: true, description: true, type: true },
    });
  }

  async getRecentMessageCount(conversationId: string, withinMinutes: number, excludeAgent = false): Promise<number> {
    const since = new Date(Date.now() - withinMinutes * 60 * 1000);
    return this.prisma.message.count({
      where: {
        conversationId,
        createdAt: { gte: since },
        deletedAt: null,
        ...(excludeAgent ? { messageSource: { not: 'agent' } } : {}),
      },
    });
  }

  async getRecentUniqueAuthors(conversationId: string, withinMinutes: number, excludeAgent = false): Promise<number> {
    const since = new Date(Date.now() - withinMinutes * 60 * 1000);
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        createdAt: { gte: since },
        deletedAt: null,
        ...(excludeAgent ? { messageSource: { not: 'agent' } } : {}),
      },
      select: { senderId: true },
      distinct: ['senderId'],
    });
    return messages.length;
  }

  async getAnalytics(conversationId: string) {
    return this.prisma.agentAnalytic.findUnique({ where: { conversationId } });
  }

  async updateAnalytics(conversationId: string, data: { messagesSent: number; wordsSent: number; avgConfidence: number }) {
    const existing = await this.prisma.agentAnalytic.findUnique({ where: { conversationId } });
    const newTotal = (existing?.messagesSent ?? 0) + data.messagesSent;
    const blendedConfidence = existing
      ? (existing.avgConfidence * existing.messagesSent + data.avgConfidence * data.messagesSent) / Math.max(1, newTotal)
      : data.avgConfidence;

    return this.prisma.agentAnalytic.upsert({
      where: { conversationId },
      create: {
        conversationId,
        messagesSent: data.messagesSent,
        totalWordsSent: data.wordsSent,
        avgConfidence: data.avgConfidence,
        lastResponseAt: new Date(),
      },
      update: {
        messagesSent: { increment: data.messagesSent },
        totalWordsSent: { increment: data.wordsSent },
        avgConfidence: blendedConfidence,
        lastResponseAt: new Date(),
      },
    });
  }

  async getGlobalConfig() {
    return this.prisma.agentGlobalConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
  }

  async getSummaryRecord(conversationId: string) {
    return this.prisma.agentConversationSummary.findUnique({ where: { conversationId } });
  }

  async getAgentMessageEngagement(conversationId: string, withinHours: number): Promise<{ userId: string; repliesReceived: number; reactionsReceived: number }[]> {
    const since = new Date(Date.now() - withinHours * 60 * 60 * 1000);
    const agentMessages = await this.prisma.message.findMany({
      where: {
        conversationId,
        messageSource: 'agent',
        createdAt: { gte: since },
        deletedAt: null,
      },
      select: {
        id: true,
        senderId: true,
        _count: { select: { reactions: true } },
        replies: { where: { messageSource: { not: 'agent' }, deletedAt: null }, select: { id: true } },
      },
    });

    const byUser = new Map<string, { repliesReceived: number; reactionsReceived: number }>();
    for (const msg of agentMessages) {
      const uid = msg.senderId ?? 'unknown';
      const existing = byUser.get(uid) ?? { repliesReceived: 0, reactionsReceived: 0 };
      existing.repliesReceived += msg.replies.length;
      existing.reactionsReceived += msg._count.reactions;
      byUser.set(uid, existing);
    }

    return [...byUser.entries()].map(([userId, stats]) => ({ userId, ...stats }));
  }

  /**
   * Update the in-flight scan marker. Pass a Date to start, null to clear.
   * `scanStartedAt=null` is the definitive "not scanning" state.
   */
  async updateScanStatus(conversationId: string, scanStartedAt: Date | null, currentNode: string | null) {
    return this.prisma.agentConfig.upsert({
      where: { conversationId },
      create: { conversationId, scanStartedAt, currentNode },
      update: { scanStartedAt, currentNode },
    });
  }

  async createScanLog(data: Record<string, unknown>) {
    return this.prisma.agentScanLog.create({ data: data as any });
  }

  async getRecentMessages(conversationId: string, limit: number) {
    return this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
      },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            user: { select: { username: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
