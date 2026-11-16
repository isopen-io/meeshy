import { describe, expect, it } from 'vitest';
import {
  CONTENT_CAPTURE_MAX_MESSAGES,
  contentCaptureReportSchema,
  contentCaptureRequestJsonSchema,
} from '../types/content-capture.js';
import {
  CAPTURE_NOTICE_KIND,
  CAPTURE_NOTICE_LANGUAGES,
  captureNoticeFallbackText,
  captureNoticeMetadata,
  captureNoticeText,
  parseCaptureNotice,
  sanitizeNoticeName,
  type CaptureNoticeMetadata,
} from '../utils/capture-notice.js';
import { CLIENT_EVENTS } from '../types/socketio-events.js';

const OBJECT_ID = 'a'.repeat(24);
const OTHER_ID = 'b'.repeat(24);

const report = (overrides: Record<string, unknown> = {}) => ({
  conversationId: OBJECT_ID,
  messageIds: [OTHER_ID],
  kind: 'screenshot',
  captureId: 'cap-0123456789',
  ...overrides,
});

const notice = (overrides: Partial<CaptureNoticeMetadata> = {}): CaptureNoticeMetadata => ({
  kind: CAPTURE_NOTICE_KIND,
  actor: { participantId: 'p-actor', displayName: 'Alice', isAnonymous: false },
  capturedMessageId: OTHER_ID,
  nature: 'timed-flame',
  outcome: 'announced',
  captureKind: 'screenshot',
  sentAt: '2026-10-07T12:05:00.000Z',
  ...overrides,
});

describe('le contrat client → serveur de la capture (#9617)', () => {
  it('nomme l’événement au format entity:action-word', () => {
    expect(CLIENT_EVENTS.MESSAGE_CAPTURE_DETECTED).toBe('message:capture-detected');
  });

  it('accepte une capture d’écran et un enregistrement', () => {
    expect(contentCaptureReportSchema.safeParse(report()).success).toBe(true);
    expect(contentCaptureReportSchema.safeParse(report({ kind: 'recording' })).success).toBe(true);
  });

  it('refuse une nature de capture inconnue, une liste vide ou trop longue, un identifiant qui n’en est pas un', () => {
    expect(contentCaptureReportSchema.safeParse(report({ kind: 'photo' })).success).toBe(false);
    expect(contentCaptureReportSchema.safeParse(report({ messageIds: [] })).success).toBe(false);
    expect(
      contentCaptureReportSchema.safeParse(
        report({ messageIds: Array.from({ length: CONTENT_CAPTURE_MAX_MESSAGES + 1 }, (_, i) => i.toString(16).padStart(24, '0')) }),
      ).success,
    ).toBe(false);
    expect(contentCaptureReportSchema.safeParse(report({ messageIds: ['not-an-id'] })).success).toBe(false);
  });

  it('accepte une déclaration sans identifiant de capture, mais en refuse un mal formé', () => {
    expect(contentCaptureReportSchema.safeParse(report({ captureId: undefined })).success).toBe(true);
    expect(contentCaptureReportSchema.safeParse(report({ captureId: 'short' })).success).toBe(false);
    expect(contentCaptureReportSchema.safeParse(report({ captureId: 'x'.repeat(65) })).success).toBe(false);
    expect(contentCaptureReportSchema.safeParse(report({ captureId: 'cap:0123456789' })).success).toBe(false);
  });

  it('dédoublonne les identifiants déclarés', () => {
    const parsed = contentCaptureReportSchema.parse(report({ messageIds: [OTHER_ID, OTHER_ID] }));
    expect(parsed.messageIds).toEqual([OTHER_ID]);
  });
});

describe('parseCaptureNotice — la métadonnée VALIDÉE, jamais castée', () => {
  it('relit un avis complet', () => {
    expect(parseCaptureNotice(notice())).toEqual(notice());
  });

  it('rend null pour une autre famille, une forme partielle ou une heure illisible', () => {
    expect(parseCaptureNotice({ kind: 'member-left', actor: { participantId: 'p', displayName: 'A' } })).toBeNull();
    expect(parseCaptureNotice({ ...notice(), actor: undefined })).toBeNull();
    expect(parseCaptureNotice({ ...notice(), actor: { participantId: 'p-actor', displayName: 'Alice' } })).toBeNull();
    expect(parseCaptureNotice({ ...notice(), sentAt: 'hier' })).toBeNull();
    expect(parseCaptureNotice({ ...notice(), captureKind: 'photo' })).toBeNull();
    expect(parseCaptureNotice(null)).toBeNull();
  });

  it('refuse une issue qui contredit la nature — la vue unique est toujours bloquée, une flamme jamais', () => {
    expect(parseCaptureNotice(notice({ nature: 'view-once', outcome: 'announced' }))).toBeNull();
    expect(parseCaptureNotice(notice({ nature: 'after-read-flame', outcome: 'blocked' }))).toBeNull();
  });
});

