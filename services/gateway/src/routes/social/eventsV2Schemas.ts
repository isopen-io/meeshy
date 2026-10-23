import { z } from 'zod';
import { OBJECT_ID_REGEX } from '@meeshy/shared/utils/object-id';
import { CONTENT_SURFACES } from '@meeshy/shared/types/content-surfaces';
import {
  CAPTURE_KINDS,
  CLIENT_CAPABILITIES,
  CLIENT_PLATFORMS,
  CONSENT_STATES,
  DEVICE_CLASSES,
  DEVICE_TIERS,
  DISCOVERY_ACTIONS,
  INTERACTION_ACTIONS,
  LINK_ACTIONS,
  NEGATIVE_ACTIONS,
  NETWORK_SUBTYPES,
  NETWORK_TYPES,
  NOTIFICATION_ACTIONS,
  NOTIFICATION_CHANNELS,
  PLAYBACK_ACTIONS,
  PLAYBACK_EXIT_REASONS,
  RANKING_SOURCES,
  SCREEN_CAPTURE_ACTIONS,
  SCROLL_ACTIONS,
  SCROLL_CONTENT_KINDS,
  SEARCH_RESULT_KINDS,
  SHARE_DESTINATIONS,
  SOCIAL_EVENTS_SCHEMA_VERSION,
  SOCIAL_EVENT_V2_TYPES,
  STORY_ACTIONS,
  TARGET_KINDS,
  TRANSLATION_SOURCES,
  VISIBILITY_ACTIONS,
  VISIBLE_TARGETS_MAX,
  type SocialEventV2Type,
  type TargetKind,
} from '@meeshy/shared/types/social-events-v2';

/**
 * Les schémas v2 de `POST /social/events` (#10499) — enveloppe de lot, champs
 * d'enveloppe par événement, et UN schéma par famille du catalogue typé.
 *
 * Trois règles de forme, qui portent la compatibilité :
 *  - chaque schéma est FERMÉ sur ses champs (un champ inconnu est ôté, jamais
 *    rangé) et OUVERT sur ses énumérations (une valeur inconnue devient
 *    `other`, ou le champ est ôté) — un client plus neuf que le serveur ne
 *    perd jamais un événement pour une valeur que le serveur ignore ;
 *  - AUCUNE chaîne libre : énumération, identifiant, code ≤ 64 ou langue —
 *    rien qui puisse porter un texte saisi, une adresse complète ou un nom ;
 *  - une ACTION inconnue ou une CIBLE invalide rend l'événement invalide, et
 *    l'appelant le compte en `ignored` — jamais le lot.
 */

const objectId = z.string().regex(OBJECT_ID_REGEX);
const guid = z.guid();
const isoDate = z.iso.datetime({ offset: true });
/** Un code technique (raison, erreur, type de notification) — jamais un texte. */
const code = z.string().min(1).max(64).regex(/^[A-Za-z0-9_.:-]+$/);
const language = z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/);
const shortVersion = z.string().max(20).regex(/^[A-Za-z0-9._-]+$/);
const fraction = z.number().min(0).max(1);
/** Une durée en millisecondes : au plus un jour. */
const ms = z.number().int().min(0).max(86_400_000);
const count = z.number().int().min(0).max(1_000_000);

const optionalOf = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);
const enumOrDrop = <const V extends readonly [string, ...string[]]>(values: V) =>
  z.enum(values).optional().catch(undefined);
const enumOrOther = <const V extends readonly [string, ...string[]]>(values: V) =>
  z.enum(values).optional().catch('other' as V[number]);

