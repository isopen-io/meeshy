/**
 * Le rattrapage PÉRENNE des préférences n'existe que s'il est MONTÉ.
 *
 * Leçon 311 : un mécanisme correct dont aucune surface ne dépend est
 * indiscernable, dans un balayage de code, d'un mécanisme qui agit. Ces
 * témoins portent donc sur le CÂBLAGE — `StoreInitializer` enveloppe
 * l'application entière (`app/layout.tsx`), et c'est ce qui distingue ce
 * déclencheur des trois routes du cycle 133, dont deux ne vivent que sur les
 * écrans de conversation.
 */

import { render } from '@testing-library/react';

const initializeApp = jest.fn().mockResolvedValue(undefined);
const initializeAuth = jest.fn().mockResolvedValue(undefined);
const initializeUserPreferences = jest.fn().mockResolvedValue(undefined);
const detectAndSetBrowserLanguage = jest.fn();
const setInterfaceLanguage = jest.fn();
const addNotification = jest.fn();

jest.mock('@/stores/app-store', () => ({
  useAppStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector({ initialize: initializeApp }),
    { getState: () => ({ addNotification }) }
  ),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ initializeAuth, user: null }),
}));

jest.mock('@/stores/language-store', () => ({
  useLanguageStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector({ detectAndSetBrowserLanguage }),
    { getState: () => ({ setInterfaceLanguage }) }
  ),
}));

jest.mock('@/stores/user-preferences-store', () => ({
  useUserPreferencesStore: (selector: (s: unknown) => unknown) =>
    selector({ initialize: initializeUserPreferences }),
}));

const stopRehydration = jest.fn();
const startMirroredPreferenceRehydration = jest.fn(() => stopRehydration);

jest.mock('@/lib/preferences/preference-rehydration', () => ({
  startMirroredPreferenceRehydration: () => startMirroredPreferenceRehydration(),
}));

import { StoreInitializer } from '@/stores/store-initializer';

describe('StoreInitializer', () => {
  beforeEach(() => {
    startMirroredPreferenceRehydration.mockClear();
    stopRehydration.mockClear();
  });

  it('abonne le double des préférences à la connexion', () => {
    render(<StoreInitializer><span>enfant</span></StoreInitializer>);

    expect(startMirroredPreferenceRehydration).toHaveBeenCalledTimes(1);
  });

  it('se désabonne au démontage', () => {
    const { unmount } = render(<StoreInitializer><span>enfant</span></StoreInitializer>);

    unmount();

    expect(stopRehydration).toHaveBeenCalledTimes(1);
  });

  it('rend ses enfants', () => {
    const { getByText } = render(<StoreInitializer><span>enfant</span></StoreInitializer>);

    expect(getByText('enfant')).toBeTruthy();
  });
});
