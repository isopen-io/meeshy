import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ProfileCallButtons } from './user-profile-call';

/**
 * APPELER DEPUIS UNE FICHE (A7) — deux boutons nommés, désactivés hors ligne
 * ou pendant l'ouverture du direct : un geste sans effet ne s'offre pas.
 */

const noop = () => undefined;

describe('les boutons d’appel de la fiche', () => {
  test('vocal et vidéo, nommés pour le lecteur d’écran, 48 px', () => {
    const html = renderToStaticMarkup(<ProfileCallButtons language="fr" name="Amina Diallo" disabled={false} onCall={noop} />);
    expect(html).toContain('aria-label="Appel vocal à Amina Diallo"');
    expect(html).toContain('aria-label="Appel vidéo à Amina Diallo"');
    expect(html).toContain('min-h-12');
    expect(html).not.toContain('disabled=""');
  });

  test('désactivés quand l’appel ne peut pas partir', () => {
    const html = renderToStaticMarkup(<ProfileCallButtons language="fr" name="Amina" disabled onCall={noop} />);
    expect(html.match(/disabled=""/g)?.length).toBe(2);
  });
});
