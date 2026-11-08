import { describe, expect, it } from 'vitest';
import {
  SHARED_LOCATION_DEFAULT_PRECISION,
  SHARED_LOCATION_RECIPIENTS_MAX,
  sharedLocationStartPayloadSchema,
  sharedLocationUpdatePayloadSchema,
} from '../types/shared-location';
import { CLIENT_EVENTS, SERVER_EVENTS } from '../types/socketio-events';

const READER = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const start = (overrides: Record<string, unknown> = {}) => ({
  recipients: [{ userId: READER }],
  durationMinutes: 60,
  position: { latitude: 48.8566, longitude: 2.3522 },
  ...overrides,
});

describe('le contrat du partage temporaire de position (#16980)', () => {
  it('nomme ses événements entity:action-word, distincts du partage dans une conversation', () => {
    expect(CLIENT_EVENTS.SHARED_LOCATION_START).toBe('location:share-start');
    expect(CLIENT_EVENTS.SHARED_LOCATION_UPDATE).toBe('location:share-update');
    expect(CLIENT_EVENTS.SHARED_LOCATION_STOP).toBe('location:share-stop');
    expect(SERVER_EVENTS.SHARED_LOCATION_CHANGED).toBe('location:share-changed');
    expect(SERVER_EVENTS.SHARED_LOCATION_ENDED).toBe('location:share-ended');
    expect(SERVER_EVENTS.LOCATION_LIVE_UPDATED).toBe('location:live-updated');
  });

  it('accepte 1 h et 8 h, rien d\'autre', () => {
    expect(sharedLocationStartPayloadSchema.safeParse(start()).success).toBe(true);
    expect(sharedLocationStartPayloadSchema.safeParse(start({ durationMinutes: 480 })).success).toBe(true);
    expect(sharedLocationStartPayloadSchema.safeParse(start({ durationMinutes: 1440 })).success).toBe(false);
  });

  it('prend la ville par défaut : la précision ne s\'ouvre que si l\'émetteur la donne', () => {
    expect(SHARED_LOCATION_DEFAULT_PRECISION).toBe('city');
    const parsed = sharedLocationStartPayloadSchema.parse(start());
    expect(parsed.recipients[0]?.precision).toBeUndefined();
  });

  it('refuse un destinataire en double, une liste vide ou trop longue, un champ en trop', () => {
    expect(sharedLocationStartPayloadSchema.safeParse(start({ recipients: [{ userId: READER }, { userId: READER.toUpperCase() }] })).success).toBe(false);
    expect(sharedLocationStartPayloadSchema.safeParse(start({ recipients: [] })).success).toBe(false);
    const many = Array.from({ length: SHARED_LOCATION_RECIPIENTS_MAX + 1 }, (_, i) => ({ userId: i.toString(16).padStart(24, '0') }));
    expect(sharedLocationStartPayloadSchema.safeParse(start({ recipients: many })).success).toBe(false);
    expect(sharedLocationStartPayloadSchema.safeParse(start({ conversationId: READER })).success).toBe(false);
  });

  it('refuse des coordonnées hors bornes', () => {
    expect(sharedLocationUpdatePayloadSchema.safeParse({ latitude: 91, longitude: 0 }).success).toBe(false);
    expect(sharedLocationUpdatePayloadSchema.safeParse({ latitude: 0, longitude: -181 }).success).toBe(false);
    expect(sharedLocationUpdatePayloadSchema.safeParse({ latitude: Number.NaN, longitude: 0 }).success).toBe(false);
  });
});
