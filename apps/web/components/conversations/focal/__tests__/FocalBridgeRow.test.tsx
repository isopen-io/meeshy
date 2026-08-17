/**
 * WF-112 — `FocalBridgeRow` (rangée pont/agent pointillée, C1/C2/C3).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';

jest.mock('@/hooks/use-resolved-theme', () => ({
  useResolvedTheme: () => 'light',
}));

const FR_BRIDGE_KEYS: Record<string, string> = {
  'lentille.bridge.authorsOne': '{name}',
  'lentille.bridge.messagesOne': '{count} message',
  'lentille.bridge.messagesOther': '{count} messages',
};

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const template = FR_BRIDGE_KEYS[key] ?? key;
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (_m: string, p: string) => String(params[p] ?? `{${p}}`));
    },
    isLoading: false,
  }),
}));

import { FocalBridgeRow } from '../FocalBridgeRow';

const ACCENT = '#3498DB';

describe('FocalBridgeRow — C2 : zéro donnée fabriquée', () => {
  it('bridge=null ⇒ ne rend RIEN (pas de placeholder inventé)', () => {
    const { container } = render(
      <FocalBridgeRow bridge={null} accentHex={ACCENT} preferredLanguages={['fr']} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('FocalBridgeRow — C1 : réutilise LentilleBridgeLine verbatim (aucune seconde loi de pont)', () => {
  it('affiche la phrase résolue par le pont déterministe', () => {
    const bridge: ConversationBridge = {
      kind: 'fallback',
      unreadCount: 3,
      suggestedMode: 'focal',
      data: { authors: ['Alice'], extraAuthorCount: 0, messageCount: 3 },
    };
    render(<FocalBridgeRow bridge={bridge} accentHex={ACCENT} preferredLanguages={['fr']} />);
    expect(screen.getByTestId('focal-bridge-row')).toHaveTextContent('Alice');
    expect(screen.getByTestId('lentille-bridge-line')).toBeInTheDocument();
  });
});

describe('FocalBridgeRow — cotes (bord pointillé 1.5, radius 14, §4.3)', () => {
  it('applique les tokens thread.agent.row.* — garde R15', () => {
    const bridge: ConversationBridge = {
      kind: 'fallback',
      unreadCount: 1,
      suggestedMode: 'focal',
      data: { authors: ['Alice'], extraAuthorCount: 0, messageCount: 1 },
    };
    render(<FocalBridgeRow bridge={bridge} accentHex={ACCENT} preferredLanguages={['fr']} />);
    const el = screen.getByTestId('focal-bridge-row');
    expect(el).toHaveStyle({
      borderStyle: 'dashed',
      borderWidth: 'var(--lentille-thread-agent-row-border-size)',
      borderRadius: 'var(--lentille-thread-agent-row-radius)',
    });
  });
});