/** Nom de hashtag normalisé : sans `#`, en minuscules, lettres/chiffres/`_`, ≤ 100. */
export const normalizeHashtag = (raw: string): string => raw.replace(/^#+/, '').normalize('NFC').toLowerCase();
const HASHTAG = /^[\p{L}\p{N}_]{1,100}$/u;
/** Un domaine (eTLD+1 déclaré par le client) — jamais une adresse : ni schéma, ni chemin, ni port. */
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const domain = z.string().toLowerCase().regex(DOMAIN);

const KIND_SET: ReadonlySet<string> = new Set(TARGET_KINDS);

/**
 * L'identifiant d'une cible selon son genre : un ObjectId, sauf `hashtag`
 * (nom normalisé) et `link` (id du lien de suivi, sinon domaine). Rend
 * `undefined` pour un identifiant qui ne convient pas à son genre.
 */
export function normalizeTargetId(kind: TargetKind, id: string): string | undefined {
  if (kind === 'hashtag') {
    const name = normalizeHashtag(id);
    return HASHTAG.test(name) ? name : undefined;
  }
  if (kind === 'link') {
    if (OBJECT_ID_REGEX.test(id)) return id;
    const lowered = id.toLowerCase();
    return DOMAIN.test(lowered) ? lowered : undefined;
  }
  return OBJECT_ID_REGEX.test(id) ? id : undefined;
}

const targetRef = z
  .object({ kind: z.string().max(20), id: z.string().min(1).max(253) })
  .transform((ref, ctx) => {
    if (!KIND_SET.has(ref.kind)) {
      ctx.addIssue({ code: 'custom', message: 'unknown target kind' });
      return z.NEVER;
    }
    const kind = ref.kind as TargetKind;
    const id = normalizeTargetId(kind, ref.id);
    if (id === undefined) {
      ctx.addIssue({ code: 'custom', message: 'invalid target id' });
      return z.NEVER;
    }
    return { kind, id };
  });

export const TargetSchema = z
  .object({ kind: z.string().max(20), id: z.string().min(1).max(253), parent: targetRef.optional() })
  .transform((target, ctx) => {
    const parsed = targetRef.safeParse({ kind: target.kind, id: target.id });
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', message: 'invalid target' });
      return z.NEVER;
    }
    return { ...parsed.data, parent: target.parent };
  });

export const ListingSchema = z.object({
  feedRequestId: optionalOf(z.string().min(1).max(64).regex(/^[A-Za-z0-9_.-]+$/)),
  position: optionalOf(z.number().int().min(0).max(100_000)),
  rankingSource: enumOrOther(RANKING_SOURCES),
  listingSessionId: optionalOf(guid),
});

export const VisibilitySchema = z.object({
  maxVisibleFraction: optionalOf(fraction),
  visibleMs: optionalOf(ms),
  viewable: optionalOf(z.boolean()),
});

export const PrismSchema = z.object({
  displayedLanguage: language,
  originalLanguage: optionalOf(language),
  translated: z.boolean(),
  translationSource: enumOrDrop(TRANSLATION_SOURCES),
});

/**
 * Les champs d'enveloppe d'un événement — tous facultatifs, et un champ
 * MALFORMÉ est ôté (`catch`), jamais un refus : ils ne doivent jamais faire
 * perdre l'impression, la vue ou l'ouverture qu'ils accompagnent.
 */
export const EventEnvelopeFields = {
  eventId: optionalOf(guid),
  occurredAt: optionalOf(isoDate),
  target: optionalOf(TargetSchema),
  listing: optionalOf(ListingSchema),
  prism: optionalOf(PrismSchema),
};

/** Le contexte du LOT, envoyé une fois par requête. */
export const SocialEventsContextSchema = z.object({
  schemaVersion: optionalOf(z.literal(SOCIAL_EVENTS_SCHEMA_VERSION)),
  sentAt: optionalOf(isoDate),
  appSessionId: optionalOf(guid),
  platform: enumOrDrop(CLIENT_PLATFORMS),
  appVersion: optionalOf(shortVersion),
  build: optionalOf(shortVersion),
  os: optionalOf(z.object({
    name: z.string().max(20).regex(/^[A-Za-z0-9 _-]+$/),
    version: optionalOf(z.string().regex(/^\d{1,3}(?:\.\d{1,3})?$/)),
  })),
  deviceClass: enumOrDrop(DEVICE_CLASSES),
  network: optionalOf(z.object({ type: z.enum(NETWORK_TYPES).catch('unknown'), subtype: enumOrDrop(NETWORK_SUBTYPES) })),
  uiLanguage: optionalOf(language),
  deviceLocale: optionalOf(language),
  consent: enumOrDrop(CONSENT_STATES),
  capabilities: optionalOf(z.array(z.string().max(32)).max(10).transform((values) =>
    values.filter((value): value is (typeof CLIENT_CAPABILITIES)[number] =>
      (CLIENT_CAPABILITIES as readonly string[]).includes(value)))),
  sampling: optionalOf(z.record(z.string().max(32), fraction).transform((rates) =>
    Object.fromEntries(Object.entries(rates).filter(([type, rate]) =>
      (SOCIAL_EVENT_V2_TYPES as readonly string[]).includes(type) && rate > 0)))),
});

