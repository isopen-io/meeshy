import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Conversation } from '@/lib/api/types';
import type { ConversationFlags } from '@/lib/api/preferences';
import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { applyConversationUpdated } from '@/lib/api/realtime-apply';

import { LensRow, sameRowProps, type LensRowProps } from './lens-row';

const conversation = (partial: Partial<Conversation>): Conversation =>
  ({
    id: 'c1',
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
    title: 'Amina',
    lastMessage: { id: 'm1', content: 'Bonjour', createdAt: new Date('2026-01-01T10:00:00Z') } as never,
    lastMessageAt: new Date('2026-01-01T10:00:00Z'),
    ...partial,
  }) as Conversation;

/**
 * `exactOptionalPropertyTypes` interdit `lastMessage: undefined` en littéral
 * (une propriété optionnelle s'OMET, elle ne se pose pas à `undefined`) —
 * ce petit adaptateur retire vraiment la clé, plutôt que de la neutraliser.
 */
const conversationWithoutLastMessage = (partial: Partial<Conversation> = {}): Conversation => {
  const { lastMessage: _lastMessage, ...withoutHistory } = conversation(partial);
  return withoutHistory as Conversation;
};

const FLAGS: ConversationFlags = { isPinned: false, isMuted: false, isArchived: false };
// Référence STABLE — comme `READER_LANGUAGES` en production
// (`routes/conversations.tsx`) : un tableau littéral recréé à chaque appel
// de `baseProps()` ferait tomber `sameRowProps` pour la MAUVAISE raison.
const LANGUAGES: readonly string[] = ['fr'];

function baseProps(overrides: Partial<LensRowProps> = {}): LensRowProps {
  return {
    conversation: conversation({}),
    languages: LANGUAGES,
    viewerId: 'u-viewer',
    flags: FLAGS,
    unreadCount: 0,
    onRowAction: () => {},
    ...overrides,
  };
}

describe('la rangée de la Lentille — hiérarchie typographique (#5694, écart 1)', () => {
  test('le nom porte data-name, text-bubble et font-extrabold — CONSTANT, jamais conditionné au non-lu', () => {
    const withoutUnread = renderToStaticMarkup(<LensRow {...baseProps({ unreadCount: 0 })} />);
    const withUnread = renderToStaticMarkup(<LensRow {...baseProps({ unreadCount: 3 })} />);
    for (const html of [withoutUnread, withUnread]) {
      expect(html).toContain('data-name');
      expect(html).toMatch(/data-name[^>]*class="[^"]*text-bubble[^"]*font-extrabold[^"]*"/);
      expect(html).not.toContain('font-black');
    }
  });

  test("l'aperçu (ligne 2) porte data-line2 et text-title", () => {
    const html = renderToStaticMarkup(<LensRow {...baseProps()} />);
    expect(html).toContain('data-line2');
    expect(html).toMatch(/data-line2[^>]*class="[^"]*text-title[^"]*"/);
  });

  test("l'heure est rendue par <time data-time>, jamais un texte HH:MM en dur", () => {
    const html = renderToStaticMarkup(<LensRow {...baseProps()} />);
    expect(html).toContain('data-time');
    expect(html).toContain('<time');
  });

  /**
   * #5694, correction défaut 1 — UNE CONVERSATION SANS HISTORIQUE
   * (`lastMessage` absent, aucun message jamais envoyé) porte quand même
   * `lastMessageAt` : la passerelle le sert TOUJOURS
   * (`schema.prisma:495`, `DateTime @default(now())`, sans `?`). La rangée
   * doit donc TOUJOURS montrer une heure dans ce cas — un `at === undefined`
   * ne peut survenir que sur une fixture qui fabrique un état impossible sur
   * le wire, jamais sur un corpus fidèle.
   */
  test("une conversation sans historique (lastMessage absent) affiche quand même une heure — lastMessageAt reste servi", () => {
    const html = renderToStaticMarkup(
      <LensRow
        {...baseProps({
          conversation: conversationWithoutLastMessage({ lastMessageAt: new Date('2026-01-01T10:00:00Z') }),
        })}
      />,
    );
    expect(html).toContain('data-time');
    expect(html).toContain('<time');
  });

  /**
   * #5780 — une conversation sans historique servait un original vide
   * (`served()` sans traduction ni texte) : la ligne 2 se rendait comme un
   * `<span>` VIDE plutôt que comme un état. La rangée doit dire « Nouvelle
   * conversation », jamais rien.
   */
  test("une conversation sans historique dit « Nouvelle conversation » sur la ligne 2, jamais une ligne vide", () => {
    const html = renderToStaticMarkup(
      <LensRow
        {...baseProps({
          conversation: conversationWithoutLastMessage({ lastMessageAt: new Date('2026-01-01T10:00:00Z') }),
        })}
      />,
    );
    expect(html).toContain('Nouvelle conversation');
  });

  test('une conversation AVEC historique ne dit jamais « Nouvelle conversation »', () => {
    const html = renderToStaticMarkup(<LensRow {...baseProps()} />);
    expect(html).not.toContain('Nouvelle conversation');
  });
});

