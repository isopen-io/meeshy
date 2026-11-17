import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { sendNotFound } from '../../utils/response';
import { selectForFields, type ColumnPlan, type FieldSet } from '../../utils/sparse-fieldset';
import { gateProfilePresence } from './presence-gate';
import { servedProfileDecor, servedProfileDecorJsonSchema } from '../../services/appearance/profileDecor';
import { startupPackIndex } from '../../services/packs/PackIndex';
import { withServedCity } from './profile-city';
import { servedProfileAccentColor } from '@meeshy/shared/utils/profile-accent';
import { withServedAddresses } from './profile-addresses';
import { withOpenCommunities } from './profile-open-communities';
import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';
import { isFieldServed } from '../../utils/sparse-fieldset';
import { targetHasBlockedViewer } from './profile-block-gate';
import { isGuestViewer, sendAccountRequired, type GuestViewerContext } from '../../services/guests/guestMemberVisibility';

/**
 * LA forme publique d'un profil — projection, schéma, composition, lecture.
 *
 * ## Pourquoi un module, et pas quatre exemplaires dans quatre routes
 *
 * Cinq routes lisaient le même profil sous TROIS formes de réponse : trois
 * portes dédiées partageant leur projection, `GET /users/:id` qui la recopiait
 * à la main, et `GET /u/:username` qui en servait une version plus courte. Les
 * trois défauts de #4161 se logeaient dans cet écart — six champs privés
 * sortant par un `additionalProperties: true`, un `autoTranslateEnabled` écrit
 * en dur, et aucun cache conditionnel.
 *
 * Ce module tient ENSEMBLE les cinq décisions qui doivent voyager ensemble :
 * ce qui est CHARGÉ (`publicUserSelect`), ce que chaque clé servie y COÛTE
 * (`publicProfilePlan`, #4356), ce qui est DÉCLARÉ (`publicProfileSchema`), ce
 * qui est COMPOSÉ (`buildPublicProfile`) et comment on le SERT
 * (`servirProfilPublic`). Un champ ajouté à l'un sans l'autre est soit chargé
 * et supprimé, soit déclaré et absent — et depuis que `?fields=` gouverne le
 * `select`, un champ oublié du PLAN est demandé par un client et jamais chargé.
 */

// Shared Prisma select fragment for a user's public voice profile.
// Selected via the `voiceModel` relation; `voicePublicAt` gates exposure.
export const voiceModelSelect = {
  voicePublicAt: true,
  referenceAudioUrl: true,
  totalDurationMs: true,
  qualityScore: true,
} as const;

export type VoiceModelFields = {
  voicePublicAt: Date | null;
  referenceAudioUrl: string | null;
  totalDurationMs: number | null;
  qualityScore: number | null;
};

export type PublicVoiceFields =
  | { voicePublic: false }
  | {
      voicePublic: true;
      voiceSampleUrl: string;
      voiceSampleDurationMs: number | null;
      voiceQuality: number | null;
    };

/**
 * Maps a user's (optional) voice model to public-safe voice fields and strips
 * the raw `voiceModel` relation so internal columns never leak.
 *
 * A voice profile is exposed only when the user opted in (`voicePublicAt`
 * non-null) AND a reference audio URL exists. Block-relationship ACL is a
 * documented follow-up (see CLAUDE task notes) — this gates purely on opt-in.
 */
export function deriveVoiceFields(voiceModel: VoiceModelFields | null | undefined): PublicVoiceFields {
  if (voiceModel && voiceModel.voicePublicAt != null && voiceModel.referenceAudioUrl) {
    return {
      voicePublic: true,
      voiceSampleUrl: voiceModel.referenceAudioUrl,
      voiceSampleDurationMs: voiceModel.totalDurationMs ?? null,
      voiceQuality: voiceModel.qualityScore ?? null,
    };
  }
  return { voicePublic: false };
}

export function withVoiceFields<T extends { voiceModel?: VoiceModelFields | null }>(
  user: T
): Omit<T, 'voiceModel'> & PublicVoiceFields {
  const { voiceModel, ...rest } = user;
  return { ...rest, ...deriveVoiceFields(voiceModel) };
}