export type ParsedSocialEventsContext = z.infer<typeof SocialEventsContextSchema>;

const surface = enumOrDrop(CONTENT_SURFACES);

const base = <T extends SocialEventV2Type, A extends readonly [string, ...string[]]>(type: T, actions: A) =>
  z.object({
    ...EventEnvelopeFields,
    type: z.literal(type),
    action: z.enum(actions),
    surface,
  });

const InteractionSchema = base('interaction', INTERACTION_ACTIONS).extend({
  destination: enumOrOther(SHARE_DESTINATIONS),
  dwellBeforeMs: optionalOf(ms),
  mutationId: optionalOf(z.union([objectId, guid])),
});

const NegativeSchema = base('negative', NEGATIVE_ACTIONS).extend({
  reasonCode: optionalOf(code),
  visibleMs: optionalOf(ms),
});

const PlaybackSchema = base('playback', PLAYBACK_ACTIONS).extend({
  playbackId: guid,
  mediaId: optionalOf(objectId),
  mediaDurationMs: optionalOf(ms),
  startupMs: optionalOf(ms),
  exitBeforeStart: optionalOf(z.boolean()),
  playedMs: optionalOf(ms),
  rebufferCount: optionalOf(count),
  rebufferMs: optionalOf(ms),
  errorCode: optionalOf(code),
  errorDomain: optionalOf(code),
  avgBitrateKbps: optionalOf(count),
  renditionChanges: optionalOf(count),
  loops: optionalOf(count),
  pauses: optionalOf(count),
  seeks: optionalOf(count),
  mutedAtStart: optionalOf(z.boolean()),
  muteToggles: optionalOf(count),
  captionsOn: optionalOf(z.boolean()),
  quartiles: optionalOf(z.number().int().min(0).max(15)),
  exitReason: enumOrOther(PLAYBACK_EXIT_REASONS),
  deviceTier: enumOrDrop(DEVICE_TIERS),
  // W11 (#11317) — Web Vitals de la page et longues images de la séance, bornés : une valeur hors bornes est ôtée seule.
  lcpMs: optionalOf(ms),
  cls: optionalOf(z.number().min(0).max(10)),
  inpMs: optionalOf(ms),
  longFrames: optionalOf(count),
  longFramesBlockingMs: optionalOf(ms),
  longFrameWorstMs: optionalOf(ms),
});

const LinkSchema = base('link', LINK_ACTIONS).extend({
  domain: optionalOf(domain),
  trackingLinkId: optionalOf(objectId),
});

const DiscoverySchema = base('discovery', DISCOVERY_ACTIONS).extend({
  searchId: optionalOf(z.string().min(1).max(160).regex(/^[A-Za-z0-9_.-]+$/)),
  queryLength: optionalOf(z.number().int().min(0).max(500)),
  queryLanguage: optionalOf(language),
  resultCount: optionalOf(count),
  resultKind: enumOrOther(SEARCH_RESULT_KINDS),
});

const StorySchema = base('story', STORY_ACTIONS).extend({
  slideIndex: optionalOf(z.number().int().min(0).max(1000)),
  slideCount: optionalOf(z.number().int().min(0).max(1000)),
  elapsedMs: optionalOf(ms),
});

const NotificationSchema = base('notification', NOTIFICATION_ACTIONS).extend({
  notificationType: optionalOf(code),
  channel: enumOrDrop(NOTIFICATION_CHANNELS),
  deliveryLatencyMs: optionalOf(ms),
});