describe('sameRowProps — le comparateur de memo (#5694, cinquième point)', () => {
  // Une conversation et une action PARTAGÉES par les deux jeux de props :
  // seul le champ sous test doit varier — `baseProps()` créerait sinon une
  // conversation NEUVE à chaque appel par défaut, faisant tomber le
  // comparateur pour la MAUVAISE raison.
  const sharedConversation = conversation({});
  const sharedAction = () => {};
  const withShared = (overrides: Partial<LensRowProps> = {}) =>
    baseProps({ conversation: sharedConversation, onRowAction: sharedAction, ...overrides });

  test('vrai quand seuls des objets `flags` de même CONTENU diffèrent par identité', () => {
    const props1 = withShared({ flags: { isPinned: false, isMuted: false, isArchived: false } });
    const props2 = withShared({ flags: { isPinned: false, isMuted: false, isArchived: false } });
    expect(props1.flags).not.toBe(props2.flags);
    expect(sameRowProps(props1, props2)).toBe(true);
  });

  test('faux dès que `magnified` change', () => {
    const props1 = withShared({ status: { magnified: false, alpha: 1, scale: 1, breathing: 0 } });
    const props2 = withShared({ status: { magnified: true, alpha: 1, scale: 1, breathing: 0 } });
    expect(sameRowProps(props1, props2)).toBe(false);
  });

  test('faux dès que `unreadCount` change', () => {
    const props1 = withShared({ unreadCount: 0 });
    const props2 = withShared({ unreadCount: 1 });
    expect(sameRowProps(props1, props2)).toBe(false);
  });

  test("faux dès qu'un des trois flags change", () => {
    const props1 = withShared({ flags: { isPinned: false, isMuted: false, isArchived: false } });
    const props2 = withShared({ flags: { isPinned: true, isMuted: false, isArchived: false } });
    expect(sameRowProps(props1, props2)).toBe(false);
  });

  test('faux dès que `conversation` (référence) change', () => {
    const c1 = conversation({});
    const c2 = conversation({});
    const props1 = baseProps({ conversation: c1 });
    const props2 = baseProps({ conversation: c2 });
    expect(sameRowProps(props1, props2)).toBe(false);
  });

  test('faux dès que `onRowAction` (référence) change', () => {
    const props1 = baseProps({ onRowAction: () => {} });
    const props2 = baseProps({ onRowAction: () => {} });
    expect(sameRowProps(props1, props2)).toBe(false);
  });

  test('vrai quand tout — y compris les références stables — est identique', () => {
    const stableAction = () => {};
    const stableConversation = conversation({});
    const props1 = baseProps({ onRowAction: stableAction, conversation: stableConversation });
    const props2 = baseProps({ onRowAction: stableAction, conversation: stableConversation });
    expect(sameRowProps(props1, props2)).toBe(true);
  });
});

/**
 * LA TRONCATURE DE L'APERÇU (revue #5694) — `text-overflow: ellipsis` ne
 * s'applique JAMAIS au contenu d'un conteneur `display: flex` : posée sur
 * `data-line2`, elle coupait le texte NET au bord, sans point de suspension,
 * là où la cible iOS en montre un (targets/lentille.dark.png). Elle doit donc
 * vivre sur le NŒUD DE TEXTE, et le conteneur ne garder que `overflow-hidden`.
 */