// Shared Prisma select & profile builder for dedicated lookup endpoints
/**
 * La forme SERVIE d'un profil public — le miroir déclaré de `publicUserSelect`.
 *
 * Les deux vivent côte à côte pour que l'écart se voie : un champ ajouté à
 * l'un sans l'autre est soit chargé et supprimé (inutile), soit déclaré et
 * absent (menteur).
 */
export const publicProfileSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    username: { type: 'string' },
    firstName: { type: 'string', nullable: true },
    lastName: { type: 'string', nullable: true },
    displayName: { type: 'string', nullable: true },
    avatar: { type: 'string', nullable: true },
    banner: { type: 'string', nullable: true },
    bio: { type: 'string', nullable: true },
    role: { type: 'string' },
    isOnline: { type: ['boolean', 'null'] },
    lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    voicePublic: { type: 'boolean' },
    voiceSampleUrl: { type: 'string', nullable: true },
    voiceSampleDurationMs: { type: 'number', nullable: true },
    voiceQuality: { type: 'number', nullable: true },
    isAnonymous: { type: 'boolean' },
    isMeeshyer: { type: 'boolean' },
    // #18861 : pays d'inscription et fuseau, SERVIS avec la présence du lecteur
    // (`withPresenceGatedFields`) — absents, jamais `null`, quand elle les ferme.
    registrationCountry: { type: 'string', nullable: true },
    timezone: { type: 'string', nullable: true },
    // #18862 : la ville DÉCLARÉE, servie selon le cercle choisi par son propriétaire
    // (`withServedCity`) ; `cityCircle` (le réglage) ne part qu'à lui-même.
    city: { type: 'string' },
    cityCircle: { type: 'string', nullable: true },
    // #19201 : la couleur d'accent de la vitrine (cercle Public) ; `null` = accent calculé.
    profileAccentColor: { type: 'string', nullable: true },
    // #18863 : les adresses personnelles servies au cercle choisi par chacune (`withServedAddresses`) ;
    // absent quand rien n'est servi. `circle` ne part qu'à leur propriétaire.
    addresses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          url: { type: 'string' },
          glyph: { type: 'string' },
          trackedPath: { type: 'string' },
          circle: { type: 'string' },
        },
      },
    },
    // #19274 : ce qui reste FERMÉ au lecteur, un compte par cercle qui l'ouvrirait — ni titre,
    // ni URL, ni glyphe, ni jeton ; absent quand rien n'est fermé, vers soi ou hors d'atteinte.
    lockedAddresses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          circle: { type: 'string' },
          count: { type: 'number' },
        },
      },
    },
    // #19274 : ses communautés PUBLIQUES, qu'il ne cache pas de sa liste ; absent quand aucune.
    openCommunities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          identifier: { type: 'string' },
          name: { type: 'string' },
          avatar: { type: 'string', nullable: true },
          memberCount: { type: 'number' },
          isMember: { type: 'boolean' },
        },
      },
    },
    // #10632 / #10932 : le contour d'avatar, la bannière de design et le cadre de bannière ÉQUIPÉS (additif).
    profileDecor: servedProfileDecorJsonSchema,
    // #19373 : les langues DÉCLARÉES, dans l'ordre du Prisme, dédoublonnées (cercle Public) ;
    // absent quand aucune n'est déclarée. Jamais la locale de l'appareil, jamais les rangs bruts.
    languages: { type: 'array', items: { type: 'string' } },
  },
} as const;

/**
 * Ce qu'un profil PUBLIC charge — et rien de plus (#4161).
 *
 * Il chargeait auparavant les TROIS langues du Prisme, `isActive`,
 * `deactivatedAt` et `updatedAt`, que les schémas laissaient sortir par un
 * `additionalProperties: true`. Mesuré en intégration : vingt-trois champs
 * servis à un appelant ANONYME, dont les préférences linguistiques d'un
 * inconnu et l'état de son compte.
 *
 * Le repli est à la SOURCE, pas au schéma : le dépôt l'écrit déjà — « compter
 * sur fast-json-stringify pour retenir une donnée personnelle est un piège
 * armé, pas une garde ». Ce qui ne sort pas de la base ne peut pas fuir par une
 * omission de déclaration, et la première personne qui ajoute le champ au
 * schéma ne publie alors rien.
 *
 * `isOnline` / `lastActiveAt` restent chargés : ils sont la MATIÈRE du gate de
 * présence (`gateProfilePresence`), qui décide ensuite s'ils sortent.
 */
