import { describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';

import { APP_HANDOFF_WAIT_MS, appHandoffUrl, watchForAppOpening } from './app-handoff';

/**
 * LE LIEN D'E-MAIL OUVERT SUR UN TÉLÉPHONE EST D'ABORD REMIS À L'APP (#8083,
 * décision porteur « SI ET SEULEMENT SI ») — avant que le jeton ne soit
 * consommé par le navigateur.
 */
const PAGE = 'https://meeshy.me/auth/verify-email?token=tok-1&email=ada%40x.io';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

const coque = (platform: string): CoqueNative => ({ getPlatform: () => platform });

describe('appHandoffUrl — à qui remettre le lien', () => {
  test('Android, navigateur : intent vers meeshy://, même chemin, même jeton, paquet de la coque', () => {
    const url = appHandoffUrl(PAGE, { userAgent: ANDROID_CHROME, shell: undefined });
    expect(url).not.toBeNull();
    expect(url?.startsWith('intent://auth/verify-email?token=tok-1&email=ada%40x.io#Intent;')).toBe(true);
    expect(url).toContain(';scheme=meeshy;');
    expect(url).toContain(';package=me.meeshy.app;');
    expect(url?.endsWith(';end')).toBe(true);
  });

  test('Android sans l’app : le repli rouvre CETTE page, marquée pour ne plus tenter la remise', () => {
    const url = appHandoffUrl(PAGE, { userAgent: ANDROID_CHROME, shell: undefined }) ?? '';
    const fallback = /S\.browser_fallback_url=([^;]+);/.exec(url)?.[1];
    expect(fallback).toBeDefined();
    const back = new URL(decodeURIComponent(fallback ?? ''));
    expect(back.pathname).toBe('/auth/verify-email');
    expect(back.searchParams.get('token')).toBe('tok-1');
    expect(back.searchParams.get('email')).toBe('ada@x.io');
    expect(appHandoffUrl(back.href, { userAgent: ANDROID_CHROME, shell: undefined })).toBeNull();
  });

  test('ordinateur : rien à remettre, le navigateur se connecte', () => {
    expect(appHandoffUrl(PAGE, { userAgent: MAC_CHROME, shell: undefined })).toBeNull();
  });

  test('iPhone : aucune tentative par schéma (Safari afficherait une erreur sans l’app) — le lien universel s’en charge', () => {
    expect(appHandoffUrl(PAGE, { userAgent: IPHONE_SAFARI, shell: undefined })).toBeNull();
  });

  test('dans la coque Capacitor : on EST l’app, aucune redirection', () => {
    expect(appHandoffUrl(PAGE, { userAgent: ANDROID_CHROME, shell: coque('android') })).toBeNull();
  });

  test('un objet Capacitor qui se dit « web » n’est pas une coque', () => {
    expect(appHandoffUrl(PAGE, { userAgent: ANDROID_CHROME, shell: coque('web') })).not.toBeNull();
  });
});

describe('watchForAppOpening — l’app s’est-elle ouverte ?', () => {
  function fakeView(initial: DocumentVisibilityState = 'visible') {
    const target = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: initial });
    const timers: Array<{ readonly run: () => void; readonly ms: number; cleared: boolean }> = [];
    const view = {
      document: doc,
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      setTimeout: (run: () => void, ms: number) => {
        timers.push({ run, ms, cleared: false });
        return timers.length - 1;
      },
      clearTimeout: (id: number) => {
        const timer = timers[id];
        if (timer !== undefined) timer.cleared = true;
      },
    };
    const hide = () => {
      doc.visibilityState = 'hidden';
      doc.dispatchEvent(new Event('visibilitychange'));
    };
    const elapse = () => timers.filter((t) => !t.cleared).forEach((t) => t.run());
    return { view, hide, elapse, timers };
  }

  test('la page reste visible ⇒ l’app ne s’est pas ouverte, au bout de ~1,5 s', () => {
    const { view, elapse, timers } = fakeView();
    const verdicts: boolean[] = [];
    watchForAppOpening(view)(APP_HANDOFF_WAIT_MS, (opened) => verdicts.push(opened));
    expect(timers[0]?.ms).toBe(1_500);
    elapse();
    expect(verdicts).toEqual([false]);
  });

  test('la page passe en arrière-plan ⇒ l’app s’est ouverte', () => {
    const { view, hide, elapse } = fakeView();
    const verdicts: boolean[] = [];
    watchForAppOpening(view)(APP_HANDOFF_WAIT_MS, (opened) => verdicts.push(opened));
    hide();
    elapse();
    expect(verdicts).toEqual([true]);
  });

  test('annulé (démontage) ⇒ aucun verdict', () => {
    const { view, elapse } = fakeView();
    const verdicts: boolean[] = [];
    const cancel = watchForAppOpening(view)(APP_HANDOFF_WAIT_MS, (opened) => verdicts.push(opened));
    cancel();
    elapse();
    expect(verdicts).toEqual([]);
  });
});