describe("l'aperçu est un BLOC de texte, jamais une rangée flex", () => {
  const line2Class = (html: string) => /data-line2[^>]*class="([^"]*)"/.exec(html)?.[1] ?? '';

  test('le conteneur data-line2 est un bloc — `text-overflow` et `line-clamp` n’opèrent pas en flex', () => {
    const cls = line2Class(renderToStaticMarkup(<LensRow {...baseProps()} />));
    expect(cls).toContain('block');
    expect(cls).not.toMatch(/(?:^|\s)flex(?:\s|$)/);
  });

  test('au repos il tronque (une ligne) ; magnifié il clampe à deux lignes', () => {
    expect(line2Class(renderToStaticMarkup(<LensRow {...baseProps()} />))).toMatch(/\btruncate\b/);
    const magnified = renderToStaticMarkup(
      <LensRow {...baseProps({ status: { magnified: true, alpha: 1, scale: 1, breathing: 0 } })} />,
    );
    expect(line2Class(magnified)).toMatch(/\bline-clamp-2\b/);
  });

  test("le nom de l'expéditeur reste HORS du nœud qui porte `lang` — le Prisme ne traduit pas un nom", () => {
    const html = renderToStaticMarkup(
      <LensRow
        {...baseProps({
          conversation: conversation({
            type: 'group',
            lastMessage: {
              id: 'm1',
              content: 'Hello',
              createdAt: new Date('2026-01-01T10:00:00Z'),
              originalLanguage: 'en',
              sender: { id: 'u2', displayName: 'Kwame' },
            } as never,
          }),
        })}
      />,
    );
    // Le nom précède le nœud de texte servi, DANS le même flux, mais DEHORS :
    // ce nœud-là est le seul que `lang` habillerait.
    expect(html).toMatch(/data-line2[^>]*>Kwame : <span/);
  });
});

/**
 * LE COMPARATEUR N'EST PAS UN INVENTAIRE (revue #5694) — il énumère les clés
 * de l'objet reçu, donc un drapeau AJOUTÉ plus tard à `ConversationFlags` est
 * comparé sans qu'on ait à revenir ici. Le témoin le prouve en passant un
 * drapeau que le type ne connaît pas encore.
 */
describe('sameRowProps compare TOUS les drapeaux, pas une liste écrite à la main', () => {
  const withExtra = (value: boolean): ConversationFlags =>
    ({ ...FLAGS, isSomethingNew: value }) as unknown as ConversationFlags;
  /* Une seule et MÊME conversation des deux côtés : sans quoi le comparateur
     répondrait « différent » sur la référence de `conversation`, et le témoin
     ne dirait plus rien des drapeaux. */
  const stable = conversation({});
  const noop = () => {};
  const props = (flags: ConversationFlags): LensRowProps =>
    baseProps({ conversation: stable, flags, onRowAction: noop });

  test('un drapeau hors de la liste connue fait quand même re-rendre', () => {
    expect(sameRowProps(props(withExtra(false)), props(withExtra(true)))).toBe(false);
  });

  test('deux jeux de drapeaux identiques restent identiques', () => {
    expect(sameRowProps(props(withExtra(true)), props(withExtra(true)))).toBe(true);
  });

  test('un drapeau AJOUTÉ d’un côté seulement fait re-rendre', () => {
    expect(sameRowProps(props(FLAGS), props(withExtra(false)))).toBe(false);
  });
});

/**
 * REVUE #5805 — UN DERNIER MESSAGE SANS TEXTE. `served()` rend une chaîne
 * vide, et la ligne 2 se rendait VIDE : la rangée « Médias » disait
 * « Kwame Mensah : » suivi de rien (mesuré sur la coque Android). iOS compose
 * un libellé depuis la pièce (`LentilleConversationRow.standardPreview`,
 * `:635-676`) : glyphe + `AttachmentKind.shortLabel`, `+N` au-delà d'une.
 */
