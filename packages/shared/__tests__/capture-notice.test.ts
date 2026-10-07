import { describe, expect, it } from 'vitest';
import {
  CONTENT_CAPTURE_MAX_MESSAGES,
  contentCaptureReportSchema,
} from '../types/content-capture.js';
import {
  CAPTURE_NOTICE_KIND,
  CAPTURE_NOTICE_LANGUAGES,
  captureNoticeFallbackText,
  captureNoticeMetadata,
  captureNoticeText,
  parseCaptureNotice,
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
  actor: { participantId: 'p-actor', displayName: 'Alice' },
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

  it('exige un identifiant de capture borné, sans caractère de clé', () => {
    expect(contentCaptureReportSchema.safeParse(report({ captureId: undefined })).success).toBe(false);
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
      actor: { participantId: 'p-actor', displayName: 'Alice' },
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
      actor: { participantId: 'p-actor', displayName: 'Alice' },
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

describe('captureNoticeFallbackText — le repli lisible des clients antérieurs à ce kind', () => {
  it('est la phrase française en UTC, le fuseau DIT', () => {
    expect(captureNoticeFallbackText(notice())).toBe('Alice a capturé l’éphémère du 07/10/2026 à 12:05 (UTC)');
    expect(captureNoticeFallbackText(notice({ nature: 'view-once', outcome: 'blocked' }))).toBe(
      'Alice a tenté de capturer un message à vue unique — impossible',
    );
  });
});