export const publicUserSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  displayName: true,
  avatar: true,
  banner: true,
  bio: true,
  role: true,
  isOnline: true,
  lastActiveAt: true,
  // CHARGÉ, jamais SERVI — et c'est la distinction qui compte ici. Le retirer
  // du `select` en même temps que les cinq autres champs privés a paru juste
  // (il ne doit pas partir) et affaiblissait la garde : `gateProfilePresence`
  // le lit pour masquer la présence d'un compte DÉSACTIVÉ, et un `?? null`
  // rendait ce cas invisible. Un champ retiré d'une projection emporte tous
  // ses consommateurs, pas seulement celui qui le publiait.
  // Il ne sort pas : `publicProfileSchema` ne le déclare pas.
  deactivatedAt: true,
  createdAt: true,
  // #18861 : chargés, SERVIS avec la présence — `gateProfilePresence` les retire
  // (`withPresenceGatedFields`) quand la présence servie à ce lecteur les ferme :
  // cercle, préférences de la cible et désactivation compris.
  registrationCountry: true,
  timezone: true,
  // #18862 : chargés, jamais servis tels quels — `withServedCity` décide de la ville
  // selon le cercle choisi, et le réglage ne part qu'à son propriétaire.
  city: true,
  cityCircle: true,
  // #19201 : servie normalisée par `buildPublicProfile` (hors liste ⇒ `null`).
  profileAccentColor: true,
  // #10632 : chargés, jamais servis tels quels — `buildPublicProfile` les
  // compose en `profileDecor` et RETIRE les colonnes brutes.
  equippedAvatarRing: true,
  equippedBanner: true,
  equippedBannerFrame: true,
  // #19373 : chargés, jamais servis tels quels — `buildPublicProfile` les compose en
  // `languages` (la liste ordonnée, sans dire quelle langue occupe quel rang) et RETIRE les
  // colonnes brutes que #4161 a sorties de la surface. `deviceLocale` n'est jamais chargée.
  systemLanguage: true,
  regionalLanguage: true,
  customDestinationLanguage: true,
  voiceModel: { select: voiceModelSelect }
} as const;

/**
 * Ce que chaque clé SERVIE coûte en colonnes — la CINQUIÈME décision du module,
 * et elle voyage avec les quatre autres (#4356).
 *
 * `publicUserSelect` était un `select` FIXE : `?fields=username` servait un
 * champ et en chargeait quatorze, jointure `voiceModel` comprise. Ce plan
 * traduit la liste demandée en `select`, sans jamais rien y ajouter que le
 * littéral ne déclare (voir `selectForFields`).
 *
 * **Quatre colonnes sont ÉPINGLÉES, et pour deux raisons distinctes.**
 * `id` identifie la ligne — sans lui la réponse ne dit plus de qui elle parle,
 * et `directory/person.ts` en fait la cible de ses expansions. Les trois autres
 * sont la MATIÈRE du gate de présence (`gateProfilePresence` lit `isOnline`,
 * `lastActiveAt` et `deactivatedAt`) : une garde de confidentialité ne peut pas
 * dépendre d'un paramètre que l'appelant choisit, sinon l'omettre la lèverait.
 * Un `?fields=` qui les retirerait ferait masquer la loi par IGNORANCE — même
 * verdict apparent, jusqu'au jour où elle doit dire « oui ».
 *
 * Les quatre champs de VOIX viennent tous de la même relation : les nommer
 * ensemble ne l'ouvre qu'une fois, n'en nommer aucun ne l'ouvre pas.
 * `isAnonymous` / `isMeeshyer` sont FABRIQUÉS par {@link buildPublicProfile} —
 * tableau vide, ils ne coûtent aucune colonne.
 */
