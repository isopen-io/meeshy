/**
 * Q-142 / réserve REV-4ter **R5-7** — `nested-interactive`, la preuve
 * STRUCTURELLE que la violation ne peut plus revenir en silence.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE LA RÉSERVE DISAIT, ET POURQUOI ELLE BLOQUAIT L'ACTIVATION V6
 * ═══════════════════════════════════════════════════════════════════════════
 * REV-4ter a classé R5-7 « **condition d'activation V6** ». Le défaut : la
 * RACINE du rang Lentille portait `role="button" tabIndex={0}` + `aria-label`
 * + `onClick`/`onKeyDown`, et TROIS contrôles réels vivaient DEDANS —
 * l'affordance d'avatar (`<a>`/`<button>`, behaviour-matrix:L12), l'encoche
 * de la focus card (`<button>`, WL-108) et le ⋮ de `LentillePeek`
 * (`<button>`, WL-106). Un contrôle dans un contrôle : ce que le pattern
 * WAI-ARIA interdit, ce que `nested-interactive` détecte, et ce que DEUX
 * suites d'audit devaient désactiver pour rester vertes
 * (`__tests__/a11y/lentille-list.a11y.test.tsx`,
 * `__tests__/a11y/reading-mode-menu.a11y.test.tsx`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE REMÈDE, ET LA RAISON DE CE FICHIER
 * ═══════════════════════════════════════════════════════════════════════════
 * Patron « card action » : la racine redevient un conteneur MUET, et
 * l'ouverture de la conversation vit dans un `<button>` FRÈRE, positionné,
 * qui couvre la boîte du rang (`lentille-row-open`).
 *
 * Les deux suites axe prouvent que la violation a disparu. Elles ne prouvent
 * PAS pourquoi. Ce fichier fige l'invariant qui la rend impossible — **aucun
 * ancêtre interactif au-dessus des trois contrôles** — et les propriétés que
 * la restructuration devait préserver et pouvait casser sans bruit :
 * l'ORDRE et le NOMBRE des arrêts de tabulation.
 *
 * Témoin de discrimination inclus (dernier `it`) : la garde d'ancêtre rougit
 * bien sur la structure D'AVANT, rejouée à la main. Sans lui, une garde qui
 * cherche un ancêtre interactif et n'en trouve jamais serait indistinguable
 * d'une garde qui ne cherche rien.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className, style }: any) => (
    <div data-testid="avatar" className={className} style={style}>{children}</div>
  ),
  AvatarFallback: ({ children }: any) => <div data-testid="avatar-fallback">{children}</div>,
  AvatarImage: ({ src }: any) => (src ? <img data-testid="avatar-image" src={src} alt="" /> : null),
}));

jest.mock('@/components/ui/online-indicator', () => ({
  OnlineIndicator: () => null,
}));

jest.mock('@/stores/user-store', () => ({
  useUserById: jest.fn(() => null),
  useUserStatusTick: jest.fn(),
}));

jest.mock('@/hooks/use-resolved-theme', () => ({ useResolvedTheme: () => 'light' }));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, isLoading: false }),
}));

import { LentilleRow } from '../LentilleRow';

const t = (key: string, paramsOrFallback?: Record<string, unknown> | string): string => {
  if (typeof paramsOrFallback === 'string') return paramsOrFallback;
  if (key === 'lentille.a11y.openProfile') return `Voir le profil de ${(paramsOrFallback as any)?.name}`;
  if (key === 'lentille.a11y.openConversationInfo') return `Infos de ${(paramsOrFallback as any)?.name}`;
  return key;
};

const makeUser = (): User =>
  ({ id: 'user-1', username: 'alice', displayName: 'Alice', email: 'a@a.com', role: 'USER' } as unknown as User);

/**
 * Conversation DIRECTE : c'est la géométrie qui monte les TROIS contrôles à
 * la fois — l'avatar y a une cible (`profile`, L12), et `isSelected` fait
 * porter la focus card donc son encoche (L11). En groupe sans
 * `onShowDetails`, l'avatar n'est PAS une affordance (« aucun contrôle inerte
 * n'est rendu ») et le rang n'aurait que deux contrôles : le cas riche est
 * celui qui doit être gardé.
 */
const makeDirectConversation = (): Conversation =>
  ({
    id: 'conv-1',
    type: 'direct',
    title: 'Bob',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [
      { userId: 'user-1', user: { id: 'user-1', username: 'alice', displayName: 'Alice' } },
      { userId: 'user-2', user: { id: 'user-2', username: 'bob', displayName: 'Bob' } },
    ],
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    unreadCount: 0,
  }) as unknown as Conversation;

const renderRichRow = () =>
  render(
    <LentilleRow
      conversation={makeDirectConversation()}
      currentUser={makeUser()}
      isSelected
      onSelect={jest.fn()}
      t={t}
    />
  );

