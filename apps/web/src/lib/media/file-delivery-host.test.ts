import { describe, expect, test } from 'bun:test';

import { browserFileDeliveryHost, hasFileDeliveryDoor } from './file-delivery-host';

/**
 * `browserFileDeliveryHost` / `hasFileDeliveryDoor` (#7116, revue) — CE QUE
 * L'HÔTE SAIT LIVRER, décidé AVANT d'offrir « Enregistrer ».
 *
 * Le premier jet offrait le bouton partout et comptait sur `<a download>`.
 * Mesuré dans le dépôt : ni `@capacitor/android` 8.5.1 (aucun
 * `DownloadListener`) ni `@capacitor/ios` 8.5.1 (aucun `WKDownloadDelegate`)
 * ne branchent le téléchargement d'une WebView — dans une coque, l'ancre ne
 * fait RIEN, et la coque Android n'a pas non plus `navigator.share`
 * (`invitation.ts`, crbug 765923). Le bouton y était donc un contrôle sans
 * effet qui annonçait « Story enregistrée ».
 */
function documentLike() {
  return { createElement: () => ({}) as HTMLElement, body: { appendChild: (el: HTMLElement) => el, removeChild: (el: HTMLElement) => el } } as never;
}

const urls = { createObjectURL: () => 'blob:1', revokeObjectURL: () => undefined };

describe('browserFileDeliveryHost — les portes que l’hôte offre VRAIMENT', () => {
  test('un NAVIGATEUR (document, URL d’objet, aucune coque) ⇒ l’ancre de téléchargement', () => {
    const host = browserFileDeliveryHost({ document: documentLike(), navigator: {}, urls, shell: undefined });
    expect(hasFileDeliveryDoor(host)).toBe(true);
    expect(host.document).toBeDefined();
  });

  test('la COQUE Android (Capacitor, sans `navigator.share`) ⇒ AUCUNE porte : le geste n’est pas offert', () => {
    const host = browserFileDeliveryHost({ document: documentLike(), navigator: {}, urls, shell: {} });
    expect(hasFileDeliveryDoor(host)).toBe(false);
  });

  test('une COQUE qui sait partager des fichiers ⇒ le partage SEUL, jamais l’ancre muette', () => {
    const host = browserFileDeliveryHost({
      document: documentLike(),
      navigator: { canShare: () => true, share: async () => undefined },
      urls,
      shell: {},
    });
    expect(hasFileDeliveryDoor(host)).toBe(true);
    expect(host.document).toBeUndefined();
    expect(host.shareFiles).toBeDefined();
  });

  test('aucun document (rendu hors navigateur) ⇒ aucune porte', () => {
    expect(hasFileDeliveryDoor(browserFileDeliveryHost({ document: undefined, navigator: undefined, urls, shell: undefined }))).toBe(false);
  });
});
