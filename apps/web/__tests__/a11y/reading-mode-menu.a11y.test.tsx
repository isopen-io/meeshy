/**
 * V4ter/axe — audit axe-core du menu de mode OUVERT (`ReadingModeMenu`),
 * monté via `LentillePeek` — le point d'entrée réel de production (le clic
 * droit / ⋮ au survol du rang, WL-106/LWS-11), jamais `ReadingModeMenu`
 * isolé, et jamais un double du dropdown-menu Radix : un double aurait sa
 * PROPRE accessibilité (ou son absence), pas celle de la production —
 * `ReadingModeMenu.test.tsx`/`LentillePeek.test.tsx` en montent un pour
 * piloter l'ouverture depuis un `Event` synthétique (jsdom n'implémente pas
 * `PointerEvent`, cf. leur note d'environnement), mais un AUDIT d'accessibilité
 * doit inspecter le VRAI DOM Radix, pas son substitut.
 *
 * RE-PROUVÉ (sondage manuel avant d'écrire ce fichier) : `@radix-ui/
 * react-dropdown-menu` s'ouvre correctement sous jsdom quand l'ouverture
 * passe par un événement DOM réel que jsdom sait émettre — `keydown`
 * Entrée sur le ⋮ (le déclencheur Radix n'écoute QUE `onPointerDown`/
 * `onKeyDown`, jamais `onClick` — lu en source, détail plus bas) ou
 * `contextMenu`/`click` sur les chemins pilotés directement par
 * `LentillePeek` (`peekOpen`, hors Trigger Radix). Jamais le `PointerEvent`
 * de bas niveau que `LentillePeek.test.tsx` doit contourner pour le
 * minuteur d'appui long — le menu se porte dans le DOM du `container` de
 * RTL (Radix ne le sort PAS dans un portail séparé de `document.body` :
 * `container` EST déjà un enfant de `document.body`, donc `axe(container)`
 * voit tout).
 *
 * Mocks des feuilles REPRIS TELS QUELS de `LentilleRow.test.tsx` (Avatar,
 * OnlineIndicator, user-store, use-resolved-theme, use-i18n) — même recette
 * connue-fonctionnelle sous jsdom. AUCUN mock du dropdown-menu, AUCUN mock
 * des magasins (préférences de lecture/de conversation) : ce sont les VRAIS
 * `@radix-ui/react-dropdown-menu` et les VRAIS magasins zustand qui rendent
 * ici — `LentillePeek`/`ReadingModeMenu` ne sont ni modifiés ni doublés,
 * seulement montés (consigne V4ter/axe).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import type { Conversation } from '@meeshy/shared/types';

expect.extend(toHaveNoViolations);

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className, style }: any) => (
    <div data-testid="avatar" className={className} style={style}>{children}</div>
  ),
  AvatarFallback: ({ children }: any) => <div data-testid="avatar-fallback">{children}</div>,
  AvatarImage: ({ src }: any) => (src ? <img data-testid="avatar-image" src={src} alt="" /> : null),
}));

jest.mock('@/components/ui/online-indicator', () => ({
  OnlineIndicator: ({ isOnline, status, className }: any) =>
    status === 'offline' ? null : (
      <div data-testid="online-indicator" data-status={status} className={className} />
    ),
}));

jest.mock('@/stores/user-store', () => ({
  useUserById: jest.fn(() => null),
  useUserStatusTick: jest.fn(),
}));

jest.mock('@/hooks/use-resolved-theme', () => ({
  useResolvedTheme: () => 'light',
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, isLoading: false }),
}));

import { LentillePeek } from '@/components/conversations/lentille/LentillePeek';

const t = (key: string) => key;

const makeConversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'conv-1',
    type: 'group',
    title: 'Équipe produit',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-06-01'),
    ...overrides,
  }) as unknown as Conversation;

/**
 * FINDING V4ter/axe — `nested-interactive` : **SOLDÉ le 2026-08-17 (Q-142,
 * réserve REV-4ter R5-7).**
 *
 * Ce fichier désactivait la règle pour la MÊME racine que
 * `__tests__/a11y/lentille-list.a11y.test.tsx` : le contexte de rang
 * reproduit ici était un `<div role="button" tabIndex={0} onClick>`
 * englobant `LentillePeek`, donc englobant le ⋮.
 *
 * DEUX choses ont changé, et il faut nommer les deux. (1) La désactivation a
 * été retirée. (2) Le contexte reproduit ci-dessous a été RÉALIGNÉ sur la
 * production : `LentilleRow` ne pose plus aucun rôle sur sa racine, et
 * l'ouverture de la conversation est une COUVERTURE (`<button>` absolu,
 * `lentille-row-open`) rendue comme PREMIER enfant de `LentillePeek` — donc
 * un FRÈRE du ⋮, pas son ancêtre. Un harnais resté sur l'ancienne forme
 * aurait continué d'auditer une structure qui n'existe plus.
 *
 * HONNÊTETÉ SUR LE RED. Contrairement à la suite de la liste, ce fichier-ci
 * était DÉJÀ vert le jour du retrait, AVANT tout correctif : les trois
 * témoins auditent le menu OUVERT, et Radix pose `aria-hidden` sur tout ce
 * qui l'entoure pendant ce temps — le rang englobant sortait donc de l'arbre
 * d'accessibilité, et axe n'avait plus d'imbrication à voir. La
 * désactivation y était défensive, pas nécessaire. Le RED probant de R5-7
 * est celui de la suite de la liste (5 violations, une par rang).
 */
