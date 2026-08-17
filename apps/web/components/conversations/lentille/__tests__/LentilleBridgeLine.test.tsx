/**
 * WL-105 (LWS-10) — `LentilleBridgeLine`, les deux étages du pont ✦.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';

jest.mock('@/hooks/use-resolved-theme', () => ({
  useResolvedTheme: () => 'light',
}));

// `useI18n('conversations')` charge le vrai catalogue via `import()` dynamique
// (voir `hooks/use-i18n.ts`) — on le mock ici avec les clés RÉELLES posées
// sous `conversations.lentille.bridge.*` (S-005, re-prouvées dans
// `apps/web/locales/fr/conversations.json`) pour que ce test exerce le
// VRAI format des phrases, pas un double halluciné.
const FR_BRIDGE_KEYS: Record<string, string> = {
  'lentille.bridge.authorsOne': '{name}',
  'lentille.bridge.authorsTwo': '{a} et {b}',
  'lentille.bridge.authorsMore': '{a}, {b} +{count}',
  'lentille.bridge.messagesOne': '{count} message',
  'lentille.bridge.messagesOther': '{count} messages',
  'lentille.bridge.media.images': '{count} images',
  'lentille.bridge.media.audio': '{count} vocaux',
  'lentille.bridge.media.files': '{count} fichiers',
  'lentille.bridge.partial': 'sur les {count} derniers messages',
};

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const template = FR_BRIDGE_KEYS[key] ?? key;
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (_match: string, p: string) => String(params[p] ?? `{${p}}`));
    },
    isLoading: false,
  }),
}));

import { LentilleBridgeLine } from '../LentilleBridgeLine';

const ACCENT = '#3498DB';

describe('LentilleBridgeLine — étage fallback (déterministe)', () => {
  it('compose la phrase via formatBridge (i18n client, jamais traduite)', () => {
    const bridge: ConversationBridge = {
      kind: 'fallback',
      unreadCount: 3,
      suggestedMode: 'focal',
      data: { authors: ['Alice'], extraAuthorCount: 0, messageCount: 3 },
    };

    render(<LentilleBridgeLine bridge={bridge} accentHex={ACCENT} preferredLanguages={['fr']} />);

    expect(screen.getByTestId('lentille-bridge-line').textContent).toContain('Alice');
    expect(screen.getByTestId('lentille-bridge-line').textContent).toContain('3 messages');
  });

  it('ajoute la mention de partialité quand isComplete est false', () => {
    const bridge: ConversationBridge = {
      kind: 'fallback',
      unreadCount: 12,
      suggestedMode: 'focal',
      isComplete: false,
      data: { authors: ['Alice'], extraAuthorCount: 0, messageCount: 8 },
    };

    render(<LentilleBridgeLine bridge={bridge} accentHex={ACCENT} preferredLanguages={['fr']} />);

    expect(screen.getByTestId('lentille-bridge-line').textContent).toContain('sur les 8 derniers messages');
  });

  it("n'ajoute AUCUNE mention quand isComplete est absent (complet par défaut)", () => {
    const bridge: ConversationBridge = {
      kind: 'fallback',
      unreadCount: 3,
      suggestedMode: 'focal',
      data: { authors: ['Alice'], extraAuthorCount: 0, messageCount: 3 },
    };

    render(<LentilleBridgeLine bridge={bridge} accentHex={ACCENT} preferredLanguages={['fr']} />);
    expect(screen.getByTestId('lentille-bridge-line').textContent).not.toContain('derniers messages');
  });
});

describe('LentilleBridgeLine — étage agent (Prisme)', () => {
  it('résout via resolveLastMessagePreview — la MÊME loi que le préview', () => {
    const bridge: ConversationBridge = {
      kind: 'agent',
      unreadCount: 5,
      suggestedMode: 'resume',
      text: 'Hello team',
      translations: { fr: 'Bonjour équipe' },
      originalLanguage: 'en',
    };

    render(<LentilleBridgeLine bridge={bridge} accentHex={ACCENT} preferredLanguages={['fr', 'en']} />);

    expect(screen.getByTestId('lentille-bridge-line').textContent).toContain('Bonjour équipe');
    expect(screen.getByTestId('lentille-bridge-line').textContent).not.toContain('Hello team');
  });

  it("retombe sur l'original si aucune traduction ne dessert le lecteur", () => {
    const bridge: ConversationBridge = {
      kind: 'agent',
      unreadCount: 5,
      suggestedMode: 'resume',
      text: 'Hello team',
      translations: { es: 'Hola equipo' },
      originalLanguage: 'en',
    };

    render(<LentilleBridgeLine bridge={bridge} accentHex={ACCENT} preferredLanguages={['de']} />);

    expect(screen.getByTestId('lentille-bridge-line').textContent).toContain('Hello team');
  });
});

describe('LentilleBridgeLine — teinte accent', () => {
  it('applique une couleur inline dérivée de l’accent (jamais transparente/undefined)', () => {
    const bridge: ConversationBridge = {
      kind: 'fallback',
      unreadCount: 1,
      suggestedMode: 'focal',
      data: { authors: ['Alice'], extraAuthorCount: 0, messageCount: 1 },
    };

    render(<LentilleBridgeLine bridge={bridge} accentHex={ACCENT} preferredLanguages={['fr']} />);
    const el = screen.getByTestId('lentille-bridge-line');
    expect(el.style.color).not.toBe('');
  });
});
