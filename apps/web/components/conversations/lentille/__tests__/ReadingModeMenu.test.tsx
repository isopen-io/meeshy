/**
 * WL-107 (LWS-11) — `ReadingModeMenu` : Rivière toujours présente, raison
 * réelle par la trifurcation amendée (S1), filtrage du catalogue, écriture
 * déléguée à `onSelect` (le caller branche le store).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { resolveCapabilities } from '@meeshy/shared/utils/reading-modes';
import type { ReadingModePreference } from '@meeshy/shared/types/reading-modes';

jest.mock('@/components/ui/dropdown-menu', () => {
  const ReactLib = require('react');
  const Ctx = ReactLib.createContext<{ open: boolean; onOpenChange: (open: boolean) => void }>({
    open: false,
    onOpenChange: () => {},
  });

  return {
    DropdownMenu: ({ children, open, onOpenChange }: any) => (
      <Ctx.Provider value={{ open: !!open, onOpenChange: onOpenChange ?? (() => {}) }}>
        <div data-testid="dropdown-menu">{children}</div>
      </Ctx.Provider>
    ),
    DropdownMenuTrigger: ReactLib.forwardRef(({ children }: any, ref: any) => {
      const { onOpenChange } = ReactLib.useContext(Ctx);
      return ReactLib.cloneElement(children, {
        ref,
        onClick: (event: React.MouseEvent) => {
          children.props.onClick?.(event);
          onOpenChange(true);
        },
      });
    }),
    DropdownMenuContent: ({ children, ...rest }: any) => {
      const { open } = ReactLib.useContext(Ctx);
      return open ? (
        <div data-testid="dropdown-content" {...rest}>
          {children}
        </div>
      ) : null;
    },
    DropdownMenuLabel: ({ children }: any) => <div data-testid="dropdown-label">{children}</div>,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuRadioGroup: ({ children, value, onValueChange }: any) =>
      ReactLib.Children.map(children, (child: any) =>
        ReactLib.cloneElement(child, { __groupValue: value, __onValueChange: onValueChange })
      ),
    DropdownMenuRadioItem: ({ children, value, disabled, __groupValue, __onValueChange, ...rest }: any) => (
      <button
        type="button"
        role="menuitemradio"
        aria-checked={__groupValue === value}
        disabled={disabled}
        onClick={() => !disabled && __onValueChange?.(value)}
        {...rest}
      >
        {children}
      </button>
    ),
  };
});

import { ReadingModeMenu } from '../ReadingModeMenu';

const t = (key: string, params?: Record<string, unknown>) => {
  const dict: Record<string, string> = {
    'lentille.modes.title': 'Mode de lecture',
    'lentille.modes.auto': 'Auto',
    'lentille.modes.focal': 'Focal',
    'lentille.modes.script': 'Script',
    'lentille.modes.resume': 'Résumé',
    'lentille.modes.riviere': 'Rivière',
    'lentille.modes.river.never': 'jamais en conversation directe',
    'lentille.modes.river.thresholdOnly': `s'ouvrira à ${(params as any)?.threshold} personnes actives`,
    'lentille.modes.river.reason': `s'ouvrira à ${(params as any)?.threshold} personnes actives — ${(params as any)?.current} aujourd'hui`,
  };
  return dict[key] ?? key;
};

function renderMenu(overrides: {
  currentPreference?: ReadingModePreference;
  conversationType?: 'direct' | 'group' | 'public' | 'global' | 'broadcast';
  activeParticipantCount?: number | null;
  isRiverFlagEnabled?: boolean;
  isAnonymous?: boolean;
  onSelect?: (pref: ReadingModePreference) => void;
} = {}) {
  const capabilities = resolveCapabilities({
    identity: { isAnonymous: overrides.isAnonymous ?? false },
    isFlagEnabled: true,
    conversationType: overrides.conversationType ?? 'group',
    activeParticipantCount: overrides.activeParticipantCount ?? null,
    isRiverFlagEnabled: overrides.isRiverFlagEnabled ?? true,
  });

  const onSelect = overrides.onSelect ?? jest.fn();

  render(
    <ReadingModeMenu
      trigger={<button type="button">ouvrir</button>}
      currentPreference={overrides.currentPreference ?? 'auto'}
      capabilities={capabilities}
      onSelect={onSelect}
      t={t}
      open
      onOpenChange={() => {}}
    />
  );

  return { onSelect };
}

describe('ReadingModeMenu — trois entrées de contrat, une préférence (WL-106/LWS-11)', () => {
  it('affiche Auto/Focal/Script/Résumé/Rivière, dans cet ordre', () => {
    renderMenu();
    const items = screen.getAllByRole('menuitemradio').map((el) => el.textContent);
    expect(items[0]).toContain('Auto');
    expect(items[1]).toContain('Focal');
    expect(items[2]).toContain('Script');
    expect(items[3]).toContain('Résumé');
    expect(items[4]).toContain('Rivière');
  });

  it('Rivière est TOUJOURS présente même quand le drapeau riviere_mode est éteint', () => {
    renderMenu({ isRiverFlagEnabled: false });
    expect(screen.getByTestId('reading-mode-item-riviere')).toBeInTheDocument();
  });

  it('Rivière grisée « jamais en conversation directe » sur une conversation direct (neverEligible)', () => {
    renderMenu({ conversationType: 'direct', activeParticipantCount: 8 });
    const riverItem = screen.getByTestId('reading-mode-item-riviere');
    expect(riverItem).toBeDisabled();
    expect(screen.getByTestId('reading-mode-river-reason')).toHaveTextContent('jamais en conversation directe');
  });

  it('Rivière grisée avec le SEUL seuil quand le compte de participants actifs est INCONNU (belowThreshold, current: null)', () => {
    renderMenu({ conversationType: 'group', activeParticipantCount: null });
    const riverItem = screen.getByTestId('reading-mode-item-riviere');
    expect(riverItem).toBeDisabled();
    const reason = screen.getByTestId('reading-mode-river-reason');
    expect(reason).toHaveTextContent("s'ouvrira à 5 personnes actives");
    // Jamais un "0" fabriqué : le texte "aujourd'hui" (formule à deux nombres) n'apparaît pas.
    expect(reason.textContent).not.toMatch(/aujourd'hui/);
  });

  it('Rivière grisée avec la formule à deux nombres quand le compte est CONNU et sous le seuil (belowThreshold, current: number)', () => {
    renderMenu({ conversationType: 'group', activeParticipantCount: 2 });
    const reason = screen.getByTestId('reading-mode-river-reason');
    expect(reason).toHaveTextContent("s'ouvrira à 5 personnes actives — 2 aujourd'hui");
  });

  it('Rivière SÉLECTIONNABLE (non désactivée, aucune raison affichée) quand éligible', () => {
    renderMenu({ conversationType: 'group', activeParticipantCount: 5, isRiverFlagEnabled: true });
    const riverItem = screen.getByTestId('reading-mode-item-riviere');
    expect(riverItem).not.toBeDisabled();
    expect(screen.queryByTestId('reading-mode-river-reason')).not.toBeInTheDocument();
  });

  it('masque Résumé pour un invité anonyme (catalogue borné, comme resolveOrchestratorDecision)', () => {
    renderMenu({ isAnonymous: true });
    expect(screen.queryByTestId('reading-mode-item-resume')).not.toBeInTheDocument();
    // Focal/Script restent proposés à l'invité.
    expect(screen.getByTestId('reading-mode-item-focal')).toBeInTheDocument();
    expect(screen.getByTestId('reading-mode-item-script')).toBeInTheDocument();
  });

  it('sélectionner une entrée appelle onSelect avec la préférence choisie — UNE écriture, quel que soit le déclencheur', () => {
    const { onSelect } = renderMenu();
    fireEvent.click(screen.getByTestId('reading-mode-item-focal'));
    expect(onSelect).toHaveBeenCalledWith('focal');
  });

  it("ne rappelle jamais onSelect sur un clic sur l'entrée Rivière désactivée", () => {
    const { onSelect } = renderMenu({ conversationType: 'direct' });
    fireEvent.click(screen.getByTestId('reading-mode-item-riviere'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marque la préférence courante comme cochée (aria-checked)', () => {
    renderMenu({ currentPreference: 'script' });
    expect(screen.getByTestId('reading-mode-item-script')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('reading-mode-item-focal')).toHaveAttribute('aria-checked', 'false');
  });
});
