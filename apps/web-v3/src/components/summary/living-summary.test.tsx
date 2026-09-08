import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ConversationEpisode, DeterministicConversationDigest, FaceRampEntry } from '@/lib/summary/types';

import { LivingSummary } from './living-summary';

/**
 * `LivingSummary` — RENDU (#5695, étape 8, § 4.11 de la spécification). Ce
 * que les lois pures ne prouvent pas : qui AFFICHE ce qu'elles décident.
 *
 * `renderToStaticMarkup` pour le texte/attributs statiques (motif
 * `progression.test.tsx`). Pour les TROIS SORTIES (témoin d'EFFET), le
 * composant est appelé comme une fonction PURE — un élément React est un
 * objet `{ type, props }` — et l'arbre est PARCOURU pour retrouver le
 * `onClick` réel posé sur chaque bouton, puis INVOQUÉ : aucune bibliothèque
 * de DOM n'est nécessaire pour prouver le CÂBLAGE.
 */

const episode = (id: string, messageIds: readonly string[]): ConversationEpisode => ({
  id,
  start: 1_700_000_000_000,
  end: 1_700_000_060_000,
  messageIds,
  participantIds: ['u1'],
  deterministicTitle: `Aujourd'hui · ${messageIds.length} messages`,
  agentTitle: null,
});

const rampEntry = (id: string, evidenceMessageIds: readonly string[]): FaceRampEntry => ({
  id,
  displayName: 'Amina',
  avatarUrl: null,
  colorHex: '#31B6BA',
  presence: 'online',
  awaitingCount: evidenceMessageIds.length,
  needScore: 12.5,
  evidenceMessageIds,
});

const digest = (overrides: Partial<DeterministicConversationDigest> = {}): DeterministicConversationDigest => ({
  messageCount: 0,
  participantCount: 0,
  start: null,
  end: null,
  topSenders: [],
  languages: [],
  media: { images: 0, videos: 0, audios: 0, files: 0, locations: 0, links: 0 },
  awaitingYou: [],
  episodes: [],
  isComplete: true,
  ...overrides,
});

const noop = () => {};

type Tree =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { readonly type: unknown; readonly props: Record<string, any> } | string | number | null | boolean;
type Expanded = { readonly props: Record<string, unknown> };

/**
 * DÉPLIE un composant FONCTION en son arbre rendu — sans bibliothèque de
 * DOM : un élément React/Preact est un objet `{ type, props }`, et un
 * `type` FONCTION est le composant lui-même, jamais encore appelé. On le
 * rappelle donc récursivement, exactement ce qu'un renderer ferait.
 */
function expand(node: Tree): Expanded | null {
  if (node === null || typeof node !== 'object') return null;
  if (typeof node.type === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return expand((node.type as (props: unknown) => Tree)(node.props) as Tree);
  }
  return node as Expanded;
}

function findAll(node: Tree, predicate: (n: Expanded) => boolean): Expanded[] {
  const n = expand(node);
  if (n === null) return [];
  const results: Expanded[] = [];
  if (predicate(n)) results.push(n);
  const children = n.props['children'];
  const flat = Array.isArray(children) ? children : children === undefined ? [] : [children];
  for (const child of flat) results.push(...findAll(child as Tree, predicate));
  return results;
}