describe('la rangée de la Lentille — un dernier message SANS TEXTE (revue #5805)', () => {
  const withMedia = (mimeType: string, count = 1): Conversation =>
    conversation({
      type: 'group',
      title: 'Médias',
      lastMessage: {
        id: 'm-media',
        content: '',
        createdAt: new Date('2026-01-01T10:00:00Z'),
        sender: { displayName: 'Kwame Mensah' },
        attachments: Array.from({ length: count }, (_, i) => ({ id: `a${i}`, mimeType })),
      } as never,
      lastMessageOriginalLanguage: 'fr',
    });

  test('un VOCAL : le libellé « Audio », jamais une ligne vide', () => {
    const html = renderToStaticMarkup(<LensRow {...baseProps({ conversation: withMedia('audio/wav') })} />);
    expect(html).toContain('Kwame Mensah : ');
    expect(html).toContain('Audio');
  });

  test('une PHOTO : le libellé « Photo »', () => {
    const html = renderToStaticMarkup(<LensRow {...baseProps({ conversation: withMedia('image/png') })} />);
    expect(html).toContain('Photo');
  });

  test('un FICHIER : le libellé « Fichier »', () => {
    const html = renderToStaticMarkup(<LensRow {...baseProps({ conversation: withMedia('application/pdf') })} />);
    expect(html).toContain('Fichier');
  });

  test('trois pièces : « +2 » derrière le libellé de la première', () => {
    const html = renderToStaticMarkup(<LensRow {...baseProps({ conversation: withMedia('image/png', 3) })} />);
    expect(html).toContain('Photo');
    expect(html).toContain('+2');
  });

  test('un message AVEC texte garde son aperçu — la pièce ne parle jamais à sa place', () => {
    const withBoth = conversation({
      lastMessage: {
        id: 'm-both',
        content: 'Voici la capture',
        createdAt: new Date('2026-01-01T10:00:00Z'),
        attachments: [{ id: 'a0', mimeType: 'image/png' }],
      } as never,
      lastMessageOriginalLanguage: 'fr',
    });
    const html = renderToStaticMarkup(<LensRow {...baseProps({ conversation: withBoth })} />);
    expect(html).toContain('Voici la capture');
    expect(html).not.toContain('Photo');
  });
});

/**
 * LA LIGNE 2 EN FRAPPE (#5793 revue-correction) — précédence
 * `typing > brouillon > pont ✦ > aperçu`, `typing` en TÊTE
 * (`targets/lentille.md:502-511`, `LentilleConversationRow.swift` §
 * `Line2Kind.resolve`). Les témoins interrogent ce que la rangée REND, jamais
 * la présence du champ.
 */
describe('la rangée de la Lentille — « X écrit » (#5793)', () => {
  test('la frappe REMPLACE l’aperçu sur la ligne 2', () => {
    const html = renderToStaticMarkup(<LensRow {...baseProps({ typist: 'Amina Diallo' })} />);
    expect(html).toContain('Amina Diallo écrit');
    expect(html).not.toContain('Bonjour');
  });

  test('sans frappeur, la ligne 2 reste l’aperçu — rien d’inventé', () => {
    const html = renderToStaticMarkup(<LensRow {...baseProps()} />);
    expect(html).toContain('Bonjour');
    expect(html).not.toContain('écrit');
  });

  /** Un aperçu PROTÉGÉ ne doit pas reparaître par la porte de la frappe — et
   * réciproquement, la frappe ne laisse rien fuir puisqu'elle ne dit rien du
   * contenu (D-23, #5676). */
  test('sur un dernier message à VUE UNIQUE, la frappe prime et le contenu ne revient pas', () => {
    const viewOnce = conversation({
      lastMessage: { id: 'm-vo', content: 'le code du coffre', createdAt: new Date('2026-01-01T10:00:00Z'), isViewOnce: true } as never,
    });
    const html = renderToStaticMarkup(<LensRow {...baseProps({ conversation: viewOnce, typist: 'Amina Diallo' })} />);
    expect(html).toContain('Amina Diallo écrit');
    expect(html).not.toContain('le code du coffre');
  });

  /** La frappe est une PREUVE D'ACTIVITÉ : le point de présence passe au vert
   * quoi qu'ait servi le serveur (`LentilleConversationRow.swift:125-127`,
   * `CLAUDE.md` § « User Presence »). `presence: 'offline'` ⇒ AUCUN point ;
   * la frappe doit donc en faire apparaître un. */
  test('la frappe FORCE la pastille de présence en ligne sur un direct hors ligne', () => {
    const offline = conversation({
      participants: [
        { id: 'p1', userId: 'u-viewer' },
        { id: 'p2', userId: 'u-amina', user: { id: 'u-amina', isOnline: false } },
      ] as never,
    });
    const atRest = renderToStaticMarkup(<LensRow {...baseProps({ conversation: offline })} />);
    const typing = renderToStaticMarkup(<LensRow {...baseProps({ conversation: offline, typist: 'Amina Diallo' })} />);
    expect(atRest).not.toContain('data-presence');
    expect(typing).toMatch(/data-presence="online"/);
  });

  test('sameRowProps distingue DEUX rangées qui ne diffèrent que par leur frappeur', () => {
    // Les MÊMES références partout sauf `typist` (comme en production, où
    // `CONVERSATIONS`, `READER_LANGUAGES` et `rowAction` sont stables) : sinon
    // le témoin mesurerait l'identité du corpus ou du callback, pas `typist`.
    const stable: Partial<LensRowProps> = { conversation: conversation({}), onRowAction: () => {} };
    expect(sameRowProps(baseProps(stable), baseProps({ ...stable, typist: 'Amina Diallo' }))).toBe(false);
    expect(
      sameRowProps(baseProps({ ...stable, typist: 'Amina Diallo' }), baseProps({ ...stable, typist: 'Amina Diallo' })),
    ).toBe(true);
  });
});

