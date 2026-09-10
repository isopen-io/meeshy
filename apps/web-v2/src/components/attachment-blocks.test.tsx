import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { messagesOf } from '@/lib/api/fixtures';
import {
  MEDIA_BROKEN_IMAGE_WITNESS_ID,
  MEDIA_CONVERSATION_ID,
  MEDIA_IMAGE_WITNESS_ID,
  MEDIA_VOICE_DE_WITNESS_ID,
  MEDIA_VOICE_EN_WITNESS_ID,
} from '@/lib/api/fixtures-media';
import type { Attachment } from '@/lib/api/types';

import { Attachments } from './attachment-blocks';

/**
 * « L'API PUBLIQUE DES DEUX PEAUX » — `renderToStaticMarkup` (même patron que
 * `bubble.test.tsx`) : ce fichier teste `Attachments`, le SITE UNIQUE monté
 * par `bubble.tsx` ET `focal-row.tsx` (#5805, § 4.3 de la spécification).
 */

const attachmentOf = (id: string): Attachment => {
  const message = messagesOf(MEDIA_CONVERSATION_ID).find((m) => m.id === id);
  const attachment = message?.attachments?.[0];
  if (!attachment) throw new Error(`témoin introuvable : ${id}`);
  return attachment;
};

const renderOne = (attachment: Attachment, params: { readonly languages: readonly string[]; readonly displayLanguage?: string }) =>
  renderToStaticMarkup(
    <Attachments
      attachments={[attachment]}
      languages={params.languages}
      fallbackLanguage="fr"
      {...(params.displayLanguage !== undefined ? { displayLanguage: params.displayLanguage } : {})}
    />,
  );

describe('Attachments — l’image (#5805)', () => {
  const image = attachmentOf(MEDIA_IMAGE_WITNESS_ID);

  test('rang 1 : alt anglais, lang="en"', () => {
    const html = renderOne(image, { languages: ['en', 'fr'] });
    expect(html).toContain('<img');
    expect(html).toContain('lang="en"');
    expect(html).toContain('Deployment dashboard screenshot, every service green');
    expect(html).toContain(`src="${image.fileUrl}"`);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain(`width="${image.width}"`);
    expect(html).toContain(`height="${image.height}"`);
  });

  test('rang ≠ 1 : le prisme [\'de\',\'fr\'] sert l’alt ALLEMAND, lang="de"', () => {
    const html = renderOne(image, { languages: ['de', 'fr'] });
    expect(html).toContain('lang="de"');
    expect(html).toContain('Bildschirmfoto des Deployment-Dashboards, alle Dienste grün');
    expect(html).not.toContain('Deployment dashboard screenshot');
  });

  test('prisme [\'fr\'] : l’alt D’ORIGINE, et AUCUN lang (la langue du document)', () => {
    const html = renderOne(image, { languages: ['fr'] });
    expect(html).toContain('Capture du tableau de bord de déploiement, tous les services au vert');
    expect(html).not.toMatch(/<img[^>]*\slang=/);
  });

  test('la boîte porte le ratio DEPUIS width/height, classe rounded-media, jamais rounded-card', () => {
    const html = renderOne(image, { languages: ['fr'] });
    expect(html).toContain(`aspect-ratio:${image.width} / ${image.height}`);
    expect(html).toContain('rounded-media');
    expect(html).not.toContain('rounded-card');
    expect(html).toContain('max-w-full');
  });

  test('sans métadonnées de dimension : ratio de repli 300 / 240', () => {
    const broken = attachmentOf(MEDIA_BROKEN_IMAGE_WITNESS_ID);
    const html = renderOne(broken, { languages: ['fr'] });
    expect(html).toContain('aspect-ratio:300 / 240');
  });

  test('fileUrl vide : aucune <img>, role="img" + aria-label servi par le Prisme', () => {
    const withoutUrl: Attachment = { ...image, fileUrl: '' };
    const html = renderOne(withoutUrl, { languages: ['en', 'fr'] });
    expect(html).not.toContain('<img');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Deployment dashboard screenshot, every service green"');
  });
});