export const publicProfilePlan: ColumnPlan<typeof publicUserSelect> = {
  full: publicUserSelect,
  pinned: ['id', 'isOnline', 'lastActiveAt', 'deactivatedAt'],
  columns: {
    voicePublic: ['voiceModel'],
    voiceSampleUrl: ['voiceModel'],
    voiceSampleDurationMs: ['voiceModel'],
    voiceQuality: ['voiceModel'],
    isAnonymous: [],
    isMeeshyer: [],
    registrationCountry: ['registrationCountry'],
    timezone: ['timezone'],
    city: ['city', 'cityCircle'],
    cityCircle: ['cityCircle'],
    profileAccentColor: ['profileAccentColor'],
    addresses: [],
    lockedAddresses: [],
    openCommunities: [],
    profileDecor: ['equippedAvatarRing', 'equippedBanner', 'equippedBannerFrame'],
    languages: ['systemLanguage', 'regionalLanguage', 'customDestinationLanguage'],
  },
};

/** Les trois rangs DÉCLARÉS du Prisme, matière de `languages` (#19373), jamais servis bruts. */
type DeclaredLanguageColumns = {
  systemLanguage?: string | null;
  regionalLanguage?: string | null;
  customDestinationLanguage?: string | null;
};

/**
 * La composition PUBLIQUE d'un profil — voix dérivée, drapeaux d'identité.
 *
 * GÉNÉRIQUE, comme `withVoiceFields`, et pour la même raison : un paramètre
 * `Record<string, unknown>` EFFACE la forme de ce qu'on lui passe. Les
 * appelants recomposent ensuite le résultat avec des gardes qui, elles,
 * exigent des champs nommés (`gateProfilePresence` veut `id`, `isOnline`,
 * `lastActiveAt`) — et l'effacement les leur retire au moment précis où elles
 * en ont besoin. Un cast au site d'appel ferait taire l'erreur en rendant la
 * garde inopérante au typage.
 */
export function buildPublicProfile<
  T extends { voiceModel?: VoiceModelFields | null; equippedAvatarRing?: string | null; equippedBanner?: string | null; equippedBannerFrame?: string | null; profileAccentColor?: string | null } & DeclaredLanguageColumns,
>(user: T) {
  // `autoTranslateEnabled: true` était écrit EN DUR — un champ de contrat qui
  // ne disait rien de vrai, et qu'un client pouvait croire refléter la
  // préférence de la personne. `email: ''` et `phoneNumber: undefined`
  // prétendaient masquer ce qu'il suffit de ne pas charger. Les trois sont
  // retirés (#4161).
  const { equippedAvatarRing, equippedBanner, equippedBannerFrame, systemLanguage, regionalLanguage, customDestinationLanguage, ...visible } = user;
  const languages = resolveUserLanguagesOrdered({ systemLanguage, regionalLanguage, customDestinationLanguage });
  return {
    ...withVoiceFields(visible),
    ...(languages.length > 0 ? { languages } : {}),
    ...('profileAccentColor' in visible ? { profileAccentColor: servedProfileAccentColor(visible.profileAccentColor) } : {}),
    isAnonymous: false,
    isMeeshyer: true,
    profileDecor: servedProfileDecor(startupPackIndex(), { equippedAvatarRing, equippedBanner, equippedBannerFrame }),
  };
}

