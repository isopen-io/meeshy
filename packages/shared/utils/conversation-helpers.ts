/**
 * Helpers utilitaires pour les conversations
 * Logique métier réutilisable entre Gateway et Frontend
 */
import { normalizeLanguageCode } from './language-normalize.js';

/**
 * Options de résolution de langue. La locale appareil intervient en 4e priorité
 * du Prisme Linguistique (2026-05-26) — elle ne supplante jamais les
 * préférences in-app.
 *
 * @see docs/superpowers/specs/2026-05-26-device-locale-fourth-priority-design.md
 */
export type ResolveUserLanguageOpts = {
  /**
   * Locale appareil (`Locale.current.identifier` iOS, `Accept-Language` web).
   * Normalisée en interne via {@link normalizeLanguageCode}.
   */
  deviceLocale?: string;
};

/**
 * Résout la langue préférée d'un utilisateur pour l'affichage de contenu.
 *
 * Ordre :
 *   1. systemLanguage           (préférence in-app primaire)
 *   2. regionalLanguage         (préférence in-app secondaire)
 *   3. customDestinationLanguage (override personnalisé)
 *   4. deviceLocale             (locale appareil — Prisme étendu 2026-05-26)
 *   5. 'fr'                     (fallback ultime)
 *
 * Les préférences in-app sont lowercased à la lecture — parité stricte avec
 * {@link resolveUserLanguagesOrdered}. `isSupportedLanguage` valide les codes de
 * manière insensible à la casse (il lowercase avant lookup) mais ne les
 * transforme pas : un `systemLanguage: 'EN'` est donc accepté et persisté
 * verbatim. Sans ce lowercase, `meta.userLanguage` renverrait `'EN'` alors que
 * le pipeline de traduction stocke ses cibles en minuscules (`'en'`) — le client
 * manquerait la traduction et retomberait sur l'original (violation du Prisme).
 *
 * L'option `deviceLocale` est facultative — les call sites legacy qui passent
 * un seul argument restent valides. `normalizeLanguageCode` retourne déjà un
 * code lowercase pour la locale appareil.
 *
 * @see resolveUserLanguagesOrdered pour la liste complète (sans fallback 'fr')
 */
export function resolveUserLanguage(
  user: {
    systemLanguage?: string | null;
    regionalLanguage?: string | null;
    customDestinationLanguage?: string | null;
  },
  opts: ResolveUserLanguageOpts = {}
): string {
  if (user.systemLanguage) return user.systemLanguage.toLowerCase();
  if (user.regionalLanguage) return user.regionalLanguage.toLowerCase();
  if (user.customDestinationLanguage) return user.customDestinationLanguage.toLowerCase();
  const normalized = normalizeLanguageCode(opts.deviceLocale);
  if (normalized) return normalized;
  return 'fr';
}

/**
 * Liste ordonnée et dédupliquée des langues préférées d'un utilisateur.
 * Utilisée pour itérer sur les traductions disponibles dans l'ordre de
 * priorité du Prisme Linguistique :
 *   systemLanguage → regionalLanguage → customDestinationLanguage → deviceLocale
 *
 * Les codes sont lowercased pour la déduplication. La locale appareil est
 * normalisée via {@link normalizeLanguageCode} avant insertion.
 *
 * Cette fonction NE retourne PAS de fallback `'fr'` : si tout est vide, la
 * liste est vide et le caller décide (afficher l'original, défaut métier, etc.).
 */
export function resolveUserLanguagesOrdered(
  user: {
    systemLanguage?: string | null;
    regionalLanguage?: string | null;
    customDestinationLanguage?: string | null;
  },
  opts: ResolveUserLanguageOpts = {}
): string[] {
  const candidates: Array<string | null | undefined> = [
    user.systemLanguage,
    user.regionalLanguage,
    user.customDestinationLanguage,
    normalizeLanguageCode(opts.deviceLocale),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (!c) continue;
    const lc = c.toLowerCase();
    if (seen.has(lc)) continue;
    seen.add(lc);
    out.push(lc);
  }
  return out;
}

