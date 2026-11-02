import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chromeMajorOf, isBelowWebViewFloor, MIN_ANDROID_WEBVIEW_MAJOR, redirectBelowWebViewFloor, WEBVIEW_UPDATE_PAGE } from './webview-floor';

/**
 * LE PLANCHER DE WEBVIEW DE LA COQUE ANDROID (W19, #11325) — sous Chrome 111,
 * la coque quitte l'application pour l'écran « mettre à jour Android System
 * WebView ». Un agent qu'on ne sait pas dater, un iPhone ou un ordinateur ne
 * sont jamais renvoyés.
 */
const webView = (major: number): string =>
  `Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/${major}.0.5481.153 Mobile Safari/537.36`;

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const DESKTOP_OLD_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36';

describe('chromeMajorOf', () => {
  test('lit le numéro majeur de Chrome', () => {
    expect(chromeMajorOf(webView(110))).toBe(110);
    expect(chromeMajorOf(webView(131))).toBe(131);
  });

  test('un agent sans Chrome ne se date pas', () => {
    expect(chromeMajorOf(IPHONE)).toBeNull();
  });
});

describe('isBelowWebViewFloor', () => {
  test('le plancher est Chrome 111', () => {
    expect(MIN_ANDROID_WEBVIEW_MAJOR).toBe(111);
  });

  test('une WebView Android 110 est sous le plancher, 111 et plus passent', () => {
    expect(isBelowWebViewFloor(webView(110))).toBe(true);
    expect(isBelowWebViewFloor(webView(83))).toBe(true);
    expect(isBelowWebViewFloor(webView(111))).toBe(false);
    expect(isBelowWebViewFloor(webView(140))).toBe(false);
  });

  test('un iPhone, un ordinateur ou un agent illisible ne sont jamais bloqués', () => {
    expect(isBelowWebViewFloor(IPHONE)).toBe(false);
    expect(isBelowWebViewFloor(DESKTOP_OLD_CHROME)).toBe(false);
    expect(isBelowWebViewFloor('Mozilla/5.0 (Linux; Android 10; K; wv)')).toBe(false);
    expect(isBelowWebViewFloor('')).toBe(false);
  });
});

describe('redirectBelowWebViewFloor — le contrôle au démarrage', () => {
  const host = (userAgent: string) => {
    const visited: string[] = [];
    return { visited, host: { userAgent, replace: (url: string) => void visited.push(url) } };
  };

  test('sous le plancher, la coque part vers l’écran de mise à jour', () => {
    const { visited, host: h } = host(webView(100));
    expect(redirectBelowWebViewFloor(h)).toBe(true);
    expect(visited).toEqual([`/${WEBVIEW_UPDATE_PAGE}`]);
  });

  test('au-dessus, rien ne bouge', () => {
    const { visited, host: h } = host(webView(120));
    expect(redirectBelowWebViewFloor(h)).toBe(false);
    expect(visited).toEqual([]);
  });
});

describe('l’écran de mise à jour', () => {
  const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.google.android.webview';
  const page = readFileSync(fileURLToPath(new URL(`../../../public/${WEBVIEW_UPDATE_PAGE}`, import.meta.url)), 'utf8');
  const script = page.slice(page.indexOf('<script>'), page.indexOf('</script>'));

  test('il parle les sept langues et mène à la fiche Play Store de la WebView', () => {
    for (const lang of ['fr', 'en', 'es', 'pt', 'it', 'de', 'ar']) expect(script).toContain(`${lang}: {`);
    expect(page).toContain('https://play.google.com/store/apps/details?id=com.google.android.webview');
  });

  type Rendered = { readonly title: string; readonly action: string; readonly href: string; readonly actionHidden: boolean };

  function render(userAgent: string): Rendered {
    const element = () => ({ textContent: '', hidden: false, href: PLAY_STORE });
    const nodes = { title: element(), body: element(), action: element() };
    const document = {
      documentElement: { lang: '', dir: '' },
      title: '',
      getElementById: (id: keyof typeof nodes) => nodes[id],
    };
    const navigator = { userAgent, languages: ['fr-FR'], language: 'fr-FR' };
    new Function('navigator', 'document', script.slice('<script>'.length))(navigator, document);
    return { title: nodes.title.textContent, action: nodes.action.textContent, href: nodes.action.href, actionHidden: nodes.action.hidden };
  }

  test('sous le plancher, il demande la mise à jour et ouvre le Play Store', () => {
    expect(render(webView(MIN_ANDROID_WEBVIEW_MAJOR - 1))).toEqual({
      title: 'Mettez à jour Android System WebView',
      action: 'Ouvrir le Play Store',
      href: PLAY_STORE,
      actionHidden: false,
    });
  });

  test('une WebView à jour qui échoue à charger la page ne se fait pas dire trop ancienne (#13159)', () => {
    for (const major of [MIN_ANDROID_WEBVIEW_MAJOR, 130]) {
      expect(render(webView(major)).title).toBe('Meeshy n’a pas pu s’ouvrir');
    }
  });

  test('l’échec de chargement offre de réessayer, comme le bouton Actualiser du navigateur : la coque n’a pas d’autre sortie (#13184)', () => {
    expect(render(webView(130))).toEqual({
      title: 'Meeshy n’a pas pu s’ouvrir',
      action: 'Réessayer',
      href: '/',
      actionHidden: false,
    });
  });

  test('son script se lit sur une WebView ancienne : ES5, aucun module', () => {
    expect(script).not.toMatch(/=>|\bconst\b|\blet\b|`|\?\?|\?\./);
    expect(page).not.toContain('type="module"');
  });
});
