import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Conversation } from '@/lib/api/types';
import type { ConversationFlags } from '@/lib/api/preferences';

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