/**
 * Collecte toutes les langues cibles pour la traduction automatique d'un utilisateur.
 * autoTranslate ON → systemLanguage (toujours) + regionalLanguage (si configurée)
 */
export function resolveUserTranslationLanguages(user: {
  systemLanguage?: string;
  regionalLanguage?: string;
}): string[] {
  const seen = new Set<string>();
  if (user.systemLanguage?.trim()) seen.add(user.systemLanguage.trim());
  if (user.regionalLanguage?.trim()) seen.add(user.regionalLanguage.trim());
  return seen.size > 0 ? Array.from(seen) : ['fr'];
}

/**
 * Génère un identifiant unique pour une conversation
 * Format: mshy_<titre_sanitisé>-YYYYMMDDHHMMSS ou mshy_<unique_id>-YYYYMMDDHHMMSS si pas de titre
 */
export function generateConversationIdentifier(title?: string): string {
  const now = new Date();
  // Use UTC methods for consistent identifiers across timezones
  const timestamp = now.getUTCFullYear().toString() +
    (now.getUTCMonth() + 1).toString().padStart(2, '0') +
    now.getUTCDate().toString().padStart(2, '0') +
    now.getUTCHours().toString().padStart(2, '0') +
    now.getUTCMinutes().toString().padStart(2, '0') +
    now.getUTCSeconds().toString().padStart(2, '0');

  if (title) {
    // Sanitiser le titre :
    // 1. Convertir les caractères allemands en équivalents romans (ö→oe, ü→ue, ä→ae, ß→ss)
    // 2. Normaliser les accents (NFD décompose é en e + accent, puis on supprime les accents)
    // 3. Enlever les caractères spéciaux, remplacer les espaces par des tirets
    const sanitizedTitle = title
      // Caractères allemands → équivalents romans
      .replace(/ö/g, 'oe')
      .replace(/Ö/g, 'Oe')
      .replace(/ü/g, 'ue')
      .replace(/Ü/g, 'Ue')
      .replace(/ä/g, 'ae')
      .replace(/Ä/g, 'Ae')
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Supprimer les diacritiques (accents)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Garder seulement lettres, chiffres, espaces et tirets
      .replace(/\s+/g, '-') // Remplacer les espaces par des tirets
      .replace(/-+/g, '-') // Remplacer les tirets multiples par un seul
      .replace(/^-|-$/g, ''); // Enlever les tirets en début/fin

    if (sanitizedTitle.length > 0) {
      return `mshy_${sanitizedTitle}-${timestamp}`;
    }
  }

  // Fallback: générer un identifiant unique avec préfixe mshy_
  const uniqueId = Math.random().toString(36).slice(2, 10);
  return `mshy_${uniqueId}-${timestamp}`;
}

/**
 * Résout la langue préférée d'un participant unifié (user, anonymous, bot).
 *
 * Applique l'ordre canonique du Prisme Linguistique étendu (2026-05-26) en
 * déléguant à {@link resolveUserLanguage} :
 *   1. systemLanguage
 *   2. regionalLanguage
 *   3. customDestinationLanguage
 *   4. deviceLocale (si connu côté serveur)
 *   5. participant.language (fallback métier — JAMAIS `'fr'` ici)
 *
 * Le fallback diffère de `resolveUserLanguage` parce qu'un participant non-user
 * (anonymous, bot) ou un user sans préférence configurée doit retomber sur la
 * langue déclarée par le call site (typiquement la langue de la conversation
 * ou la langue déduite du message original), pas sur la default app `'fr'`.
 */
type LanguageResolvable = {
  type: string
  language: string
  user?: {
    customDestinationLanguage?: string | null
    regionalLanguage?: string | null
    systemLanguage?: string | null
    deviceLocale?: string | null
  } | null
}

export function resolveParticipantLanguage(participant: LanguageResolvable): string {
  if (participant.type !== 'user' || !participant.user) {
    return participant.language
  }
  const user = participant.user
  if (user.systemLanguage) return user.systemLanguage.toLowerCase()
  if (user.regionalLanguage) return user.regionalLanguage.toLowerCase()
  if (user.customDestinationLanguage) return user.customDestinationLanguage.toLowerCase()
  const normalizedDevice = normalizeLanguageCode(user.deviceLocale)
  if (normalizedDevice) return normalizedDevice
  return participant.language
}

