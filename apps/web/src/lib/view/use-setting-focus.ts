import { useEffect } from 'react';

import { focusSettingWhenReady, SETTING_FOCUS_PARAM, settingRequestedIn, type SettingFocusTarget } from './setting-focus';

export const SETTING_HIGHLIGHT_ATTRIBUTE = 'data-setting-highlight';

function settingTarget(key: string): SettingFocusTarget | null {
  const control = document.querySelector<HTMLElement>(`[data-setting="${key}"]`);
  if (control === null) return null;
  const row = control.parentElement ?? control;
  return {
    reveal: () => row.scrollIntoView({ block: 'center' }),
    focus: () => control.focus({ preventScroll: true }),
    highlight: (on) => (on ? row.setAttribute(SETTING_HIGHLIGHT_ATTRIBUTE, '') : row.removeAttribute(SETTING_HIGHLIGHT_ATTRIBUTE)),
  };
}

function forgetRequest(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(SETTING_FOCUS_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/**
 * L'écran des réglages lit le réglage demandé sur son adresse (#16339), le
 * met en évidence, et OUBLIE la demande : un rechargement ou un retour ne
 * rallume rien.
 */
export function useSettingFocusFromAddress(): void {
  useEffect(() => {
    const key = settingRequestedIn(window.location.search);
    if (key === null) return undefined;
    forgetRequest();
    return focusSettingWhenReady({
      find: () => settingTarget(key),
      schedule: (run, delayMs) => void setTimeout(run, delayMs),
      now: () => Date.now(),
    });
  }, []);
}
