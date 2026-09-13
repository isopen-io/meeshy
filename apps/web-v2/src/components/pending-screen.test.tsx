import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { LINKS_DESTINATION, SETTINGS_DESTINATION } from '@/lib/view/floating-menu';

import { PendingScreen } from './pending-screen';

/**
 * L'ÉCRAN D'ATTENTE DANS LA LANGUE D'INTERFACE (#6206) — ses quatre textes
 * (titre, promesse, « bientôt », retour) viennent du catalogue. Le témoin
 * s'écrit en ANGLAIS et en ARABE : en français, le texte en dur d'hier et le
 * catalogue rendraient la même chose.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await Promise.all([loadInterfaceCatalog('en'), loadInterfaceCatalog('ar'), loadInterfaceCatalog('fr')]);
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  document.documentElement.lang = 'fr';
});

const render = (destination = LINKS_DESTINATION) => renderToStaticMarkup(<PendingScreen destination={destination} />);

describe('PendingScreen — ce qu’il dit vient du catalogue', () => {
  test('en : titre, promesse, annonce et retour en anglais', () => {
    document.documentElement.lang = 'en';
    const html = render();
    expect(html).toContain('>My links</h1>');
    expect(html).toContain('Links shared in your conversations will gather here.');
    expect(html).toContain('This screen is coming soon.');
    expect(html).toContain('aria-label="Back to conversations"');
    expect(html).not.toContain('bientôt');
  });

  test('ar : le titre des réglages est arabe', () => {
    document.documentElement.lang = 'ar';
    expect(render(SETTINGS_DESTINATION)).toContain('>الإعدادات</h1>');
  });

  test('fr : le français reste celui d’hier', () => {
    const html = render();
    expect(html).toContain('>Mes liens</h1>');
    expect(html).toContain('Cet écran arrive bientôt.');
    expect(html).toContain('aria-label="Revenir aux conversations"');
  });
});