/**
 * Lire UN profil public, à partir d'un `handle` — identifiant ou pseudo.
 *
 * ## Pourquoi une fonction, et non quatre handlers
 *
 * `GET /directory/people/:handle` est l'adresse canonique ; `GET /users/:id`,
 * `GET /users/id/:id` et `GET /u/:username` en sont des ALIAS qui restent
 * servis tant que des versions iOS installées les appellent — un profil
 * s'ouvre depuis un lien partagé, et la queue est longue (#4161, critère 9).
 *
 * Un alias qui REDIRIGE en HTTP casserait ces clients (aucun ne suit une 302
 * sur une lecture JSON) ; un alias qui recopie le handler rouvre l'écart qu'on
 * vient de fermer. Un appel de fonction est la seule forme qui donne quatre
 * adresses à UNE implémentation.
 *
 * La détection identifiant/pseudo est celle de `/users/:id` — `isValidObjectId`
 * — donc aucune sémantique nouvelle.
 *
 * Rend `null` quand la personne n'existe pas ET a déjà répondu 404 : l'appelant
 * n'a plus qu'à propager.
 *
 * ## `fields` réduit la REQUÊTE, pas seulement la réponse (#4356)
 *
 * `fields` est la liste de `?fields=` déjà analysée (`parseFieldList`), et elle
 * traverse jusqu'au `select` : un appelant qui demande un pseudo ne paie plus
 * quatorze colonnes ni la jointure `voiceModel`. `undefined` — le cas des trois
 * ALIAS, qui n'exposent pas ce paramètre — vaut `null` : le `select` complet,
 * rendu par IDENTITÉ, donc un chemin nominal strictement inchangé.
 *
 * Les colonnes que le plan n'épingle pas peuvent être absentes de la ligne ; ce
 * n'est jamais un problème ici, parce que la MÊME liste filtre ensuite la
 * réponse chez l'appelant. La composition les traite déjà comme absentes
 * possibles (`?? null`, déstructuration).
 */
export async function servirProfilPublic(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  handle: string,
  fields: FieldSet = null
): Promise<Record<string, unknown> | null> {
  // #10205 — un lecteur sans compte Meeshy ne lit AUCUN profil, avant toute lecture.
  if (isGuestViewer((request as FastifyRequest & { authContext?: GuestViewerContext }).authContext)) {
    sendAccountRequired(reply, 'A Meeshy account is required to see a user profile');
    return null;
  }
  const user = await fastify.prisma.user.findFirst({
    where: isValidObjectId(handle)
      ? { id: handle }
      : { username: { equals: handle, mode: 'insensitive' } },
    select: selectForFields(publicProfilePlan, fields),
  });

  if (!user) {
    sendNotFound(reply, 'User not found');
    return null;
  }

  /* LE BLOCAGE FERME LA PORTE AVANT TOUTE COMPOSITION (#7184). Posée ICI, la
     garde couvre les TROIS routes qui partagent ce service et ne dépend
     d'aucun `expand` — la ranger dans `relationAvec` l'aurait rendue levable
     par l'appelant. Le refus est celui d'un profil INTROUVABLE, le même que
     `getUserByEmail`/`getUserByPhone` rendent déjà pour un bloquant : la
     cohérence entre les portes EST la correction. */
  if (await targetHasBlockedViewer(fastify.prisma, request, String(user.id))) {
    sendNotFound(reply, 'User not found');
    return null;
  }

  return (await composePublicProfile(fastify, request, user, fields)) as unknown as Record<string, unknown>;
}

/**
 * La ligne chargée par `publicUserSelect` devient la fiche SERVIE à ce lecteur — le site UNIQUE
 * des portes de profil (fiche, `/users/email/:email`, `/users/phone/:phone`).
 *
 * Garder D'ABORD, composer ensuite : la garde de présence lit `isOnline`, `lastActiveAt` et
 * `deactivatedAt` sur la ligne chargée, puis la ville suit le cercle choisi par son propriétaire
 * (#18862). Une porte qui composerait sans ce site servirait `city` et `cityCircle` bruts : le
 * `select` les charge et `publicProfileSchema` les déclare.
 */
export async function composePublicProfile<
  T extends Parameters<typeof gateProfilePresence>[2] & { id: string; city?: string | null; cityCircle?: string | null; voiceModel?: VoiceModelFields | null },
>(fastify: FastifyInstance, request: FastifyRequest, user: T, fields: FieldSet = null) {
  const gated = await gateProfilePresence(fastify, request, user);
  const withCity = await withServedCity(fastify, request, gated);
  const addressParts = { addresses: isFieldServed(fields, 'addresses'), lockedAddresses: isFieldServed(fields, 'lockedAddresses') };
  const withAddresses = await withServedAddresses(fastify, request, withCity, addressParts);
  const composed = isFieldServed(fields, 'openCommunities') ? await withOpenCommunities(fastify, request, withAddresses) : withAddresses;
  return buildPublicProfile(composed);
}