/** Ce qu'axe appelle « interactif » pour `nested-interactive` : un rôle de widget focusable. */
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'menuitem',
  'radio',
  'switch',
  'tab',
  'textbox',
  'combobox',
]);

const isInteractive = (el: Element): boolean => {
  const tag = el.tagName.toLowerCase();
  if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea') return true;
  const role = el.getAttribute('role');
  if (role && INTERACTIVE_ROLES.has(role)) return true;
  return el.getAttribute('tabindex') !== null;
};

/** Le premier ancêtre interactif STRICT, en s'arrêtant à la racine du rang incluse. */
const interactiveAncestorWithin = (el: Element, root: Element): Element | null => {
  let cursor = el.parentElement;
  while (cursor) {
    if (isInteractive(cursor)) return cursor;
    if (cursor === root) return null;
    cursor = cursor.parentElement;
  }
  return null;
};

describe('Q-142/R5-7 — le rang Lentille n’imbrique plus aucun contrôle', () => {
  it('les TROIS contrôles n’ont AUCUN ancêtre interactif — la racine du rang comprise', () => {
    renderRichRow();
    const root = screen.getByTestId('lentille-row');

    const controls = [
      screen.getByTestId('lentille-row-avatar-affordance'),
      screen.getByTestId('lentille-focus-card-notch'),
      screen.getByTestId('lentille-peek-more-trigger'),
    ];

    for (const control of controls) {
      expect(isInteractive(control)).toBe(true);
      expect(interactiveAncestorWithin(control, root)).toBeNull();
    }
  });

  it('la couverture est un FRÈRE des trois contrôles, jamais leur ancêtre', () => {
    renderRichRow();
    const cover = screen.getByTestId('lentille-row-open');

    for (const testId of [
      'lentille-row-avatar-affordance',
      'lentille-focus-card-notch',
      'lentille-peek-more-trigger',
    ]) {
      expect(cover.contains(screen.getByTestId(testId))).toBe(false);
    }
  });

  it('QUATRE arrêts de tabulation DISTINCTS, dans l’ordre d’avant : couverture → avatar → encoche → ⋮', () => {
    const { container } = renderRichRow();
    const root = screen.getByTestId('lentille-row');

    // Ordre du DOM = ordre de tabulation (aucun `tabindex` positif nulle part
    // dans ce rang — vérifié juste après).
    const focusables = Array.from(
      root.querySelectorAll('a[href], button, [tabindex]')
    ) as HTMLElement[];

    expect(focusables.map((el) => el.getAttribute('data-testid'))).toEqual([
      'lentille-row-open',
      'lentille-row-avatar-affordance',
      'lentille-focus-card-notch',
      'lentille-peek-more-trigger',
    ]);

    // Aucun `tabindex` positif : sans cette clause, l'égalité ci-dessus
    // décrirait le DOM et non l'ordre RÉEL de tabulation.
    for (const el of focusables) {
      const value = el.getAttribute('tabindex');
      expect(value === null || Number(value) <= 0).toBe(true);
    }

    // Quatre arrêts qui prennent RÉELLEMENT le focus, chacun le sien.
    const focused = new Set<Element>();
    for (const el of focusables) {
      el.focus();
      expect(container.ownerDocument.activeElement).toBe(el);
      focused.add(el);
    }
    expect(focused.size).toBe(4);
  });

  it('la couverture porte le label L16 et l’`aria-current` de la sélection — la racine n’en porte plus aucun', () => {
    renderRichRow();
    const root = screen.getByTestId('lentille-row');
    const cover = screen.getByTestId('lentille-row-open');

    expect(cover).toHaveAttribute('aria-current', 'true');
    expect((cover.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0);

    // Un `aria-label` sur un `div` SANS rôle serait à son tour une violation
    // (`aria-prohibited-attr`) : le déplacement devait être total.
    expect(root).not.toHaveAttribute('aria-label');
    expect(root).not.toHaveAttribute('aria-current');
    expect(root).not.toHaveAttribute('role');
  });

  /**
   * DISCRIMINATION — la garde d'ancêtre rougit sur la structure D'AVANT.
   * Rejouée à la main (un `role="button" tabIndex={0}` englobant un
   * `<button>`), elle DOIT trouver l'ancêtre interactif. Sans ce cas, une
   * garde qui ne trouve jamais rien passerait pour une garde qui prouve.
   */
  it('discrimination — la structure d’AVANT (contrôle DANS un `role="button"`) est bien attrapée', () => {
    render(
      <div role="button" tabIndex={0} data-testid="legacy-row">
        <div>
          <button type="button" data-testid="legacy-inner">⋮</button>
        </div>
      </div>
    );

    const legacyRoot = screen.getByTestId('legacy-row');
    const inner = screen.getByTestId('legacy-inner');
    expect(interactiveAncestorWithin(inner, legacyRoot)).toBe(legacyRoot);
  });
});