describe('Attachments — le vocal, la piste suit le TEXTE servi (#5805, cycle 128)', () => {
  const voiceEn = attachmentOf(MEDIA_VOICE_EN_WITNESS_ID);
  const voiceDe = attachmentOf(MEDIA_VOICE_DE_WITNESS_ID);

  test('rang ≠ 1 : prisme [\'de\',\'fr\'] sur le témoin EN ⇒ piste de, <p lang="de">', () => {
    const html = renderOne(voiceEn, { languages: ['de', 'fr'] });
    expect(html).toContain('data-track-language="de"');
    expect(html).toContain(`src="${voiceEn.translations!.de!.url}"`);
    expect(html).toMatch(/<p [^>]*data-transcript[^>]*\slang="de"/);
    expect(html).toContain('Hallo Team, das Deployment war um drei fertig, ich schicke den Bericht.');
  });

  /**
   * ÉCART AVEC LA SPÉCIFICATION (§4.3 d), suivi ici plutôt que reproduit en
   * silence : l'énumération demandait `<p lang="fr">` sous ce prisme, mais sa
   * PROPRE garde générale, une phrase plus bas, dit « lang est ABSENT ssi la
   * langue servie est celle du document (READER_LOCALE) » — et `READER_LOCALE`
   * vaut TOUJOURS `'fr'` dans cette application (`systemLanguage: 'fr'`,
   * rang 1, gagne quel que soit `deviceLocale`, `src/lib/reader.ts`, mesuré).
   * Les deux ne peuvent pas être vraies à la fois : la garde générale, plus
   * robuste (elle couvre TOUS les rangs, pas un cas particulier), est celle
   * que ce lot applique — un `lang="fr"` sur un document dont le `<html
   * lang="fr">` est déjà posé serait l'attribut redondant que la garde
   * interdit précisément d'écrire.
   */
  test('prisme [\'fr\',\'en\'] ⇒ piste fr ; AUCUN lang (fr est la langue du document — garde générale, écart suivi ci-dessus)', () => {
    const html = renderOne(voiceEn, { languages: ['fr', 'en'] });
    expect(html).toContain('data-track-language="fr"');
    expect(html).toContain(`src="${voiceEn.translations!.fr!.url}"`);
    expect(html).not.toMatch(/<p[^>]*\slang=/);
  });

  test('prisme [\'en\',\'fr\'] : la langue servie EST l’originale (en) ⇒ src=fileUrl, data-track-language="en", lang="en" (≠ document fr)', () => {
    const html = renderOne(voiceEn, { languages: ['en', 'fr'] });
    expect(html).toContain(`src="${voiceEn.fileUrl}"`);
    expect(html).toContain('data-track-language="en"');
    expect(html).toContain('Hello team, the deploy finished at three, I am sending the report.');
    expect(html).toContain('lang="en"');
  });

  test('langue servie SANS piste (es, texte seul) : repli sur l’ORIGINAL, jamais une URL vide', () => {
    const html = renderOne(voiceDe, { languages: ['es', 'fr'] });
    // `es` n'a pas de piste (`transcriptTranslationTracks` l'écarte) : la
    // langue TEXTE servie reste `es` (rang 1), mais la piste retombe sur
    // l'original allemand.
    expect(html).toContain(`src="${voiceDe.fileUrl}"`);
    expect(html).toContain('data-track-language="de"');
    expect(html).toContain('La presentación está lista, la subiré esta noche.');
  });

  test('pureté : la même pièce rendue deux fois, la seconde avec une traduction AJOUTÉE, change de piste et de texte', () => {
    const before = renderOne(voiceEn, { languages: ['de', 'fr'] });
    const augmented: Attachment = {
      ...voiceEn,
      translations: { ...voiceEn.translations, es: { type: 'audio', transcription: 'Hola equipo', url: 'data:audio/wav;base64,ES', createdAt: new Date() } },
    };
    const withEs = renderOne(augmented, { languages: ['es', 'de', 'fr'] });
    expect(before).not.toBe(withEs);
    expect(withEs).toContain('data-track-language="es"');
    expect(withEs).toContain('Hola equipo');
  });

  test('displayLanguage="en" (manualOverride == original) impose la piste ORIGINALE malgré un prisme [\'de\',\'fr\']', () => {
    const html = renderOne(voiceEn, { languages: ['de', 'fr'], displayLanguage: 'en' });
    expect(html).toContain(`src="${voiceEn.fileUrl}"`);
    expect(html).toContain('data-track-language="en"');
  });

  /**
   * RÉGRESSION (mesurée par `check-thread-states.mjs`, § offline/retry) —
   * une pièce vocale legacy SANS fichier (`fileUrl: ''`, `m5` de
   * `fixtures.ts`) ne doit JAMAIS poser `src=""` : un `<audio src="">`
   * PRÉSENT déclenche seul, sans aucun clic, la chaîne native
   * `play → error → pause` (le navigateur résout la chaîne vide contre le
   * document courant et échoue à la décoder) — le widget affichait alors
   * « Lecture impossible — Réessayer » AVANT toute interaction, et ce
   * « Réessayer » décoratif devançait en ordre DOM le vrai bouton de reprise
   * d'un envoi échoué plus bas dans le fil.
   */
  test('pièce SANS fichier (fileUrl vide) : aucun attribut src sur <audio>, jamais src=""', () => {
    const withoutFile: Attachment = { ...voiceEn, fileUrl: '', translations: {} };
    const html = renderOne(withoutFile, { languages: ['fr'] });
    expect(html).not.toMatch(/<audio[^>]*\ssrc=/);
  });

  test('le bouton porte le vocabulaire iOS repris, aucun aria-pressed, la durée 0:12', () => {
    const html = renderOne(voiceEn, { languages: ['fr'] });
    // React échappe l'apostrophe en entité HTML dans un attribut.
    expect(html).toContain('aria-label="Lire l&#x27;audio"');
    expect(html).not.toContain('aria-pressed');
    expect(html).toContain('>0:12<');
  });

  test('consommation : 4 000 / 12 000 ⇒ barre à 33.3 % (arrondi au dixième)', () => {
    const html = renderOne(voiceDe, { languages: ['fr'] });
    expect(html).toContain('data-consumption');
    expect(html).toContain('width:33.3%');
  });

  test('consommation null : aucune barre', () => {
    const html = renderOne(voiceEn, { languages: ['fr'] });
    expect(html).not.toContain('data-consumption');
  });

  test('listenedComplete: true ⇒ barre à 100 %', () => {
    const complete: Attachment = {
      ...voiceDe,
      currentUserConsumption: { lastPlayPositionMs: 1_000, listenedComplete: true, lastWatchPositionMs: null, watchedComplete: false },
    };
    const html = renderOne(complete, { languages: ['fr'] });
    expect(html).toContain('width:100%');
  });

  test('position < 1 % : aucune barre', () => {
    const barely: Attachment = {
      ...voiceDe,
      currentUserConsumption: { lastPlayPositionMs: 50, listenedComplete: false, lastWatchPositionMs: null, watchedComplete: false },
    };
    const html = renderOne(barely, { languages: ['fr'] });
    expect(html).not.toContain('data-consumption');
  });
});