const VisibleTargetSchema = z.object({
  kind: z.string().max(20),
  id: z.string().min(1).max(253),
  visibleFraction: optionalOf(fraction),
}).transform((value, ctx) => {
  const ref = targetRef.safeParse({ kind: value.kind, id: value.id });
  if (!ref.success) {
    ctx.addIssue({ code: 'custom', message: 'invalid visible target' });
    return z.NEVER;
  }
  return value.visibleFraction === undefined ? ref.data : { ...ref.data, visibleFraction: value.visibleFraction };
});

const ScreenCaptureSchema = base('screen_capture', SCREEN_CAPTURE_ACTIONS).extend({
  visibleTargets: z.array(z.unknown()).max(VISIBLE_TARGETS_MAX * 2).optional().transform((values) =>
    (values ?? []).flatMap((value) => {
      const parsed = VisibleTargetSchema.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    }).slice(0, VISIBLE_TARGETS_MAX)),
  recordingMs: optionalOf(ms),
  captureKind: enumOrDrop(CAPTURE_KINDS),
});

const ScrollSchema = base('scroll', SCROLL_ACTIONS).extend({
  listingSessionId: optionalOf(guid),
  segment: optionalOf(z.number().int().min(0).max(10_000)),
  durationMs: optionalOf(ms),
  activeScrollMs: optionalOf(ms),
  itemsRendered: optionalOf(count),
  itemsViewable: optionalOf(count),
  maxPosition: optionalOf(count),
  distancePt: optionalOf(z.number().int().min(0).max(100_000_000)),
  velocityHistogram: optionalOf(z.tuple([ms, ms, ms, ms])),
  directionChanges: optionalOf(count),
  upDistanceRatio: optionalOf(fraction),
  flings: optionalOf(count),
  stops: optionalOf(count),
  refreshes: optionalOf(count),
  paginations: optionalOf(count),
  reachedEnd: optionalOf(z.boolean()),
  contentKind: enumOrDrop(SCROLL_CONTENT_KINDS),
  itemsTotal: optionalOf(count),
  maxIndexReached: optionalOf(count),
  swipes: optionalOf(count),
  maxScrollFraction: optionalOf(fraction),
  readThroughFraction: optionalOf(fraction),
});

const VisibilityEventSchema = base('visibility', VISIBILITY_ACTIONS).extend({
  impressionEventId: optionalOf(guid),
  maxVisibleFraction: optionalOf(fraction),
  visibleMs: optionalOf(ms),
  viewable: optionalOf(z.boolean()),
});

/** Les familles dont la cible est OBLIGATOIRE (les autres peuvent viser un écran entier). */
const TARGET_OPTIONAL: Readonly<Record<SocialEventV2Type, ReadonlySet<string>>> = {
  interaction: new Set(),
  negative: new Set(),
  playback: new Set(),
  link: new Set(),
  discovery: new Set(['search_submitted', 'search_abandoned']),
  story: new Set(),
  notification: new Set(),
  screen_capture: new Set(SCREEN_CAPTURE_ACTIONS),
  scroll: new Set(['listing']),
  visibility: new Set(),
};

export const SOCIAL_EVENT_V2_SCHEMAS = {
  interaction: InteractionSchema,
  negative: NegativeSchema,
  playback: PlaybackSchema,
  link: LinkSchema,
  discovery: DiscoverySchema,
  story: StorySchema,
  notification: NotificationSchema,
  screen_capture: ScreenCaptureSchema,
  scroll: ScrollSchema,
  visibility: VisibilityEventSchema,
} as const;

export type SocialEventV2Parsed = z.infer<(typeof SOCIAL_EVENT_V2_SCHEMAS)[SocialEventV2Type]>;

/**
 * Lit UN événement v2. `undefined` ⇔ l'événement est ignoré (action inconnue,
 * cible absente ou invalide, champ obligatoire manquant) — jamais le lot.
 */
export function parseSocialEventV2(type: SocialEventV2Type, raw: unknown): SocialEventV2Parsed | undefined {
  const parsed = SOCIAL_EVENT_V2_SCHEMAS[type].safeParse(raw);
  if (!parsed.success) return undefined;
  const event = parsed.data as SocialEventV2Parsed;
  if (event.target === undefined && !TARGET_OPTIONAL[type].has(event.action)) return undefined;
  if (type === 'notification' && event.target?.kind !== 'notification') return undefined;
  return event;
}