describe('captureNoticeMetadata — la seule fabrique de la métadonnée', () => {
  it('dérive l’issue de la nature et rend l’heure d’envoi en ISO', () => {
    const built = captureNoticeMetadata({
      actor: { participantId: 'p-actor', displayName: 'Alice', isAnonymous: false },
      capturedMessageId: OTHER_ID,
      nature: 'view-once',
      captureKind: 'recording',
      sentAt: new Date('2026-10-07T12:05:00Z'),
    });
    expect(built).toEqual(
      notice({ nature: 'view-once', outcome: 'blocked', captureKind: 'recording' }),
    );
    expect(parseCaptureNotice(built)).toEqual(built);
  });

  it('ne porte aucun contenu du message capturé', () => {
    const built = captureNoticeMetadata({
      actor: { participantId: 'p-actor', displayName: 'Alice', isAnonymous: false },
      capturedMessageId: OTHER_ID,
      nature: 'timed-flame',
      captureKind: 'screenshot',
      sentAt: new Date('2026-10-07T12:05:00Z'),
    });
    expect(Object.keys(built).sort()).toEqual(
      ['actor', 'capturedMessageId', 'captureKind', 'kind', 'nature', 'outcome', 'sentAt'].sort(),
    );
  });
});

describe('captureNoticeText — la phrase dans la langue et le fuseau du LECTEUR', () => {
  it('dit en français la capture d’un éphémère avec la date et l’heure d’envoi dans le fuseau du lecteur', () => {
    expect(captureNoticeText(notice(), { language: 'fr', timeZone: 'Europe/Paris' })).toBe(
      'Alice a capturé l’éphémère du 07/10/2026 à 14:05',
    );
  });

  it('change de jour quand le fuseau du lecteur le change', () => {
    const late = notice({ sentAt: '2026-10-07T23:30:00.000Z' });
    expect(captureNoticeText(late, { language: 'fr', timeZone: 'Europe/Paris' })).toBe(
      'Alice a capturé l’éphémère du 08/10/2026 à 01:30',
    );
    expect(captureNoticeText(late, { language: 'fr', timeZone: 'America/New_York' })).toBe(
      'Alice a capturé l’éphémère du 07/10/2026 à 19:30',
    );
  });

  it('dit l’enregistrement d’écran autrement que la capture', () => {
    expect(captureNoticeText(notice({ captureKind: 'recording' }), { language: 'fr', timeZone: 'UTC' })).toBe(
      'Alice a enregistré l’écran pendant l’éphémère du 07/10/2026 à 12:05',
    );
  });

  it('dit la tentative sur une vue unique, sans date', () => {
    const once = notice({ nature: 'view-once', outcome: 'blocked' });
    expect(captureNoticeText(once, { language: 'fr', timeZone: 'UTC' })).toBe(
      'Alice a tenté de capturer un message à vue unique — impossible',
    );
    expect(captureNoticeText({ ...once, captureKind: 'recording' }, { language: 'fr', timeZone: 'UTC' })).toBe(
      'Alice a tenté d’enregistrer un message à vue unique — impossible',
    );
    expect(captureNoticeText(once, { language: 'en', timeZone: 'UTC' })).toBe(
      'Alice tried to capture a view-once message — not possible',
    );
  });

  it('parle la langue du lecteur, région comprise', () => {
    expect(captureNoticeText(notice(), { language: 'en-US', timeZone: 'UTC' })).toContain('Alice took a screenshot of the disappearing message from');
    expect(captureNoticeText(notice(), { language: 'es', timeZone: 'UTC' })).toContain('Alice capturó el mensaje efímero del');
    expect(captureNoticeText(notice(), { language: 'de', timeZone: 'UTC' })).toContain('Alice hat einen Screenshot der verschwindenden Nachricht vom');
  });

  it('a une phrase non vide pour chaque langue, nature et sorte de capture, avec le nom de l’acteur', () => {
    const cases = CAPTURE_NOTICE_LANGUAGES.flatMap((language) =>
      (['timed-flame', 'view-once'] as const).flatMap((nature) =>
        (['screenshot', 'recording'] as const).map((captureKind) => ({ language, nature, captureKind })),
      ),
    );
    const texts = cases.map(({ language, nature, captureKind }) =>
      captureNoticeText(notice({ nature, captureKind, outcome: nature === 'view-once' ? 'blocked' : 'announced' }), {
        language,
        timeZone: 'UTC',
      }),
    );
    expect(texts.every((text) => text.includes('Alice') && !text.includes('{'))).toBe(true);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('retombe sur le français pour une langue hors catalogue, et sur UTC pour un fuseau invalide', () => {
    expect(captureNoticeText(notice(), { language: 'ja', timeZone: 'UTC' })).toBe('Alice a capturé l’éphémère du 07/10/2026 à 12:05');
    expect(captureNoticeText(notice(), { language: 'fr', timeZone: 'Pas/UnFuseau' })).toBe('Alice a capturé l’éphémère du 07/10/2026 à 12:05');
    expect(captureNoticeText(notice(), { language: null, timeZone: null })).toBe('Alice a capturé l’éphémère du 07/10/2026 à 12:05');
  });
});

describe('l’acteur se distingue d’un homonyme, et son nom ne se déguise pas (audit #9617, A8)', () => {
  it('nomme un inscrit avec son pseudo, un invité comme invité — dans la phrase ET le repli', () => {
    const member = notice({ actor: { participantId: 'p-1', displayName: 'Bob', isAnonymous: false, username: 'bob' } });
    const guest = notice({ actor: { participantId: 'p-2', displayName: 'Bob', isAnonymous: true } });
    expect(captureNoticeText(member, { language: 'fr', timeZone: 'UTC' })).toBe('Bob (@bob) a capturé l’éphémère du 07/10/2026 à 12:05');
    expect(captureNoticeText(guest, { language: 'fr', timeZone: 'UTC' })).toBe('Bob (invité) a capturé l’éphémère du 07/10/2026 à 12:05');
    expect(captureNoticeText(guest, { language: 'en', timeZone: 'UTC' })).toContain('Bob (guest) took a screenshot');
    expect(captureNoticeFallbackText(guest)).toBe('Bob (invité) a capturé l’éphémère du 07/10/2026 à 12:05 (UTC)');
  });

  it('porte isAnonymous et le pseudo dans la métadonnée, relus par le parseur', () => {
    const built = captureNoticeMetadata({
      actor: { participantId: 'p-1', displayName: 'Bob', isAnonymous: false, username: 'bob' },
      capturedMessageId: OTHER_ID,
      nature: 'timed-flame',
      captureKind: 'screenshot',
      sentAt: new Date('2026-10-07T12:05:00Z'),
    });
    expect(built.actor).toEqual({ participantId: 'p-1', displayName: 'Bob', isAnonymous: false, username: 'bob' });
    expect(parseCaptureNotice(built)).toEqual(built);
  });

  it('retire à l’écriture les contrôles de direction et les caractères de contrôle, et borne la longueur', () => {
    expect(sanitizeNoticeName('\u202EboB\u202C')).toBe('boB');
    expect(sanitizeNoticeName('Al\u0000ice\u2066 \u200F  Martin\n')).toBe('Alice Martin');
    expect(sanitizeNoticeName('x'.repeat(200))).toHaveLength(64);
    const built = captureNoticeMetadata({
      actor: { participantId: 'p-1', displayName: '\u202Eniamda', isAnonymous: true, username: 'ano_\u202Ex' },
      capturedMessageId: OTHER_ID,
      nature: 'timed-flame',
      captureKind: 'screenshot',
      sentAt: new Date('2026-10-07T12:05:00Z'),
    });
    expect(built.actor).toEqual({ participantId: 'p-1', displayName: 'niamda', isAnonymous: true });
  });

  it('retombe sur un nom neutre quand il ne reste rien', () => {
    expect(sanitizeNoticeName('\u202E\u200F ')).toBe('?');
  });
});

describe('captureNoticeFallbackText — le repli lisible des clients antérieurs à ce kind', () => {
  it('est la phrase française en UTC, le fuseau DIT', () => {
    expect(captureNoticeFallbackText(notice())).toBe('Alice a capturé l’éphémère du 07/10/2026 à 12:05 (UTC)');
    expect(captureNoticeFallbackText(notice({ nature: 'view-once', outcome: 'blocked' }))).toBe(
      'Alice a tenté de capturer un message à vue unique — impossible',
    );
  });
});

describe('combien de captures, combien de temps d’enregistrement (#18830)', () => {
  it('accepte une durée d’enregistrement entière et bornée, et refuse le reste', () => {
    expect(contentCaptureReportSchema.safeParse(report({ kind: 'recording', recordingSeconds: 65 })).success).toBe(true);
    expect(contentCaptureReportSchema.safeParse(report({ kind: 'recording', recordingSeconds: 0 })).success).toBe(true);
    expect(contentCaptureReportSchema.safeParse(report({ kind: 'recording', recordingSeconds: -1 })).success).toBe(false);
    expect(contentCaptureReportSchema.safeParse(report({ kind: 'recording', recordingSeconds: 1.5 })).success).toBe(false);
    expect(contentCaptureReportSchema.safeParse(report({ kind: 'recording', recordingSeconds: 86_401 })).success).toBe(false);
  });

  it('déclare la durée dans le schéma JSON de la route, sans rouvrir les clés libres', () => {
    expect(contentCaptureRequestJsonSchema.properties).toHaveProperty('recordingSeconds');
    expect(contentCaptureRequestJsonSchema.additionalProperties).toBe(false);
  });

  it('porte le nombre et la durée dans la métadonnée, et le parseur les relit', () => {
    const written = captureNoticeMetadata({
      actor: { participantId: 'p-actor', displayName: 'Alice', isAnonymous: false },
      capturedMessageId: OTHER_ID,
      nature: 'timed-flame',
      captureKind: 'recording',
      sentAt: new Date('2026-10-07T12:05:00.000Z'),
      count: 2,
      recordedSeconds: 125,
    });
    expect(written).toMatchObject({ count: 2, recordedSeconds: 125 });
    expect(parseCaptureNotice(written)).toEqual(written);
  });

  it('n’écrit ni nombre ni durée quand il n’y a qu’une capture sans durée — la forme d’avant', () => {
    expect(captureNoticeMetadata({
      actor: { participantId: 'p-actor', displayName: 'Alice', isAnonymous: false },
      capturedMessageId: OTHER_ID,
      nature: 'timed-flame',
      captureKind: 'screenshot',
      sentAt: new Date('2026-10-07T12:05:00.000Z'),
      count: 1,
      recordedSeconds: 0,
    })).toEqual(notice());
  });

  it('ignore un nombre ou une durée illisible sans rejeter l’avis', () => {
    expect(parseCaptureNotice({ ...notice(), count: 'trois', recordedSeconds: -4 })).toEqual(notice());
    expect(parseCaptureNotice({ ...notice(), count: 2.5 })).toEqual(notice());
  });

  it('dit le nombre de captures', () => {
    expect(captureNoticeText(notice({ count: 3 }), { language: 'fr', timeZone: 'UTC' })).toBe(
      'Alice a capturé l’éphémère du 07/10/2026 à 12:05 · 3 captures',
    );
    expect(captureNoticeText(notice({ count: 3 }), { language: 'en', timeZone: 'UTC' })).toContain('· 3 screenshots');
  });

  it('dit la durée de l’enregistrement, et le nombre d’enregistrements', () => {
    expect(captureNoticeText(notice({ captureKind: 'recording', recordedSeconds: 65 }), { language: 'fr', timeZone: 'UTC' })).toBe(
      'Alice a enregistré l’écran pendant l’éphémère du 07/10/2026 à 12:05 · durée 1 min 05 s',
    );
    expect(
      captureNoticeText(notice({ captureKind: 'recording', count: 2, recordedSeconds: 3_725 }), { language: 'fr', timeZone: 'UTC' }),
    ).toBe('Alice a enregistré l’écran pendant l’éphémère du 07/10/2026 à 12:05 · 2 enregistrements · durée 1 h 02 min 05 s');
    expect(captureNoticeText(notice({ captureKind: 'recording', recordedSeconds: 42 }), { language: 'de', timeZone: 'UTC' })).toContain('· Dauer 42 s');
  });

  it('a un suffixe non vide dans chaque langue', () => {
    for (const language of CAPTURE_NOTICE_LANGUAGES) {
      const plain = captureNoticeText(notice({ captureKind: 'recording' }), { language, timeZone: 'UTC' });
      const counted = captureNoticeText(notice({ captureKind: 'recording', count: 4, recordedSeconds: 9 }), { language, timeZone: 'UTC' });
      expect(counted.startsWith(plain)).toBe(true);
      expect(counted.length).toBeGreaterThan(plain.length + 6);
      expect(counted).toContain('4');
    }
  });

  it('garde le nombre et la durée dans le repli, après le fuseau', () => {
    expect(captureNoticeFallbackText(notice({ count: 2 }))).toBe('Alice a capturé l’éphémère du 07/10/2026 à 12:05 (UTC) · 2 captures');
  });
});