/**
 * L'ÉCHEC DE DÉCODAGE D'UNE IMAGE (§6 de la spécification #5805, table des
 * états) — un événement RÉEL (`onError`), donc happy-dom + `createRoot` +
 * `act` (patron `use-audio-playback.test.tsx`), pas `renderToStaticMarkup`.
 */
describe('Attachments — l’image en ÉCHEC de décodage (#5805)', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    GlobalRegistrator.register();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await GlobalRegistrator.unregister();
  });

  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test('onError masque l’<img> et fait apparaître role="img" + aria-label servi — le libellé ne se tait jamais', () => {
    const broken = attachmentOf(MEDIA_BROKEN_IMAGE_WITNESS_ID);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Attachments attachments={[broken]} languages={['fr']} fallbackLanguage="fr" />);
    });

    const figure = container.querySelector('figure')!;
    const img = container.querySelector('img')!;
    expect(figure.getAttribute('role')).toBeNull();
    expect(img.hidden).toBe(false);

    act(() => {
      img.dispatchEvent(new Event('error'));
    });

    expect(img.hidden).toBe(true);
    expect(figure.getAttribute('role')).toBe('img');
    expect(figure.getAttribute('aria-label')).toBe('Capture indisponible, fichier corrompu à l’envoi');
  });
});
