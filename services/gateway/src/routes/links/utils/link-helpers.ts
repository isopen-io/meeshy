import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { generateConversationIdentifier as sharedGenerateConversationIdentifier, isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';
import { generateShortToken } from '../../../services/TrackingLinkService';
import {
  generatePublicIdentifier,
  generateUniquePublicIdentifier,
  PUBLIC_ID_LENGTH
} from '../../../utils/public-identifier';
import type { UnifiedAuthRequest } from '../../../middleware/auth';
import { isRegisteredUser } from '../../../middleware/auth';

/**
 * Adapte le nouveau contexte d'authentification unifié au format legacy
 */
export function createLegacyHybridRequest(request: UnifiedAuthRequest): any {
  const authContext = request.authContext;

  if (isRegisteredUser(authContext)) {
    return {
      isAuthenticated: true,
      isAnonymous: false,
      user: authContext.registeredUser,
      anonymousParticipant: null
    };
  } else if ((authContext.type === 'anonymous') && authContext.anonymousUser) {
    return {
      isAuthenticated: true,
      isAnonymous: true,
      user: null,
      anonymousParticipant: {
        id: authContext.anonymousUser.sessionToken,
        username: authContext.anonymousUser.username,
        firstName: authContext.anonymousUser.firstName,
        lastName: authContext.anonymousUser.lastName,
        language: authContext.anonymousUser.language,
        shareLinkId: authContext.anonymousUser.shareLinkId,
        canSendMessages: authContext.anonymousUser.permissions.canSendMessages,
        canSendFiles: authContext.anonymousUser.permissions.canSendFiles,
        canSendImages: authContext.anonymousUser.permissions.canSendImages
      }
    };
  } else {
    return {
      isAuthenticated: false,
      isAnonymous: false,
      user: null,
      anonymousParticipant: null
    };
  }
}

/**
 * Résout l'ID de ConversationShareLink réel à partir d'un identifiant
 */
export async function resolveShareLinkId(prisma: PrismaClient, identifier: string): Promise<string | null> {
  if (isValidMongoId(identifier)) {
    return identifier;
  }

  const shareLink = await prisma.conversationShareLink.findFirst({
    where: { identifier: identifier }
  });

  return shareLink ? shareLink.id : null;
}

/**
 * Préfixe de marque des identifiants publics de lien. Conservé : c'est lui que
 * `getShareLinkByIdentifier` reconnaît pour ne PAS traiter la valeur comme un
 * ObjectId, et il distingue à l'œil un lien Meeshy d'un identifiant quelconque.
 */
export const SHARE_LINK_ID_PREFIX = 'mshy_';

/**
 * Le dimensionnement et l'escalade anti-collision vivent dans
 * `utils/public-identifier.ts` — une seule loi pour tous les identifiants
 * publics du service (lien de partage, jeton d'affiliation). Ré-exporté ici
 * sous son nom de famille pour que les appelants du domaine « lien » n'aient
 * pas à connaître le module générique.
 */
export const SHARE_LINK_ID_LENGTH = PUBLIC_ID_LENGTH;

/**
 * Identifiant PUBLIC de lien de partage — `mshy_` + 8 caractères base62.
 *
 * **13 caractères**, contre 49 avant le 2026-08-23 :
 * `mshy_<ObjectId 24>.<yymmddhhmm>_<8 base36>`. Trois défauts d'un coup, les
 * mêmes que ceux corrigés sur l'identifiant de conversation la veille :
 *
 * 1. **Longueur** — 49 caractères pour une valeur qui vit dans une URL qu'on
 *    lit au téléphone, qu'on dicte, qu'on colle dans un SMS. Et 49, c'est à un
 *    caractère du plafond de 50 que `validation.ts` impose aux identifiants
 *    soumis par les clients.
 * 2. **Fuite** — un ObjectId Mongo encode sa date de création dans ses quatre
 *    premiers octets, et le `yymmddhhmm` la répétait en clair. Le lien publiait
 *    quand il avait été créé, et exposait la clé primaire de sa ligne.
 * 3. **Aléa** — `Math.random()`, prédictible. Un lien de partage est une
 *    CAPACITÉ : qui devine le token entre dans la conversation.
 *
 * `generateShortToken` est la source unique de tokens courts du service
 * (`TrackingLinkService`, `PostService`) : CSPRNG `crypto.randomInt`, dont
 * l'échantillonnage par rejet garde l'alphabet de 62 uniforme.
 */
export function generateShareLinkId(length: number = SHARE_LINK_ID_LENGTH): string {
  return generatePublicIdentifier(SHARE_LINK_ID_PREFIX, length);
}

/**
 * Un identifiant public de lien, garanti libre sur l'UNION des deux colonnes
 * publiques.
 *
 * **Pourquoi l'union, et pas la seule colonne `linkId`.** La résolution d'un
 * lien accepte les DEUX colonnes — `getShareLinkByIdentifier`
 * (`utils/prisma-queries.ts`) et `TrackingLinkService.resolveTarget` font
 * l'une comme l'autre `findFirst({ OR: [{ linkId }, { identifier }] })`. Une
 * valeur unique dans sa colonne mais présente dans l'autre résoudrait donc le
 * MAUVAIS lien — et `findFirst` choisirait sans le dire. Jusqu'ici les deux
 * formats étaient disjoints par accident (`mshy_<oid>.<ts>_<rnd>` d'un côté,
 * `mshy_link-<ts>-<rnd>` ou un slug lisible de l'autre) ; les rendre tous deux
 * compacts supprime cet accident, la vérification doit donc devenir explicite.
 *
 * L'index unique de `linkId` (schema Prisma, `@unique`) reste le garde-fou
 * final : cette fonction rend la collision improbable, l'index la rend
 * impossible.
 */
/**
 * Un identifiant de lien est pris s'il l'est sur l'UNE des deux colonnes
 * PUBLIQUES.
 *
 * La résolution accepte les deux — `getShareLinkByIdentifier`
 * (`utils/prisma-queries.ts`) et `TrackingLinkService.resolveTarget` font l'une
 * comme l'autre `findFirst({ OR: [{ linkId }, { identifier }] })`. Une valeur
 * unique dans sa colonne mais présente dans l'autre résoudrait donc le MAUVAIS
 * lien — et `findFirst` choisirait sans le dire. Jusqu'ici les deux formats
 * étaient disjoints par ACCIDENT (`mshy_<oid>.<ts>_<rnd>` d'un côté,
 * `mshy_link-<ts>-<rnd>` ou un slug lisible de l'autre) ; les rendre tous deux
 * compacts supprime cet accident, la vérification doit donc devenir explicite.
 */
async function isShareLinkIdentifierTaken(prisma: PrismaClient, candidate: string): Promise<boolean> {
  const existing = await prisma.conversationShareLink.findFirst({
    where: { OR: [{ linkId: candidate }, { identifier: candidate }] },
    select: { id: true }
  });
  return existing !== null;
}

export async function generateUniqueShareLinkId(prisma: PrismaClient): Promise<string> {
  return generateUniquePublicIdentifier({
    prefix: SHARE_LINK_ID_PREFIX,
    label: 'lien de partage',
    isTaken: (candidate) => isShareLinkIdentifierTaken(prisma, candidate)
  });
}

/**
 * Génère un identifiant unique pour une conversation.
 * Délègue à la source unique de vérité pour garantir une translittération
 * cohérente des accents/caractères allemands (é→e, ü→ue, ö→oe, ß→ss) et un
 * timestamp UTC identique aux autres chemins de création de conversation.
 * @see packages/shared/utils/conversation-helpers.ts
 */
export function generateConversationIdentifier(title?: string): string {
  return sharedGenerateConversationIdentifier(title);
}

// `generateInitialLinkId` / `generateFinalLinkId` ont vécu ici jusqu'au
// 2026-08-23. Le couple imposait un ballet en DEUX écritures — créer la ligne
// avec un linkId temporaire, relire son ObjectId, puis la mettre à jour avec le
// linkId définitif qui l'encodait. Ce ballet n'existait que pour dériver le
// linkId de la clé primaire ; un identifiant tiré au hasard n'a besoin de rien
// relire, la création redevient une seule écriture. Voir `generateShareLinkId`.

/**
 * Suffixe de désambiguïsation d'un identifiant LISIBLE déjà pris. Court : il
 * s'ajoute à un slug que l'humain doit encore pouvoir lire.
 */
const IDENTIFIER_SUFFIX_LENGTH = 6;

/** Tentatives de suffixe avant d'abandonner la lisibilité. */
const IDENTIFIER_SUFFIX_ATTEMPTS = 6;

/**
 * Vérifie l'unicité d'un identifiant de ConversationShareLink.
 *
 * L'`identifier` est la colonne LISIBLE (« mshy_meeshy-public ») ; quand
 * l'appelant en propose un, on le garde tel quel s'il est libre. Trois choses
 * ont changé le 2026-08-23 :
 *
 * 1. **Le repli n'horodate plus.** Sans nom ni description à rendre lisible,
 *    l'ancien repli produisait `mshy_link-<Date.now()>-<Math.random()>` — 30
 *    caractères qui publiaient l'instant de création à la milliseconde près, et
 *    tirés d'un PRNG prédictible. Il délègue désormais à `generateShareLinkId`,
 *    le même identifiant compact et opaque que la colonne `linkId`.
 * 2. **La désambiguïsation non plus.** Un slug déjà pris recevait un suffixe
 *    `-YYYYmmddHHMMSS` : même fuite, sur un identifiant que l'utilisateur a
 *    justement choisi de rendre public. Un suffixe aléatoire court le remplace.
 * 3. **La boucle infinie est bornée.** `while (true)` avec un compteur
 *    incrémental supposait que la base finirait par céder. Un suffixe aléatoire
 *    ne suit pas de séquence : on borne les tentatives, et l'échec retombe sur
 *    un identifiant opaque plutôt que de tourner sans fin.
 */
export async function ensureUniqueShareLinkIdentifier(prisma: PrismaClient, baseIdentifier: string): Promise<string> {
  const trimmed = (baseIdentifier ?? '').trim();

  // Rien de lisible à préserver : autant un identifiant compact et opaque.
  if (trimmed === '') {
    return generateUniqueShareLinkId(prisma);
  }

  if (!(await isShareLinkIdentifierTaken(prisma, trimmed))) {
    return trimmed;
  }

  for (let attempt = 0; attempt < IDENTIFIER_SUFFIX_ATTEMPTS; attempt += 1) {
    const candidate = `${trimmed}-${generateShortToken(IDENTIFIER_SUFFIX_LENGTH)}`;
    if (!(await isShareLinkIdentifierTaken(prisma, candidate))) {
      return candidate;
    }
  }

  // Le slug demandé est indisponible et le reste après six suffixes : on cesse
  // de s'acharner sur la lisibilité et on rend un identifiant opaque, qui, lui,
  // a sa propre escalade.
  return generateUniqueShareLinkId(prisma);
}
