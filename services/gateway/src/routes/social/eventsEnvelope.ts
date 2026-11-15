import { z } from 'zod';
import {
  COUNTING_EVENT_TYPES,
  SOCIAL_EVENT_MAX_AGE_MS,
  SOCIAL_EVENT_MAX_BYTES,
  SOCIAL_EVENT_MAX_FUTURE_MS,
  isSocialEventV2Type,
} from '@meeshy/shared/types/social-events-v2';
import { SOCIAL_EVENTS_BATCH_CAP, SocialEventSchema, type SocialEvent } from './eventsSchemas';
import {
  SocialEventsContextSchema,
  parseSocialEventV2,
  type ParsedSocialEventsContext,
  type SocialEventV2Parsed,
} from './eventsV2Schemas';

/**
 * La LECTURE d'un lot `POST /social/events` v2 (#10500) — événement par
 * événement, jamais tout-ou-rien.
 *
 * Avant la v2, le corps était une union discriminée Zod : UN type inconnu ou
 * UN champ malformé refusait le lot ENTIER en 400, et avec lui toutes les
 * impressions et vues qu'il portait. Un client plus neuf que le serveur
 * perdait ainsi ses comptages. Désormais :
 *  - la FORME du lot reste gardée (`events` tableau ≤ 200, sinon 400) ;
 *  - chaque événement est lu À PART : un type inconnu, un événement invalide,
 *    un événement v2 de plus de 2 Kio ou de plus de 72 h comptent en
 *    `ignored` — `recorded` et `rejected` gardent leur sens ;
 *  - l'heure de chaque événement est CORRIGÉE de l'horloge de l'appareil
 *    (méthode Snowplow) : `derivedAt = receivedAt − (sentAt − occurredAt)`.
 */

export type EventClock = { readonly derivedAt: Date; readonly clockSkewed: boolean };

export type CountingEventRead = { readonly event: SocialEvent; readonly clock: EventClock };
export type V2EventRead = { readonly event: SocialEventV2Parsed; readonly clock: EventClock };

export type SocialEventsBodyRead =
  | { readonly ok: false }
  | {
    readonly ok: true;
    readonly context: ParsedSocialEventsContext;
    readonly counting: readonly CountingEventRead[];
    readonly v2: readonly V2EventRead[];
    readonly ignored: number;
  };

const BodySchema = z.object({
  events: z.array(z.unknown()).max(SOCIAL_EVENTS_BATCH_CAP).default([]),
  context: z.unknown().optional(),
});

const COUNTING: ReadonlySet<string> = new Set(COUNTING_EVENT_TYPES);

const parseDate = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
};

/**
 * L'heure CORRIGÉE d'un événement, ou `'too-old'` s'il a plus de 72 h — sauf
 * pour le COMPTAGE (`ageless`), qui n'a pas d'âge limite.
 *
 *  - sans `occurredAt` : l'heure de réception, sans correction ;
 *  - avec `sentAt` : l'âge vu par l'appareil (`sentAt − occurredAt`) est
 *    retranché de la réception — un appareil décalé de deux heures se corrige
 *    de lui-même, puisque les deux horloges partagent son décalage ;
 *  - sans `sentAt` : l'âge est mesuré contre la réception.
 * Un âge négatif de plus de 5 min (un événement « du futur ») est ramené à la
 * réception et marqué `clockSkewed`.
 */
export function deriveEventClock(params: {
  readonly occurredAt?: string;
  readonly sentAt?: string;
  readonly receivedAt: Date;
  /** Le COMPTAGE n'a pas d'âge limite (#10553) : tant que l'information arrive, elle compte. */
  readonly ageless?: boolean;
}): EventClock | 'too-old' {
  const received = params.receivedAt.getTime();
  const occurred = parseDate(params.occurredAt);
  if (occurred === undefined) return { derivedAt: params.receivedAt, clockSkewed: false };

  const sent = parseDate(params.sentAt) ?? received;
  const age = sent - occurred;
  if (age > SOCIAL_EVENT_MAX_AGE_MS && params.ageless !== true) return 'too-old';
  if (age < -SOCIAL_EVENT_MAX_FUTURE_MS) return { derivedAt: params.receivedAt, clockSkewed: true };
  return { derivedAt: new Date(received - Math.max(age, 0)), clockSkewed: false };
}

const typeOf = (raw: unknown): string | undefined =>
  typeof raw === 'object' && raw !== null && typeof (raw as { type?: unknown }).type === 'string'
    ? (raw as { type: string }).type
    : undefined;

const byteLength = (raw: unknown): number => Buffer.byteLength(JSON.stringify(raw) ?? '', 'utf8');

/**
 * Lit le corps. `ok: false` ⇔ la FORME du lot est fausse (pas d'objet, pas de
 * tableau, plus de 200 événements) : c'est le seul refus en bloc qui reste.
 */
export function readSocialEventsBody(body: unknown, receivedAt: Date): SocialEventsBodyRead {
  const shape = BodySchema.safeParse(body ?? {});
  if (!shape.success) return { ok: false };

  // Le contexte est FACULTATIF : un contexte qui n'est pas un objet est ôté, il ne refuse pas le lot.
  const context: ParsedSocialEventsContext = SocialEventsContextSchema.catch({}).parse(shape.data.context ?? {});

  const counting: CountingEventRead[] = [];
  const v2: V2EventRead[] = [];
  let ignored = 0;

  for (const raw of shape.data.events) {
    const type = typeOf(raw);
    const read = type !== undefined && COUNTING.has(type)
      ? readCounting(raw, context, receivedAt)
      : type !== undefined && isSocialEventV2Type(type)
        ? readV2(type, raw, context, receivedAt)
        : undefined;
    if (read === undefined) {
      ignored += 1;
    } else if ('kind' in read && read.kind === 'counting') {
      counting.push(read.value);
    } else if ('kind' in read) {
      v2.push(read.value);
    }
  }

  return { ok: true, context, counting, v2, ignored };
}

function readCounting(raw: unknown, context: ParsedSocialEventsContext, receivedAt: Date) {
  const parsed = SocialEventSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const clock = deriveEventClock({ occurredAt: parsed.data.occurredAt, sentAt: context.sentAt, receivedAt, ageless: true });
  if (clock === 'too-old') return undefined;
  return { kind: 'counting' as const, value: { event: parsed.data, clock } };
}

function readV2(
  type: Parameters<typeof parseSocialEventV2>[0],
  raw: unknown,
  context: ParsedSocialEventsContext,
  receivedAt: Date,
) {
  if (byteLength(raw) > SOCIAL_EVENT_MAX_BYTES) return undefined;
  const event = parseSocialEventV2(type, raw);
  if (event === undefined) return undefined;
  const clock = deriveEventClock({ occurredAt: event.occurredAt, sentAt: context.sentAt, receivedAt });
  if (clock === 'too-old') return undefined;
  return { kind: 'v2' as const, value: { event, clock } };
}
