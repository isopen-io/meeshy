import { describe, expect, it } from 'vitest';
import {
  ARRIVALS_NOTICE_KIND,
  ARRIVALS_NOTICE_STORED_LIMIT,
  ARRIVALS_NOTICE_WINDOW_MINUTES,
  arrivalsNoticeFallbackContent,
  arrivalsNoticeLine,
  arrivalsNoticeText,
  parseArrivalsNotice,
  startArrivalsNotice,
  withArrival,
  type ArrivalsNoticeMetadata,
} from '../utils/arrivals-notice';
import {
  composeConversationPreview,
  renderConversationPreviewText,
  type ConversationPreviewInput,
} from '../utils/conversation-preview';

const at = '2026-09-24T10:00:00.000Z';
const arrival = (n: number) => ({ participantId: `p${n}`, displayName: `Membre ${n}` });

function noticeOf(names: readonly string[]): ArrivalsNoticeMetadata {
  const [first, ...rest] = names;
  const start = startArrivalsNotice({ participantId: 'p-first', displayName: first ?? 'x' }, at);
  return rest.reduce(
    (notice, displayName, index) => withArrival(notice, { participantId: `p${index}`, displayName }),
    start,
  );
}

describe('Arrivées regroupées dans Meeshy Global (#7740)', () => {
  it('regroupe par fenêtre de 10 minutes', () => {
    expect(ARRIVALS_NOTICE_WINDOW_MINUTES).toBe(10);
  });

  it('ouvre une ligne avec son premier arrivant', () => {
    expect(startArrivalsNotice(arrival(1), at)).toEqual({
      kind: ARRIVALS_NOTICE_KIND,
      arrivals: [arrival(1)],
      count: 1,
      windowStartedAt: at,
    });
  });

  it('ajoute chaque arrivant EN TÊTE — les derniers arrivés sont ceux qu’on salue', () => {
    const notice = withArrival(startArrivalsNotice(arrival(1), at), arrival(2));

    expect(notice.arrivals.map((a) => a.displayName)).toEqual(['Membre 2', 'Membre 1']);
    expect(notice.count).toBe(2);
    expect(notice.windowStartedAt).toBe(at);
  });

  it('ne compte pas deux fois le même participant', () => {
    const notice = withArrival(startArrivalsNotice(arrival(1), at), arrival(1));

    expect(notice.count).toBe(1);
    expect(notice.arrivals).toHaveLength(1);
  });

  it('borne les noms gardés, jamais le compte', () => {
    const many = Array.from({ length: ARRIVALS_NOTICE_STORED_LIMIT + 5 }, (_, i) => arrival(i + 2));
    const notice = many.reduce(withArrival, startArrivalsNotice(arrival(1), at));

    expect(notice.arrivals).toHaveLength(ARRIVALS_NOTICE_STORED_LIMIT);
    expect(notice.count).toBe(ARRIVALS_NOTICE_STORED_LIMIT + 6);
  });

  describe('le texte, dans la langue du lecteur', () => {
    it('un arrivant', () => {
      expect(arrivalsNoticeText(noticeOf(['Aïcha']), 'fr')).toBe('Aïcha vient d’arriver — dis-lui salut');
    });

    it('deux arrivants', () => {
      expect(arrivalsNoticeText(noticeOf(['Aïcha', 'Tom']), 'fr')).toBe('Tom et Aïcha viennent d’arriver — dis-leur salut');
    });

    it('trois arrivants, tous nommés', () => {
      expect(arrivalsNoticeText(noticeOf(['Aïcha', 'Tom', 'Léa']), 'fr')).toBe(
        'Léa, Tom et Aïcha viennent d’arriver — dis-leur salut',
      );
    });

    it('au-delà : deux noms et le nombre des autres', () => {
      const names = ['Zoé', 'Yann', 'Xavier', 'Wendy', 'Victor', 'Ugo', 'Théo', 'Sara', 'Rémi', 'Quentin', 'Paul', 'Omar', 'Tom', 'Aïcha'];
      expect(arrivalsNoticeText(noticeOf(names), 'fr')).toBe('Aïcha, Tom et 12 autres viennent d’arriver — dis-leur salut');
    });

    it('en anglais', () => {
      expect(arrivalsNoticeText(noticeOf(['Aïcha', 'Tom', 'Léa', 'Omar']), 'en')).toBe(
        'Omar, Léa and 2 others just arrived — say hi',
      );
    });

    it('une langue hors catalogue retombe sur le français', () => {
      expect(arrivalsNoticeText(noticeOf(['Aïcha']), 'sw')).toBe('Aïcha vient d’arriver — dis-lui salut');
    });

    it('le repli stocké dans `content` est le texte français', () => {
      const notice = noticeOf(['Aïcha', 'Tom']);
      expect(arrivalsNoticeFallbackContent(notice)).toBe(arrivalsNoticeText(notice, 'fr'));
    });
  });

  it('dit à la ligne de liste quelle clé et quels noms rendre', () => {
    expect(arrivalsNoticeLine(noticeOf(['Aïcha', 'Tom', 'Léa', 'Omar']))).toEqual({
      key: 'system.members.arrived.many',
      params: { first: 'Omar', second: 'Léa', third: '', others: 2 },
    });
    expect(arrivalsNoticeLine(noticeOf(['Aïcha']))).toEqual({
      key: 'system.members.arrived.one',
      params: { first: 'Aïcha', second: '', third: '', others: 0 },
    });
  });

  describe('parseArrivalsNotice — valide, jamais ne caste', () => {
    it('relit ce qui a été écrit', () => {
      const notice = noticeOf(['Aïcha', 'Tom']);
      expect(parseArrivalsNotice(JSON.parse(JSON.stringify(notice)))).toEqual(notice);
    });

    it.each([
      null,
      'texte',
      { kind: 'member-joined', participantId: 'p', displayName: 'X' },
      { kind: ARRIVALS_NOTICE_KIND, arrivals: [], count: 0, windowStartedAt: at },
      { kind: ARRIVALS_NOTICE_KIND, arrivals: 'x', count: 1, windowStartedAt: at },
      { kind: ARRIVALS_NOTICE_KIND, arrivals: [arrival(1)], count: 'un', windowStartedAt: at },
    ])('rend null pour %j', (raw) => {
      expect(parseArrivalsNotice(raw)).toBeNull();
    });

    it('écarte un arrivant malformé sans perdre les autres', () => {
      const parsed = parseArrivalsNotice({
        kind: ARRIVALS_NOTICE_KIND,
        arrivals: [arrival(1), { participantId: 3 }, arrival(2)],
        count: 3,
        windowStartedAt: at,
      });
      expect(parsed?.arrivals).toEqual([arrival(1), arrival(2)]);
      expect(parsed?.count).toBe(3);
    });
  });
});

