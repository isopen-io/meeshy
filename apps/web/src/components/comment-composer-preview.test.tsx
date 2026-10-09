import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { MAX_POST_MEDIA } from '@meeshy/shared/types/attachment';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { setInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { previewUrlCacheSizeForTests, resetPreviewUrlCacheForTests } from '@/lib/send/attachment-preview-url';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentComposer, type CommentComposerResult, type CommentUploadReport } from './comment-composer';

/**
 * #9736 — **L'APERÇU D'UNE PIÈCE JOINTE À UN COMMENTAIRE EST CELUI DU
 * MESSAGE, JUSQU'AU BOUT** : la vignette arrive aussitôt (#9167), et ce qui
 * lui manquait se voit ici — un fichier écarté SE DIT, la borne du serveur
 * (`MAX_POST_MEDIA`) SE DIT, la même photo ne se joint pas deux fois, le
 * retrait est nommé dans la langue du lecteur et relâche l'aperçu, et chaque
 * vignette montre sa montée pendant le téléversement.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadInterfaceCatalog('fr'), loadInterfaceCatalog('en')]);
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root !== undefined) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  resetPreviewUrlCacheForTests();
});

async function monter(node: React.ReactElement): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

const fichier = (name: string, type: string, lastModified = 1) => new File([new Uint8Array([1, 2, 3])], name, { type, lastModified });
const photo = (name = 'plage.jpg') => fichier(name, 'image/jpeg');

async function attendre(predicate: () => boolean): Promise<void> {
  for (let tour = 0; tour < 50 && !predicate(); tour += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

const tuiles = (host: HTMLElement) => host.querySelectorAll('[data-pending-tile]');
const avis = (host: HTMLElement) => host.querySelector('[data-comment-notice]');

async function joindre(host: HTMLElement, files: readonly File[]): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('[data-comment-attach-input]');
  if (input === null) throw new Error('sélecteur absent');
  const avant = tuiles(host).length;
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await attendre(() => tuiles(host).length > avant || avis(host) !== null);
}

type Envoi = (report: CommentUploadReport) => Promise<CommentComposerResult>;

function hote(language: InterfaceLanguage = 'fr', envoi: Envoi = async () => ({ ok: true })) {
  return <CommentComposer language={language} canWrite onSend={(_content, _pending, report) => envoi(report)} />;
}

describe('CommentComposer — l’aperçu des pièces jointes (#9736)', () => {
  test('une photo, une vidéo et un son choisis : trois vignettes, chacune à sa forme', async () => {
    const host = await monter(hote());
    await joindre(host, [photo(), fichier('vague.mp4', 'video/mp4'), fichier('chanson.mp3', 'audio/mpeg')]);
    const [image, video, son] = Array.from(tuiles(host));
    expect(tuiles(host)).toHaveLength(3);
    expect(image?.querySelector('img')).not.toBeNull();
    expect(video?.querySelector('video')).not.toBeNull();
    expect(son?.querySelector('[data-pending-kind="audio"]')).not.toBeNull();
  });

  test('un fichier qu’un commentaire ne porte pas est écarté EN LE DISANT', async () => {
    const host = await monter(hote());
    await joindre(host, [fichier('notes.pdf', 'application/pdf')]);
    expect(tuiles(host)).toHaveLength(0);
    expect(avis(host)?.textContent).toBe('« notes.pdf » : un commentaire ne porte que des photos, des vidéos et des sons.');
    expect(avis(host)?.getAttribute('data-comment-notice-issue')).toBe('refused');
  });

  test('au-delà de la borne du serveur, le surplus est écarté EN LE DISANT', async () => {
    const host = await monter(hote());
    await joindre(host, Array.from({ length: MAX_POST_MEDIA + 2 }, (_, i) => photo(`p${i}.jpg`)));
    expect(tuiles(host)).toHaveLength(MAX_POST_MEDIA);
    expect(avis(host)?.textContent).toBe(`Pas plus de ${MAX_POST_MEDIA} pièces jointes par commentaire.`);
  });

  test('la même photo ne se joint pas deux fois', async () => {
    const host = await monter(hote());
    await joindre(host, [photo()]);
    await joindre(host, [photo()]);
    expect(tuiles(host)).toHaveLength(1);
    expect(avis(host)?.textContent).toBe('« plage.jpg » est déjà joint à ce commentaire.');
  });

  test('une pièce acceptée efface l’avis du refus précédent', async () => {
    const host = await monter(hote());
    await joindre(host, [fichier('notes.pdf', 'application/pdf')]);
    await joindre(host, [photo()]);
    expect(tuiles(host)).toHaveLength(1);
    expect(avis(host)).toBeNull();
  });

  test('le retrait est NOMMÉ dans la langue du lecteur, retire la vignette et relâche son aperçu', async () => {
    await setInterfaceLanguage('en');
    const host = await monter(hote('en'));
    await joindre(host, [photo(), photo('dune.jpg')]);
    expect(host.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Pending attachments');
    expect(previewUrlCacheSizeForTests()).toBe(2);
    const retirer = host.querySelector<HTMLButtonElement>('button[aria-label="Remove plage.jpg"]');
    expect(retirer?.type).toBe('button');
    await act(async () => retirer?.click());
    expect(tuiles(host)).toHaveLength(1);
    expect(previewUrlCacheSizeForTests()).toBe(1);
    await setInterfaceLanguage('fr');
  });

  test('pendant le téléversement, chaque vignette montre SA montée et ne s’offre plus au retrait', async () => {
    let rapport: CommentUploadReport | undefined;
    let finir: ((result: CommentComposerResult) => void) | undefined;
    const host = await monter(
      hote('fr', (report) => {
        rapport = report;
        return new Promise<CommentComposerResult>((resolve) => {
          finir = resolve;
        });
      }),
    );
    await joindre(host, [photo(), photo('dune.jpg')]);
    await act(async () => host.querySelector<HTMLFormElement>('[data-comment-composer]')?.requestSubmit());
    const barres = () => Array.from(host.querySelectorAll('[role="progressbar"]'));
    expect(barres().map((barre) => barre.getAttribute('aria-valuenow'))).toEqual(['0', '0']);
    expect(barres()[0]?.getAttribute('aria-label')).toBe('plage.jpg');
    expect(host.querySelector('button[aria-label="Supprimer plage.jpg"]')).toBeNull();

    const [première] = Array.from(tuiles(host));
    const localId = première?.getAttribute('data-pending-tile') ?? '';
    await act(async () => rapport?.(localId, 0.42));
    expect(barres().map((barre) => barre.getAttribute('aria-valuenow'))).toEqual(['42', '0']);

    await act(async () => finir?.({ ok: true }));
    expect(tuiles(host)).toHaveLength(0);
    expect(previewUrlCacheSizeForTests()).toBe(0);
  });

  test('un téléversement refusé rend les vignettes, sans barre, de nouveau retirables', async () => {
    const host = await monter(hote('fr', async () => ({ ok: false, message: 'comments.media.upload_failed' })));
    await joindre(host, [photo()]);
    await act(async () => host.querySelector<HTMLFormElement>('[data-comment-composer]')?.requestSubmit());
    await attendre(() => host.querySelector('button[aria-label="Supprimer plage.jpg"]') !== null);
    expect(host.querySelector('[role="progressbar"]')).toBeNull();
    expect(host.querySelector('button[aria-label="Supprimer plage.jpg"]')).not.toBeNull();
    expect(previewUrlCacheSizeForTests()).toBe(1);
  });
});
