/**
 * Helpers utilitaires pour les conversations
 * Logique métier réutilisable entre Gateway et Frontend
 */
import { normalizeLanguageCode, normalizeLanguageForDedup } from './language-normalize.js';
import { OBJECT_ID_REGEX } from './object-id.js';

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
 * Les préférences in-app sont normalisées à la lecture via
 * {@link normalizeInAppLanguage} — parité stricte avec le niveau `deviceLocale`
 * et avec {@link resolveUserLanguagesOrdered}. Les prefs sont persistées verbatim
 * (`z.string().optional()`, aucune normalisation à l'écriture) : un
 * `systemLanguage: 'EN'` devient `'en'`, et un `'pt-BR'` (produit par le web ou
 * iOS) devient `'pt'`. Sans cette normalisation, `meta.userLanguage` renverrait
 * `'EN'`/`'pt-br'` alors que le pipeline de traduction stocke ses cibles en
 * minuscules 2-lettres (`'en'`, `'pt'`) — le client manquerait la traduction et
 * retomberait sur l'original (violation du Prisme).
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
  const system = normalizeInAppLanguage(user.systemLanguage);
  if (system) return system;
  const regional = normalizeInAppLanguage(user.regionalLanguage);
  if (regional) return regional;
  const custom = normalizeInAppLanguage(user.customDestinationLanguage);
  if (custom) return custom;
  const normalized = normalizeLanguageCode(opts.deviceLocale);
  if (normalized) return normalized;
  return 'fr';
}

/**
 * Normalise un niveau de préférence in-app avec parité stricte vis-à-vis du
 * niveau `deviceLocale`. Les prefs in-app sont persistées verbatim
 * (`z.string().optional()`, aucune normalisation à l'écriture), donc une valeur
 * BCP-47 (`'pt-BR'`, `'en-US'`, `'fr_FR'`) produite par le web
 * (`Accept-Language`) ou iOS (`Locale.current.identifier`) peut atteindre le
 * resolver. Un simple `.toLowerCase()` donnerait `'pt-br'`, qui ne matche jamais
 * les clés de traduction 2-lettres lowercase (`'pt'`) — violation du Prisme,
 * exactement le bug que {@link normalizeLanguageCode} corrige déjà côté
 * deviceLocale.
 *
 * Retourne `undefined` quand la préférence est absente OU structurellement
 * invalide (vide/espaces après trim, séparateurs seuls, sous-tag primaire de
 * moins de 2 lettres alphabétiques) : une telle valeur n'est PAS un code de
 * langue et doit être traitée comme NON DÉFINIE pour laisser la résolution
 * tomber sur le niveau suivant du Prisme. La ressusciter verbatim (`'  '`,
 * `'-'`, `'e'`) renverrait un code qui ne matche aucune traduction et forcerait
 * le client sur l'original alors qu'une préférence valide de priorité inférieure
 * existe — violation directe du Prisme.
 *
 * Repli `.toLowerCase()` du sous-tag primaire : zéro régression pour les codes
 * que `normalizeLanguageCode` ne sait pas canoniser mais qui restent des codes
 * plausibles (ISO 639-3 inconnu irréductible, `'ZZZ'` → `'zzz'`) — ils sont
 * conservés comme avant, seul le repli des valeurs NON-CODE change.
 */
