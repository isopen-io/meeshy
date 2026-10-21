import { readFileSync } from 'node:fs';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Conversation, Message, Participant } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { SPLIT_QUERY } from '@/lib/view/split-query';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { FocalRow } from './focal-row';
import { ThreadComposerChrome } from './thread-composer-chrome';
import { ThreadHeader } from './thread-header';

/**
 * SUR ORDINATEUR, LE FIL EST PLUS VIVANT SANS ÊTRE CHARGÉ (#10101) — retour
 * porteur du 2026-10-11 : « le chat n'a pas été revu pour être moins terne »,
 * en compte comme en invité. Mesuré sur les captures d'avant (1280 et 1600 px,
 * deux schémas) : l'en-tête replié du téléphone laissait une bande de 900 px
 * sans le nom de la conversation, la bande pleine largeur du composeur
 * recouvrait la lueur d'accent de #10004, aucune rangée ne réagissait au
 * pointeur, et le vocal, le fichier et la citation couraient sur toute la
 * colonne.
 *
 * Tout ce qui change ici ne vaut qu'à partir de 1024 px (la règle du cadre
 * côte à côte, `lib/view/split-query.ts`) ou pour un pointeur fin : le
 * téléphone est exactement celui d'avant.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let originalMatchMedia: typeof window.matchMedia;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/c/c-groupe' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  originalMatchMedia = window.matchMedia;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  window.matchMedia = originalMatchMedia;
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

const screenOf = (wide: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: query === SPLIT_QUERY ? wide : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
};

const mount = (node: ReactNode): HTMLDivElement => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
};

const participant = (id: string, name: string): Participant =>
  ({
    id: `p-${id}`,
    conversationId: 'c-groupe',
    userId: `u-${id}`,
    type: 'user',
    displayName: name,
    role: 'member',
    language: 'fr',
    isActive: true,
    isOnline: false,
    joinedAt: new Date('2026-01-01'),
    user: { id: `u-${id}`, username: id, displayName: name },
  }) as Participant;

const GROUP = {
  id: 'c-groupe',
  type: 'group',
  title: 'Équipe Lyon',
  status: 'active',
  visibility: 'private',
  isActive: true,
  memberCount: 12,
  participants: [participant('nour', 'Nour Haddad'), participant('moi', 'Moi Même')],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  unreadCount: 0,
} as unknown as Conversation;

const header = (expanded: boolean) => (
  <ThreadHeader
    title="Équipe Lyon"
    accent="#0ea5e9"
    conversation={GROUP}
    viewerId="u-moi"
    group
    otherUnread={0}
    expanded={expanded}
    onToggleExpanded={() => {}}
    onOpenDetails={() => {}}
    currentRowTitle=""
    isAuto
    readingMenuRows={[]}
    onSelectReadingMode={() => {}}
    onResetReadingModeToAuto={() => {}}
  />
);

const searchOf = (el: HTMLElement) => el.querySelector('button[aria-label="Rechercher dans la conversation"]');

describe('l’en-tête du fil sur ordinateur dit où l’on est', () => {
  test('au repos, dès 1024 px : le nom de la conversation, son sous-titre ET ses actions', () => {
    screenOf(true);
    const el = mount(header(false));
    expect(el.querySelector('h1')?.textContent).toBe('Équipe Lyon');
    expect(el.textContent).toContain('12 participants');
    expect(searchOf(el)).not.toBeNull();
    expect(el.querySelector('button[aria-label="Déplier l’en-tête"]')).not.toBeNull();
  });

  test('déplié sur ordinateur, les actions restent : l’en-tête n’a plus à choisir entre identité et gestes', () => {
    screenOf(true);
    const el = mount(header(true));
    expect(el.querySelector('h1')?.textContent).toBe('Équipe Lyon');
    expect(searchOf(el)).not.toBeNull();
    expect(el.querySelector('button[aria-label="Replier l’en-tête"]')).not.toBeNull();
  });

  test('au téléphone, rien ne change : replié, l’en-tête ne porte que ses actions ; déplié, que son identité', () => {
    screenOf(false);
    const rest = mount(header(false));
    expect(rest.querySelector('h1')).toBeNull();
    expect(searchOf(rest)).not.toBeNull();
    act(() => root?.unmount());
    const open = mount(header(true));
    expect(open.querySelector('h1')?.textContent).toBe('Équipe Lyon');
    expect(searchOf(open)).toBeNull();
  });
});

describe('le composeur se pose dans la colonne sur ordinateur', () => {
  const chrome = () => (
    <ThreadComposerChrome>
      <div data-composer />
    </ThreadComposerChrome>
  );

  test('au téléphone, la bande entière porte le verre, comme avant', () => {
    screenOf(false);
    const band = mount(chrome()).querySelector<HTMLElement>('.thread-composer-chrome')!;
    expect(band.classList.contains('glass-prominent')).toBe(true);
    expect(band.querySelector('.glass-prominent')).toBeNull();
  });

  test('sur ordinateur, le verre se pose sur la colonne seule : la lueur d’accent reste visible de part et d’autre', () => {
    screenOf(true);
    const band = mount(chrome()).querySelector<HTMLElement>('.thread-composer-chrome')!;
    expect(band.classList.contains('glass-prominent')).toBe(false);
    expect(band.classList.contains('thread-column')).toBe(true);
    const dock = band.querySelector<HTMLElement>('.thread-composer-dock');
    expect(dock?.classList.contains('glass-prominent')).toBe(true);
    expect(dock?.querySelector('[data-composer]')).not.toBeNull();
  });

  test('la structure ne change pas d’un gabarit à l’autre : franchir 1024 px ne remonte pas le composeur', () => {
    screenOf(false);
    const narrow = mount(chrome()).querySelector('.thread-composer-chrome > .thread-composer-dock > [data-composer]');
    expect(narrow).not.toBeNull();
    act(() => root?.unmount());
    screenOf(true);
    const wide = mount(chrome()).querySelector('.thread-composer-chrome > .thread-composer-dock > [data-composer]');
    expect(wide).not.toBeNull();
  });

  test('le composeur et le bandeau qui le remplace partagent cette pose', () => {
    const thread = readFileSync(new URL('../routes/thread.tsx', import.meta.url).pathname, 'utf8');
    const lock = readFileSync(new URL('./thread-write-lock.tsx', import.meta.url).pathname, 'utf8');
    expect(thread).toContain('<ThreadComposerChrome');
    expect(lock).toContain('<ThreadComposerChrome');
  });
});

const sheet = readFileSync(new URL('../styles/thread-desktop.css', import.meta.url).pathname, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const mediaBlock = (query: string): string => {
  const start = sheet.indexOf(`@media ${query} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = sheet.indexOf('{', start); i < sheet.length; i += 1) {
    if (sheet[i] === '{') depth += 1;
    if (sheet[i] === '}') depth -= 1;
    if (depth === 0) return sheet.slice(start, i + 1);
  }
  throw new Error(`bloc ${query} non fermé`);
};

const ruleIn = (block: string, selector: string): string => {
  const start = block.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return block.slice(start, block.indexOf('}', start));
};

const WIDE = '(min-width: 1024px)';
const POINTER = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';

describe('la feuille de bureau du fil', () => {
  test('aucune règle hors de ses deux requêtes, toutes deux bornées à 1024 px : le téléphone est inchangé, souris comprise', () => {
    const outside = [WIDE, POINTER].reduce((rest, query) => rest.replace(mediaBlock(query), ''), sheet);
    expect(outside.trim()).toBe('');
  });

  test('au survol d’un pointeur fin, la rangée plate s’éclaire à l’accent et dit son heure', () => {
    const block = mediaBlock(POINTER);
    expect(ruleIn(block, '[data-reading-mode]:hover')).toContain('var(--accent)');
    expect(ruleIn(block, '[data-reading-mode]:hover .focal-meta')).toContain('opacity: 1');
  });

  test('l’heure révélée ne passe pas sous l’icône « Répondre » : le contenu lui réserve son bord, au repos comme au survol', () => {
    expect(ruleIn(mediaBlock(POINTER), '[data-reading-mode] [data-row-content]')).toContain('padding-inline-end');
  });

  test('le vocal, le fichier et la citation gardent une largeur de carte au lieu de courir sur la colonne', () => {
    const block = mediaBlock(WIDE);
    expect(ruleIn(block, '[data-message] .voice-card')).toContain('max-width');
    expect(ruleIn(block, '[data-message] .file-card')).toContain('max-width');
    expect(ruleIn(block, '[data-reading-mode] [data-quote-card]')).toContain('max-width');
  });

  test('les séparateurs de jour et de non-lus tirent un filet de part et d’autre', () => {
    const block = mediaBlock(WIDE);
    expect(ruleIn(block, '[data-day-separator]::before,\n  [data-day-separator]::after')).toContain('var(--color-ios-hairline)');
    expect(ruleIn(block, '[data-unread-separator]::before,\n  [data-unread-separator]::after')).toContain('var(--color-ios-brand)');
  });

  /* LA FEUILLE PART AVEC LE CHUNK DU FIL, MAIS VAUT POUR TOUT LE DOCUMENT une
     fois chargée : une carte bornée sans portée bornait aussi le vocal et le
     fichier de la médiathèque de la conversation (`conversation-media-hub-items.tsx`,
     la même `Attachments` dans une rangée de feuille de 40rem). */
  test('la borne des cartes ne vaut que dans une rangée de message du fil', () => {
    const block = mediaBlock(WIDE);
    const bare = /(^\s*|[,{]\s*)\.(voice|file)-card\s*[{,]/m;
    expect(bare.test(block)).toBe(false);
  });

  test('le dock du composeur : le rayon du composeur (22), un filet et une lueur à l’accent', () => {
    const rule = ruleIn(mediaBlock(WIDE), '.thread-composer-dock');
    expect(rule).toContain('22px');
    expect(rule).toContain('var(--accent)');
  });
});