describe('LivingSummary — en-tête et ligne partielle', () => {
  test('renders header counts and partial line only when incomplete', () => {
    const incomplete = renderToStaticMarkup(
      <LivingSummary
        model={{ digest: digest({ messageCount: 30, participantCount: 3, isComplete: false }), faceRamp: [] }}
        agentSummary={null}
        showsSkeleton={false}
        isComplete={false}
        onReplyToPerson={noop}
        onOpenEpisode={noop}
        onResumeThread={noop}
      />,
    );
    expect(incomplete).toContain('30 messages · 3 personnes');
    expect(incomplete).toContain('Sur les 30 derniers messages');

    const complete = renderToStaticMarkup(
      <LivingSummary
        model={{ digest: digest({ messageCount: 30, participantCount: 3, isComplete: true }), faceRamp: [] }}
        agentSummary={null}
        showsSkeleton={false}
        isComplete={true}
        onReplyToPerson={noop}
        onOpenEpisode={noop}
        onResumeThread={noop}
      />,
    );
    expect(complete).not.toContain('derniers messages');
  });

  test('renders skeleton with a11y label when model says so', () => {
    const html = renderToStaticMarkup(
      <LivingSummary
        model={{ digest: digest(), faceRamp: [] }}
        agentSummary={null}
        showsSkeleton={true}
        isComplete={true}
        onReplyToPerson={noop}
        onOpenEpisode={noop}
        onResumeThread={noop}
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Chargement du résumé"');
    expect(html).not.toContain('Résumé Vivant');
  });
});

describe('LivingSummary — la rampe et les épisodes', () => {
  test('renders ramp entries in ranking order with badge = awaitingCount (jamais needScore dans le DOM)', () => {
    const entries = [rampEntry('u-karim', ['q1', 'q2', 'q3']), rampEntry('u-adam', ['m1'])];
    const html = renderToStaticMarkup(
      <LivingSummary
        model={{ digest: digest({ messageCount: 1, episodes: [] }), faceRamp: entries }}
        agentSummary={null}
        showsSkeleton={false}
        isComplete={true}
        onReplyToPerson={noop}
        onOpenEpisode={noop}
        onResumeThread={noop}
      />,
    );
    const karimIndex = html.indexOf('data-user="u-karim"');
    const adamIndex = html.indexOf('data-user="u-adam"');
    expect(karimIndex).toBeGreaterThan(-1);
    expect(adamIndex).toBeGreaterThan(karimIndex);
    expect(html).not.toContain(String(entries[0]?.needScore));
  });

  test('renders episodes as buttons labelled by displayTitle with hint', () => {
    const html = renderToStaticMarkup(
      <LivingSummary
        model={{ digest: digest({ messageCount: 4, episodes: [episode('e1', ['m1', 'm2', 'm3', 'm4'])] }), faceRamp: [] }}
        agentSummary={null}
        showsSkeleton={false}
        isComplete={true}
        onReplyToPerson={noop}
        onOpenEpisode={noop}
        onResumeThread={noop}
      />,
    );
    expect(html).toContain('4 messages');
    expect(html).toContain('data-episode-id="e1"');
    expect(html).toContain('aria-describedby="episode-hint"');
    expect(html).toContain('Ouvre les messages de cet épisode');
  });

  test('renders agent panel only when agentSummary is present', () => {
    const withAgent = renderToStaticMarkup(
      <LivingSummary
        model={{ digest: digest({ messageCount: 1 }), faceRamp: [] }}
        agentSummary={{ text: 'Vue d’ensemble.' }}
        showsSkeleton={false}
        isComplete={true}
        onReplyToPerson={noop}
        onOpenEpisode={noop}
        onResumeThread={noop}
      />,
    );
    expect(withAgent).toContain('aria-label="Vue d');
    expect(withAgent).toContain('Vue d’ensemble.');
    const without = renderToStaticMarkup(
      <LivingSummary
        model={{ digest: digest({ messageCount: 1 }), faceRamp: [] }}
        agentSummary={null}
        showsSkeleton={false}
        isComplete={true}
        onReplyToPerson={noop}
        onOpenEpisode={noop}
        onResumeThread={noop}
      />,
    );
    expect(without).not.toContain('aria-label="Vue d');
  });
});

describe('LivingSummary — les trois sorties (témoin d’EFFET)', () => {
  test('the three exits call their callbacks with the right ids', () => {
    let repliedTo: FaceRampEntry | null = null;
    let openedEpisode: ConversationEpisode | null = null;
    let resumed = false;

    const entry = rampEntry('u-amina', ['m1']);
    const ep = episode('e1', ['m2', 'm3', 'm4', 'm5']);

    const tree = LivingSummary({
      model: { digest: digest({ messageCount: 5, episodes: [ep] }), faceRamp: [entry] },
      agentSummary: null,
      showsSkeleton: false,
      isComplete: true,
      onReplyToPerson: (e) => {
        repliedTo = e;
      },
      onOpenEpisode: (e) => {
        openedEpisode = e;
      },
      onResumeThread: () => {
        resumed = true;
      },
    }) as unknown as Tree;

    const faces = findAll(tree, (n) => 'data-face' in n.props);
    expect(faces).toHaveLength(1);
    (faces[0]?.props['onClick'] as () => void)();
    expect(repliedTo).toEqual(entry);

    const episodes = findAll(tree, (n) => 'data-episode' in n.props);
    expect(episodes).toHaveLength(1);
    (episodes[0]?.props['onClick'] as () => void)();
    expect(openedEpisode).toEqual(ep);

    const resumeButtons = findAll(
      tree,
      (n) => n.props['aria-label'] === 'Reprendre le fil, retourner à la conversation',
    );
    expect(resumeButtons).toHaveLength(1);
    (resumeButtons[0]?.props['onClick'] as () => void)();
    expect(resumed).toBe(true);
  });
});

describe('LivingSummary — le cadrage de la locale (rang du cadrage)', () => {
  test('every date-bearing node carries lang when the framing locale differs from the document', () => {
    const html = renderToStaticMarkup(
      <LivingSummary
        model={{ digest: digest({ messageCount: 2, episodes: [episode('e1', ['m1', 'm2'])] }), faceRamp: [] }}
        agentSummary={null}
        showsSkeleton={false}
        isComplete={true}
        onReplyToPerson={noop}
        onOpenEpisode={noop}
        onResumeThread={noop}
        lang="en"
      />,
    );
    expect(html).toContain('lang="en"');
  });

  test('sans lang fourni, aucun attribut lang n’est posé', () => {
    const html = renderToStaticMarkup(
      <LivingSummary
        model={{ digest: digest({ messageCount: 2, episodes: [episode('e1', ['m1', 'm2'])] }), faceRamp: [] }}
        agentSummary={null}
        showsSkeleton={false}
        isComplete={true}
        onReplyToPerson={noop}
        onOpenEpisode={noop}
        onResumeThread={noop}
      />,
    );
    expect(html).not.toContain('lang=');
  });
});

describe('LivingSummary — le chevron RTL (garde de source)', () => {
  test('the forward chevron is the caretLeft glyph flipped by the glyph-forward class, never a right-named glyph', () => {
    const html = renderToStaticMarkup(
      <LivingSummary
        model={{ digest: digest({ messageCount: 1, episodes: [episode('e1', ['m1'])] }), faceRamp: [] }}
        agentSummary={null}
        showsSkeleton={false}
        isComplete={true}
        onReplyToPerson={noop}
        onOpenEpisode={noop}
        onResumeThread={noop}
      />,
    );
    expect(html).toContain('glyph-forward');
    expect(html).not.toMatch(/caretRight|chevronRight|rotate\(/);
  });
});