function renderRowWithMoreTrigger(peekProps: Partial<React.ComponentProps<typeof LentillePeek>> = {}) {
  return render(
    <div data-testid="row-root" className="relative">
      <LentillePeek conversation={makeConversation()} t={t} {...peekProps}>
        <button
          type="button"
          data-testid="lentille-row-open"
          aria-label="Ouvrir Équipe produit"
          onClick={jest.fn()}
          className="absolute inset-0 z-10"
        />
        <span>contenu du rang</span>
      </LentillePeek>
    </div>
  );
}

describe('Audit axe — menu de mode ouvert (ReadingModeMenu via LentillePeek)', () => {
  it('aucune violation — ⋮ ouvert au clavier (Entrée), catalogue de modes + six actions historiques ouverts', async () => {
    /**
     * RE-PROUVÉ (sondage manuel) : le déclencheur `DropdownMenuTrigger` de
     * Radix (`@radix-ui/react-dropdown-menu`, lu en source) n'ouvre le menu
     * QUE sur `onPointerDown` ou `onKeyDown` (Entrée/Espace/ArrowDown) —
     * JAMAIS sur `onClick`. Comme `PointerEvent` n'existe pas sous jsdom
     * (même constat que `LentillePeek.test.tsx`), ce témoin ouvre le menu
     * comme un LECTEUR AU CLAVIER le ferait réellement : Entrée sur le ⋮,
     * exactement le chemin qu'un utilisateur non-pointeur emprunte en
     * production — une preuve d'opérabilité clavier, pas une esquive.
     */
    const { container } = renderRowWithMoreTrigger();
    fireEvent.keyDown(screen.getByTestId('lentille-peek-more-trigger'), { key: 'Enter' });
    expect(screen.getByTestId('lentille-peek-menu')).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('aucune violation — ouvert par clic droit (aperçu), même instance de menu', async () => {
    const { container } = renderRowWithMoreTrigger();
    fireEvent.contextMenu(screen.getByTestId('lentille-peek'));
    expect(screen.getByTestId('lentille-peek-menu')).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("aucune violation — ouvert par l'encoche de la focus card, sur le rang ÉLU", async () => {
    const { container } = renderRowWithMoreTrigger({ isFocused: true });
    fireEvent.click(screen.getByTestId('lentille-focus-card-notch'));
    expect(screen.getByTestId('lentille-peek-menu')).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
