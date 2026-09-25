import { describe, expect, test } from 'bun:test';

import { fileDeliveryPortal } from './deliver-file';
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

/**
 * LA COQUE ANDROID LIVRE UN FICHIER PAR SON PONT (#7863). Sans porte, le
 * geste « Enregistrer » d'une story à soi n'y était pas offert, là où le web
 * (ancre) et iOS (partage de fichier) l'offrent. `MeeshyShare.shareFile`
 * ouvre la feuille du système avec le FICHIER ; une coque construite avant ce
 * pont ne déclare pas la méthode et reste sans porte.
 */
type AppelPont = { readonly plugin: string; readonly methode: string; readonly options: Record<string, unknown> };

function coqueAndroid(options: { readonly methodes: readonly string[]; readonly rejet?: unknown }) {
  const appels: AppelPont[] = [];
  const shell = {
    PluginHeaders: [{ name: 'MeeshyShare', methods: options.methodes.map((name) => ({ name })) }],
    nativePromise: async (plugin: string, methode: string, opts: object) => {
      appels.push({ plugin, methode, options: opts as Record<string, unknown> });
      if (options.rejet !== undefined) throw options.rejet;
      return undefined;
    },
  };
  return { shell, appels };
}

describe('browserFileDeliveryHost — la coque Android partage le FICHIER par son pont (#7863)', () => {
  test('une coque qui déclare `MeeshyShare.shareFile` ⇒ une porte de partage, jamais l’ancre muette', () => {
    const { shell } = coqueAndroid({ methodes: ['share', 'shareFile'] });
    const host = browserFileDeliveryHost({ document: documentLike(), navigator: {}, urls, shell });
    expect(hasFileDeliveryDoor(host)).toBe(true);
    expect(host.document).toBeUndefined();
  });

  test('une coque construite AVANT ce pont (`share` seul) ⇒ toujours aucune porte', () => {
    const { shell } = coqueAndroid({ methodes: ['share'] });
    const host = browserFileDeliveryHost({ document: documentLike(), navigator: {}, urls, shell });
    expect(hasFileDeliveryDoor(host)).toBe(false);
  });

  test('livrer remet au pont le nom, le type et le contenu en base64', async () => {
    const { shell, appels } = coqueAndroid({ methodes: ['share', 'shareFile'] });
    const portal = fileDeliveryPortal(browserFileDeliveryHost({ document: documentLike(), navigator: {}, urls, shell }));
    const outcome = await portal?.deliver(new Blob(['Meeshy!'], { type: 'image/jpeg' }), 'story.jpg', 'image/jpeg');
    expect(outcome).toBe('delivered');
    expect(appels).toEqual([
      { plugin: 'MeeshyShare', methode: 'shareFile', options: { fileName: 'story.jpg', mimeType: 'image/jpeg', data: btoa('Meeshy!') } },
    ]);
  });

  test('la feuille fermée sans choix (CANCELED) ⇒ annulé, comme sur le web', async () => {
    const { shell } = coqueAndroid({
      methodes: ['share', 'shareFile'],
      rejet: Object.assign(new Error('Partage annule'), { code: 'CANCELED' }),
    });
    const portal = fileDeliveryPortal(browserFileDeliveryHost({ document: documentLike(), navigator: {}, urls, shell }));
    expect(await portal?.deliver(new Blob(['x'], { type: 'image/jpeg' }), 'story.jpg', 'image/jpeg')).toBe('cancelled');
  });
});