/**
 * Vérifie si un identifiant est un ObjectID MongoDB valide
 */
export function isValidMongoId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * Calcule si un message peut encore être modifié (1 heure max pour users normaux)
 */
export function canEditMessage(
  createdAt: Date | string,
  userRole: string = 'USER'
): { canEdit: boolean; reason?: string } {
  // Admins et BIGBOSS peuvent toujours modifier (case-insensitive — DB may store lowercase)
  if (['ADMIN', 'BIGBOSS', 'MODERATOR', 'CREATOR'].includes(userRole.toUpperCase())) {
    return { canEdit: true };
  }
  
  const messageDate = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const messageAge = Date.now() - messageDate.getTime();
  const oneHourInMs = 60 * 60 * 1000;
  
  if (messageAge > oneHourInMs) {
    return {
      canEdit: false,
      reason: 'MESSAGE_TOO_OLD',
    };
  }
  
  return { canEdit: true };
}

/**
 * Génère un titre par défaut pour une conversation sans titre
 */
export function generateDefaultConversationTitle(
  members: Array<{ id?: string; displayName?: string; username?: string; firstName?: string; lastName?: string }>,
  currentUserId: string
): string {
  const otherMembers = members.filter((m) => m.id !== currentUserId);
  
  if (otherMembers.length === 0) {
    return 'Conversation';
  }
  
  if (otherMembers.length === 1) {
    const member = otherMembers[0];
    if (member) {
      const fullName = [member.firstName, member.lastName]
        .filter((p): p is string => !!p && p.trim().length > 0)
        .map(p => p.trim())
        .join(' ');
      return member.displayName?.trim() || member.username?.trim() || fullName || 'Unknown User';
    }
    return 'Unknown User';
  }
  
  const resolveName = (m: { displayName?: string; username?: string; firstName?: string; lastName?: string }): string => {
    const fullName = [m.firstName, m.lastName]
      .filter((p): p is string => !!p && p.trim().length > 0)
      .map(p => p.trim())
      .join(' ');
    return m.displayName?.trim() || m.username?.trim() || fullName || 'Unknown User';
  };

  if (otherMembers.length === 2) {
    return otherMembers.map(resolveName).join(', ');
  }

  // 3+ membres
  const firstTwo = otherMembers.slice(0, 2).map(resolveName);
  return `${firstTwo.join(', ')} and ${otherMembers.length - 2} other(s)`;
}

/**
 * Calcule les langues requises pour une conversation.
 *
 * Propage la locale appareil (`deviceLocale`) au calcul de résolution
 * lorsqu'elle est connue côté serveur (cf. `User.deviceLocale`, Prisme
 * étendu 2026-05-26). La locale appareil n'écrase jamais une préférence
 * in-app sur le même membre.
 *
 * **Limite** : ce helper ne collecte qu'**une seule langue par membre** — la
 * top-priority retournée par {@link resolveUserLanguage} (donc 1 seule des 4
 * sources par membre). Un utilisateur avec `systemLanguage: 'fr'` et
 * `deviceLocale: 'it'` ne contribuera que `'fr'` au résultat ; `'it'` n'apparaîtra
 * pas dans la liste des destinations.
 *
 * Pour la liste complète des langues d'un membre (tous les niveaux du Prisme,
 * dans l'ordre system → regional → custom → device), utiliser plutôt
 * {@link resolveUserLanguagesOrdered}.
 */
export function getRequiredLanguages(
  conversationMembers: Array<{
    systemLanguage?: string | null;
    regionalLanguage?: string | null;
    customDestinationLanguage?: string | null;
    deviceLocale?: string | null;
  }>
): string[] {
  const languages = new Set<string>();

  conversationMembers.forEach(user => {
    const lang = resolveUserLanguage(user, {
      deviceLocale: user.deviceLocale ?? undefined,
    });
    if (lang) {
      languages.add(lang);
    }
  });

  return Array.from(languages);
}