describe('la largeur de lecture d’une rangée plate', () => {
  const message = {
    id: 'm-long',
    conversationId: 'c-groupe',
    senderId: 'u-nour',
    content: 'Une phrase assez longue pour courir sur toute la colonne si rien ne la borne, ce qui arrive sur un grand écran.',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
    createdAt: new Date('2026-10-11T09:41:00.000Z'),
    sender: participant('nour', 'Nour Haddad'),
  } as unknown as Message;

  test('le corps de la rangée (citation, médias, texte) porte sa marque, la colonne méta reste à côté', () => {
    const html = renderToStaticMarkup(
      <FocalRow
        mode="script"
        place={{ message, head: true, tail: true, opensDay: null }}
        languages={['fr']}
        viewerId="u-moi"
        ephemeralDeadline={{ state: 'none' }}
        onJumpToMessage={() => {}}
        group
      />,
    );
    expect(html).toMatch(/data-row-content[^>]*><div data-row-body/);
  });

  test('sur ordinateur, une ligne qu’on relit sans perdre le retour (~85 caractères) au lieu de toute la colonne', () => {
    expect(ruleIn(mediaBlock(WIDE), '[data-reading-mode] [data-row-body]')).toContain('max-width: 42rem');
  });
});

describe('le séparateur de jour du fil porte sa marque', () => {
  test('la rangée qui ouvre un jour expose data-day-separator', () => {
    const modes = readFileSync(new URL('../routes/thread-modes.tsx', import.meta.url).pathname, 'utf8');
    expect(modes).toContain('data-day-separator');
  });
});