describe('la ligne de liste de Meeshy Global quand son dernier message est une ligne d’arrivées', () => {
  const input = (language: string) => ({
    viewerId: 'u-me',
    language,
    preferredLanguages: [language],
    now: '2026-09-24T10:05:00.000Z',
    lastMessage: {
      id: 'm-1',
      senderId: 'u-omar',
      senderName: 'Omar',
      createdAt: '2026-09-24T10:04:00.000Z',
      messageType: 'system',
      originalLanguage: 'fr',
      content: 'Omar, Léa et 2 autres viennent d’arriver — dis-leur salut',
      systemEvent: {
        key: 'system.members-arrived' as const,
        params: { first: 'Omar', second: 'Léa', third: '', others: 2, count: 4 },
      },
    },
  });

  it.each([
    ['fr', 'Omar, Léa et 2 autres viennent d’arriver — dis-leur salut'],
    ['en', 'Omar, Léa and 2 others just arrived — say hi'],
    ['de', 'Omar, Léa und 2 weitere sind gerade angekommen — sag hallo'],
  ])('se dit dans la langue du lecteur (%s)', (language, expected) => {
    const preview = composeConversationPreview(input(language) as unknown as ConversationPreviewInput);
    expect(renderConversationPreviewText(preview, language)).toBe(expected);
  });
});