function normalizeInAppLanguage(code: string | null | undefined): string | undefined {
  if (!code) return undefined;
  const normalized = normalizeLanguageCode(code);
  if (normalized) return normalized;
  const primary = code.split(/[-_]/)[0]?.trim().toLowerCase();
  return primary && /^[a-z]{2,}$/.test(primary) ? primary : undefined;
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
    normalizeInAppLanguage(user.systemLanguage),
    normalizeInAppLanguage(user.regionalLanguage),
    normalizeInAppLanguage(user.customDestinationLanguage),
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
 * Applique le Prisme Linguistique à l'aperçu du dernier message d'une ligne de
 * liste de conversations.
 *
 * Jumeau TypeScript de
 * `MeeshyConversation.resolvedLastMessagePreview(preferredLanguages:)`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift`). Les deux
 * plateformes rendent la même ligne depuis la même charge REST — la carte
 * `lastMessageTranslations` et `lastMessageOriginalLanguage` posées par
 * `GET /conversations`. Toute divergence de résolution ferait afficher deux
 * textes différents pour un même compte selon le client.
 *
 * Le prisme est ORDONNÉ, et la langue d'origine y concourt **à son propre
 * rang** — jamais comme court-circuit global. On descend les langues du lecteur
 * dans l'ordre ; la première qui est servie gagne, qu'elle le soit par une
 * traduction ou parce que le message est déjà écrit dedans :
 *
 *   pour chaque langue L du prisme, dans l'ordre :
 *     L est la langue d'origine  ⇒ l'aperçu brut (le message EST en L)
 *     une traduction existe en L ⇒ cette traduction
 *   aucune ⇒ l'aperçu brut
 *
 * **Pourquoi le rang, et pas « la langue d'origine est quelque part dans le
 * prisme ⇒ l'original »** — cette seconde formulation (celle que portait iOS,
 * et le premier jet de ce jumeau) rétrograde silencieusement la langue PRIMAIRE
 * du lecteur dès que la langue d'origine apparaît plus bas dans son prisme.
 * C'est exactement le cas décrit par `CLAUDE.md` : « un utilisateur francophone
 * avec un iPhone en anglais voit TOUJOURS ses messages en français (priorité 1) ;
 * la locale anglaise n'intervient que si aucune traduction française n'est
 * disponible ». Prisme `['fr', 'en']`, message anglais, traduction française
 * disponible : la formulation par appartenance rend « Hello », la formulation
 * par rang rend « Bonjour ». Seule la seconde respecte la règle produit, et
 * c'est aussi ce que fait déjà le chemin du CORPS des messages
 * (`use-message-translations`, qui compare la langue d'origine à la SEULE
 * langue de tête). La ligne de liste était la dernière à en diverger.
 *
 * **Règle critique du Prisme (#3) : ne JAMAIS retomber sur une traduction
 * quelconque.** L'absence de traduction vers une langue du lecteur signifie que
 * le contenu est déjà dans cette langue, ou qu'aucune traduction n'a été
 * produite — servir une troisième langue serait pire que l'original.
 *
 * Les trois sources de codes comparées — langues du lecteur, langue d'origine,
 * clés de la carte — sont CANONICALISÉES par la même SSOT
 * ({@link normalizeLanguageForDedup} : casse repliée ET région strippée,
 * `'en-US'`/`'EN'` → `'en'`), jamais un simple `.toLowerCase()`. La raison est un
 * défaut mesuré : `resolveUserLanguagesOrdered` strippe déjà la région des
 * langues du lecteur, mais `originalLanguage` arrive brut du fil, et les messages
 * écrits AVANT la canonicalisation au write-boundary (`MessagingService`,
 * `normalizeLanguageCode(claimedLanguage)`) portent encore un
 * `Message.originalLanguage` région-tagué (`'en-US'`, `'pt-BR'`). Comparée en
 * minuscules seule, une origine `'en-us'` ne matchait jamais le rang normalisé
 * `'en'` du prisme, et une traduction de rang INFÉRIEUR gagnait — rétrogradant la
 * langue PRIMAIRE du lecteur, la violation exacte du Prisme (#3) que ce résolveur
 * combat. Canonicaliser les trois sources au point de comparaison rend le
 * résolveur robuste quelle que soit la normalisation de l'appelant, et idempotent
 * sur les codes déjà canoniques (zéro régression). iOS minuscule ses clés au
 * décodage et le web consomme la charge telle quelle : la normalisation doit
 * vivre ici pour que les deux plateformes restent d'accord.
 *
 * `preferredLanguages` doit être ordonnée — c'est la sortie de
 * {@link resolveUserLanguagesOrdered}, jamais une liste reconstruite à la main.
 */
export function resolveLastMessagePreview(params: {
  preview: string | null | undefined;
  translations?: Readonly<Record<string, string>> | null;
  originalLanguage?: string | null;
  preferredLanguages: readonly string[];
}): string | null | undefined {
  const { preview, translations, originalLanguage, preferredLanguages } = params;

  if (!translations || typeof translations !== 'object') return preview;

  const resolved = resolvePrismTranslation({
    translations,
    originalLanguage,
    preferredLanguages,
  });

  return resolved ? resolved.text : preview;
}

/**
 * La DESCENTE du Prisme elle-même, rendue avec la langue qui a gagné.
 *
 * `resolveLastMessagePreview` n'en est qu'une projection : il rend un texte, ce
 * qui suffit à une ligne de liste. Les consommateurs qui doivent DIRE dans
 * quelle langue ils servent — la bannière de notification, qui pousse
 * `translatedContent` et `translatedLanguage` côte à côte sur le fil APNs — ont
 * besoin de la paire. Sans cette unité ils réécriraient la boucle chez eux :
 * c'est exactement ce qu'ont produit les cycles 118 à 120, où chaque famille de
 * contenu portait sa propre descente et où trois d'entre elles ne descendaient
 * pas.
 *
 * `null` ⇒ **servir l'original**, jamais « pas de résultat » : soit la langue
 * d'origine a gagné à son rang, soit aucune langue du lecteur n'est servie —
 * et dans les deux cas la règle #1 du Prisme dit que le contenu original est
 * ce qu'il faut montrer. Ne JAMAIS y substituer une traduction quelconque.
 *
 * La clé rendue est celle **STOCKÉE dans la carte**, pas sa forme canonique :
 * la comparaison se normalise, la valeur rendue non (cycle 119). Elle repart
 * sur le fil et sert de clé à des lecteurs qui rapprochent par égalité stricte.
 *
 * `preferredLanguages` doit être ordonnée — c'est la sortie de
 * {@link resolveUserLanguagesOrdered}, jamais une liste reconstruite à la main.
 */
export function resolvePrismTranslation(params: {
  translations?: Readonly<Record<string, string>> | null;
  originalLanguage?: string | null;
  preferredLanguages: readonly string[];
}): { readonly language: string; readonly text: string } | null {
  const { translations, originalLanguage, preferredLanguages } = params;

  if (!translations || typeof translations !== 'object') return null;

  const preferred = preferredLanguages
    .filter((lang): lang is string => typeof lang === 'string' && lang.trim() !== '')
    .map(normalizeLanguageForDedup);
  if (preferred.length === 0) return null;

  const original = originalLanguage ? normalizeLanguageForDedup(originalLanguage) : undefined;

  const byCanonicalKey = new Map<string, { readonly language: string; readonly text: string }>();
  for (const [lang, text] of Object.entries(translations)) {
    if (typeof text !== 'string' || text.trim() === '') continue;
    const canonical = normalizeLanguageForDedup(lang);
    if (byCanonicalKey.has(canonical)) continue;
    byCanonicalKey.set(canonical, { language: lang, text });
  }

  for (const lang of preferred) {
    if (original && lang === original) return null;
    const translated = byCanonicalKey.get(lang);
    if (translated !== undefined) return translated;
  }

  return null;
}

/**
 * Génère un identifiant unique pour une conversation
 * Format: mshy_<titre_sanitisé>-YYYYMMDDHHMMSS ou mshy_<unique_id>-YYYYMMDDHHMMSS si pas de titre
 */
/**
 * Longueur maximale du slug lisible d'un identifiant de conversation.
 *
 * 50 (plafond impose par l'API aux identifiants clients) moins `mshy_` (5),
 * le separateur (1) et l'horodate `YYYYMMDDHHMMSS` (14) = 30.
 */
const MAX_IDENTIFIER_SLUG_LENGTH = 30;

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
      // Plafond : `mshy_` (5) + slug + `-` (1) + horodate (14) = 20 + slug.
      // L'API refuse au-dela de 50 les identifiants soumis par les clients
      // (packages/shared/utils/validation.ts) ; le serveur doit s'y tenir
      // aussi. Un slug de 30 laisse donc exactement 50, et un titre de 37
      // caracteres — parfaitement ordinaire — depassait auparavant.
      // Le tiret final eventuel est retire : sans cela, un slug tronque sur
      // un separateur produirait `--` devant l'horodate.
      const cappedTitle = sanitizedTitle.slice(0, MAX_IDENTIFIER_SLUG_LENGTH).replace(/-+$/, '');
      return `mshy_${cappedTitle}-${timestamp}`;
    }
  }

  // Fallback: générer un identifiant unique avec préfixe mshy_
  return generateCompactConversationIdentifier();
}

/**
 * Alphabet base64url — 64 symboles, donc exactement 6 bits par caractère.
 *
 * Le choix n'est pas cosmétique : avec un alphabet dont la taille est une
 * puissance de deux, `octet & 63` est UNIFORME. Un alphabet de 62 (base62)
 * imposerait `octet % 62`, qui sur-représente les 8 premiers symboles — un
 * biais invisible en lecture et qui réduit l'entropie réelle. C'est aussi
 * l'alphabet exact qu'accepte la validation d'identifiant de l'API
 * (`/^[a-zA-Z0-9\-_]+$/`, packages/shared/utils/validation.ts).
 */
const COMPACT_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const COMPACT_ID_LENGTH = 12;

/**
 * Génère un identifiant de conversation COMPACT, opaque et URL-safe.
 *
 * Format : `mshy_` + 12 caractères base64url = **17 caractères**.
 *
 * Remplace la concaténation des ObjectId des participants, qui souffrait de
 * deux défauts distincts :
 *
 * 1. **Longueur** — `mshy_<oid24>_<oid24>` fait 54 caractères et
 *    `direct_<oid24>_<oid24>_<ms>` en fait 69, alors que l'API refuse au-delà
 *    de 50 les identifiants que lui soumettent les clients. Le serveur
 *    s'affranchissait d'une règle qu'il imposait aux autres.
 * 2. **Fuite d'information** — un identifiant de conversation est PUBLIC : il
 *    circule dans les URL et les liens de partage. Y encoder l'ObjectId des
 *    deux participants revenait à publier qui parle à qui. Un identifiant
 *    opaque ne dit rien de ses membres.
 *
 * Entropie : 12 × 6 = **72 bits**. Sur 10⁷ conversations, la probabilité de
 * collision reste de l'ordre de 10⁻⁸ ; la contrainte `@unique` en base reste
 * le filet de sécurité, elle n'est pas la première ligne de défense.
 *
 * L'aléa vient de `crypto.getRandomValues` — cryptographiquement sûr et
 * disponible aussi bien sous Node que dans un navigateur. `Math.random()`,
 * qu'employait l'ancien fallback, est prédictible : pour un identifiant que
 * l'on peut tenter de deviner, c'est une faiblesse, pas un détail.
 */
export function generateCompactConversationIdentifier(): string {
  const bytes = new Uint8Array(COMPACT_ID_LENGTH);
  globalThis.crypto.getRandomValues(bytes);

  let id = '';
  for (const byte of bytes) id += COMPACT_ID_ALPHABET[byte & 63];

  return `mshy_${id}`;
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
  // Le fallback (langue déclarée par le call site) est normalisé comme les
  // niveaux de resolveUserLanguagesOrdered : le docstring promet la « même
  // normalisation que resolveUserLanguage » pour TOUS les chemins de retour.
  // Ces niveaux réduisent la casse ET les sous-tags région/script — via
  // normalizeLanguageCode pour les codes catalogués ('it-IT' → 'it', 'FR' → 'fr')
  // et via le strip du sous-tag primaire pour ceux qu'il ne sait pas réduire
  // (normalizeInAppLanguage côté prefs). Un fallback laissé région-taggé
  // ('pt-BR' → 'pt-br') ou en casse haute manquerait les traductions indexées
  // en minuscules 2/3-lettres exactement comme une préférence in-app non
  // normalisée (violation du Prisme). normalizeLanguageForDedup EST ce contrat
  // — normalizeLanguageCode ?? strip-du-sous-tag-primaire, jamais `undefined` —
  // donc l'appeler garantit la parité stricte annoncée y compris pour un code
  // UNCATALOGUÉ région-taggé ('yue-HK' → 'yue', que le repli `?? .toLowerCase()`
  // laissait à 'yue-hk', divergent du chemin inscrit qui, lui, strippe).
  const fallback = normalizeLanguageForDedup(participant.language)
  if (participant.type !== 'user' || !participant.user) {
    return fallback
  }
  // Délègue à la source de vérité unique (SSOT) : mêmes 4 niveaux, même
  // normalisation de casse que resolveUserLanguage — ne PAS ré-implémenter
  // l'échelle ici (règle CLAUDE.md). Seul le fallback diffère : la langue
  // déclarée par le call site plutôt que la default app 'fr'.
  const [top] = resolveUserLanguagesOrdered(participant.user, {
    deviceLocale: participant.user.deviceLocale ?? undefined,
  })
  return top ?? fallback
}

/**
 * Vérifie si un identifiant est un ObjectID MongoDB valide.
 *
 * Délègue à la SSOT {@link OBJECT_ID_REGEX} (`utils/object-id.ts`) — ne PAS
 * réinliner la regex ici. Nom conservé pour ses consommateurs (gateway
 * `routes/users/blocking.ts`).
 */
export function isValidMongoId(id: string): boolean {
  return OBJECT_ID_REGEX.test(id);
}

/**
 * Calcule si un message peut encore être modifié (SSOT de la fenêtre d'édition).
 *
 * Parité stricte avec les chemins autoritaires qui, aujourd'hui, réimplémentent
 * la même règle chacun de leur côté :
 *  - socket : `MessageHandler.handleMessageEdit` (`EDIT_WINDOW_MS = 24h`)
 *  - REST   : `routes/conversations/messages-advanced.ts` (`twentyFourHoursInMs`)
 *  - web    : `hooks/use-message-interactions` (`twentyFourHoursInMs`)
 *
 * Un utilisateur normal dispose de 24 heures ; le contournement de la fenêtre
 * est un privilège de rôle GLOBAL (MODERATOR/ADMIN/BIGBOSS), jamais un rôle de
 * conversation (admin/moderator/member) — comparé en majuscules car la DB peut
 * stocker le rôle en minuscules. Un `createdAt` invalide (Date → NaN) ne bloque
 * jamais : `NaN > window` est faux, exactement comme les trois sites ci-dessus.
 */
export function canEditMessage(
  createdAt: Date | string,
  userRole: string = 'USER'
): { canEdit: boolean; reason?: string } {
  if (['MODERATOR', 'ADMIN', 'BIGBOSS'].includes(userRole.toUpperCase())) {
    return { canEdit: true };
  }

  const messageDate = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const messageAge = Date.now() - messageDate.getTime();
  const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

  if (messageAge > EDIT_WINDOW_MS) {
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
    // resolveUserLanguage retourne toujours une string non-vide (fallback 'fr').
    languages.add(
      resolveUserLanguage(user, { deviceLocale: user.deviceLocale ?? undefined })
    );
  });

  return Array.from(languages);
}