/**
 * T6 (#6171) — la rangée RE-REND l'aperçu SERVI après `applyConversationUpdated`.
 * `applyConversationUpdated` patch le cache DIRECTEMENT (motif `socket.test.ts`
 * § `conversation:updated`) : on relit la conversation PATCHÉE et on la rend
 * telle quelle — c'est le même geste que ferait l'écran (`useConversationsSnapshot`).
 */
describe('LensRow après applyConversationUpdated (#6171, T6) — l’aperçu SERVI, et la rangée SE re-rend', () => {
  test('le `<span lang="fr">` porte le texte SERVI, le préfixe nomme l’auteur ADOPTÉ ; sameRowProps constate une IDENTITÉ neuve', () => {
    const client = new QueryClient();
    const before = conversation({
      id: 'c-a',
      // GROUPE, et c'est ce qui rend l'ADOPTION observable À L'ÉCRAN : le
      // préfixe d'auteur de la ligne 2 ne se rend que là (`senderName = group
      // ? …`, `lens-row.tsx`), et il vient de `lastMessage.sender.displayName`
      // — donc de la LIGNE NEUTRE, jamais de la carte de traductions. Sans
      // cette moitié, le témoin restait VERT après retrait de l'adoption
      // (mesuré en revue-correction #6171) : la rangée lit
      // `lastMessageTranslations`, qui se patche de toute façon.
      type: 'group',
      memberCount: 3,
      lastMessage: { id: 'm-2', content: 'Oui, jeudi 14h.', createdAt: new Date('2026-01-01T10:00:00Z') } as never,
    });
    // Le cache de liste porte des PAGES (`InfiniteData`, #6195) — une seule
    // page suffit ici, `applyConversationUpdated`/`patchConversation`
    // absorbent la forme sans qu'aucune règle testée ne change.
    client.setQueryData(CONVERSATIONS_QUERY_KEY, {
      pages: [
        {
          conversations: [before],
          pagination: { limit: 30, offset: 0, total: 1, hasMore: false },
          cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
        },
      ],
      pageParams: [undefined],
    });

    applyConversationUpdated(client, {
      conversationId: 'c-a',
      updatedBy: { id: 'u-kwame' },
      updatedAt: '2026-09-12T10:07:00.000Z',
      lastMessageId: 'm-1',
      lastMessagePreview: 'Hola, ¿la revisión sigue el jueves?',
      lastMessageOriginalLanguage: 'es',
      lastMessageAt: '2026-09-12T10:00:00.000Z',
      lastMessageTranslations: { fr: 'Bonjour, la revue reste bien jeudi ?' },
      lastMessageSenderName: 'Kwame Mensah',
      previewRecalculated: true,
    });

    const after = client
      .getQueryData<{ readonly pages: readonly { readonly conversations: readonly Conversation[] }[] }>(CONVERSATIONS_QUERY_KEY)
      ?.pages.flatMap((p) => p.conversations)
      .find((c) => c.id === 'c-a') as Conversation;

    const beforeProps = baseProps({ conversation: before });
    const afterProps = baseProps({ conversation: after });

    const html = renderToStaticMarkup(<LensRow {...afterProps} />);
    expect(html).toContain('lang="fr"');
    expect(html).toContain('Bonjour, la revue reste bien jeudi ?');
    // L'ADOPTION atteint le PIXEL : l'auteur rendu est celui du message NOUVEAU.
    expect(html).toContain('Kwame Mensah');
    expect(renderToStaticMarkup(<LensRow {...beforeProps} />)).not.toContain('Kwame Mensah');

    // La rangée SE re-rend : `conversation` a changé d'IDENTITÉ (patch immuable).
    expect(sameRowProps(beforeProps, afterProps)).toBe(false);
  });
});
