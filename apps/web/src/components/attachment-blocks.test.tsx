import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { scriptedGateway } from '@/test-support/scripted-transport';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import { messagesOf } from '@/lib/api/fixtures';
import { resolveInterfaceLanguageCode } from '@/lib/inline-interface-language-bootstrap.js';
import { READER_LOCALE } from '@/lib/reader';
import {
  MEDIA_BROKEN_IMAGE_WITNESS_ID,
  MEDIA_CONVERSATION_ID,
  MEDIA_IMAGE_WITNESS_ID,
  MEDIA_VOICE_DE_WITNESS_ID,
  MEDIA_VOICE_EN_WITNESS_ID,
} from '@/lib/api/fixtures-media';
import type { Attachment } from '@/lib/api/types';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { Attachments } from './attachment-blocks';

/** Retire les `<svg>` — leurs chemins portent des nombres qui croisent toute
 * absence affirmée sur une valeur numérique courte. */
const sansGlyphes = (html: string): string => html.replace(/<svg[\s\S]*?<\/svg>/g, '');

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

/** Le texte LU, balises retirées — le karaoké découpe la transcription en segments (#7911). */
const textOf = (html: string): string => html.replace(/<[^>]+>/g, '');

const renderOne = (attachment: Attachment, params: { readonly languages: readonly string[]; readonly displayLanguage?: string }) =>
  renderToStaticMarkup(
    <Attachments
      attachments={[attachment]}
      languages={params.languages}
      fallbackLanguage="fr"
      mediaFrame="box"
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

describe('Attachments — le vocal suit sa lecture mot à mot (#7911)', () => {
  const voiceEn = attachmentOf(MEDIA_VOICE_EN_WITNESS_ID);

  test('la transcription servie se découpe en segments, au repos tant que rien ne joue', () => {
    const html = renderOne(voiceEn, { languages: ['de', 'fr'] });
    expect(html).toContain('data-karaoke="idle"');
    expect(html).not.toContain('data-karaoke="active"');
  });

  test('segmentée, le bloc ne porte plus l’opacité qui plafonnait le mot actif', () => {
    const html = renderOne(voiceEn, { languages: ['de', 'fr'] });
    expect(html).not.toMatch(/<p [^>]*data-transcript[^>]*style="[^"]*opacity/);
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
    expect(textOf(html)).toContain('Hallo Team, das Deployment war um drei fertig, ich schicke den Bericht.');
  });

  /**
   * `READER_LOCALE` N'EST PAS LA LANGUE DU DOCUMENT — et c'est la spécification
   * (§4.3 d, `<p lang="fr">` sous ce prisme) qui avait raison contre la « garde
   * générale » que ce fichier appliquait jusqu'ici (« lang est ABSENT ssi la
   * langue servie est celle du document (READER_LOCALE) »).
   *
   * Les deux résolveurs sont DISJOINTS, et le dépôt le dit ailleurs sans que ce
   * témoin l'ait lu : `<html lang>` est posé par le script d'amorçage de la
   * langue d'INTERFACE (`inline-interface-language-bootstrap.js`, #6206) depuis
   * `navigator.languages`, pendant que le CONTENU descend le Prisme du LECTEUR
   * (`READER_LOCALE`, toujours `'fr'` — `systemLanguage: 'fr'` gagne au rang 1
   * quel que soit `deviceLocale`, `src/lib/reader.ts`). Le témoin ci-dessous
   * mesure l'écart plutôt que de le supposer : sur un navigateur anglais, le
   * document est en `en` et la transcription servie est en `fr`.
   *
   * Omettre `lang` dans ce cas — LE CAS NOMINAL d'un lecteur francophone sur un
   * appareil anglais — fait HÉRITER l'anglais du document à du texte français :
   * un lecteur d'écran prononce « Bonjour, on garde la revue jeudi ? » avec une
   * voix anglaise. L'attribut n'est redondant que si les deux langues
   * coïncident, ce qu'aucun site du rendu ne peut savoir — et savoir le ferait
   * dépendre d'un état global. On ANNONCE donc toujours la langue servie.
   */
  test('prisme [\'fr\',\'en\'] ⇒ piste fr ET <p lang="fr"> : la langue SERVIE est annoncée même au rang 1', () => {
    const html = renderOne(voiceEn, { languages: ['fr', 'en'] });
    expect(html).toContain('data-track-language="fr"');
    expect(html).toContain(`src="${voiceEn.translations!.fr!.url}"`);
    expect(html).toMatch(/<p [^>]*data-transcript[^>]*\slang="fr"/);
  });

  /**
   * LA RAISON, MESURÉE (leçon 261 : un témoin de rang s'écrit là où les deux
   * règles DIVERGENT). Sans ce témoin, la ligne ci-dessus n'est qu'une attente
   * retournée ; avec lui, elle repose sur un fait du dépôt — la langue
   * d'INTERFACE d'un navigateur anglais vaut `en` quand `READER_LOCALE` vaut
   * `fr`. Le jour où les deux se confondraient (une application servie dans la
   * seule langue du lecteur), ce témoin tomberait AVANT celui du rendu et
   * dirait pourquoi.
   */
  test('la langue d’INTERFACE et le rang 1 du Prisme DIVERGENT sur un navigateur anglais', () => {
    expect(resolveInterfaceLanguageCode(null, ['en-US', 'en'])).toBe('en');
    expect(READER_LOCALE).toBe('fr');
  });

  test('prisme [\'en\',\'fr\'] : la langue servie EST l’originale (en) ⇒ src=fileUrl, data-track-language="en", lang="en" (≠ document fr)', () => {
    const html = renderOne(voiceEn, { languages: ['en', 'fr'] });
    expect(html).toContain(`src="${voiceEn.fileUrl}"`);
    expect(html).toContain('data-track-language="en"');
    expect(textOf(html)).toContain('Hello team, the deploy finished at three, I am sending the report.');
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
 * LA VIDÉO — #6193 posait le repli LISIBLE (`kindOf` sait rendre `'video'`
 * depuis toujours ; un `return null` était une perte SILENCIEUSE). #6221
 * (« la grille 2/3/4+ ») le FAIT ÉVOLUER : une pièce vidéo avec une URL
 * exploitable rend désormais un LECTEUR RÉEL (`VideoTile`, `video-tile.tsx`,
 * témoins T8/T9 dédiés) ; le repli D-42 ne reste que pour une pièce SANS
 * fichier (`fileUrl === ''`) — la forme que #6193 visait à l'origine (un
 * upload dont l'URL n'est jamais arrivée).
 */
describe('Attachments — la vidéo : lecteur réel avec URL, repli D-42 sans fichier (#6193 puis #6221)', () => {
  const video: Attachment = {
    ...attachmentDefaults,
    id: 'a-video-1',
    messageId: 'm-video-1',
    fileName: 'trajet.mp4',
    originalName: 'trajet-vers-la-gare.mp4',
    mimeType: 'video/mp4',
    fileSize: 4_200_000,
    fileUrl: 'https://cdn.meeshy.test/trajet.mp4',
    duration: 12_000,
    uploadedBy: 'u-amina',
    createdAt: new Date().toISOString(),
  };
  const { duration: _duration, ...videoWithoutDuration } = video;
  const videoWithoutUrl: Attachment = { ...videoWithoutDuration, fileUrl: '', originalName: '', fileSize: 0 };

  test('avec une URL : rend un lecteur réel (<video>, bouton "Lire la vidéo"), jamais le repli', () => {
    const html = renderOne(video, { languages: ['fr'] });
    expect(html).not.toBe('');
    expect(html).toContain('<video');
    expect(html).toContain('Lire la vidéo');
    expect(html).not.toContain('data-video-fallback');
  });

  test('porte la DURÉE (m:ss) en badge quand `duration` est connue', () => {
    const html = renderOne(video, { languages: ['fr'] });
    expect(html).toContain('>0:12<');
  });

  test('SANS fichier (fileUrl vide) : repli D-42 lisible — glyphe, nom, taille en dernier recours', () => {
    const html = renderOne(videoWithoutUrl, { languages: ['fr'] });
    expect(html).toContain('data-video-fallback');
    expect(html).toContain('>Vidéo<');
    expect(html).toContain('>0 Ko<');
    expect(html).not.toContain('<video');
  });

  test('CONTRE-ÉPREUVE : `kindOf` déciderait `video`, un `return null` laisserait le fil vide (leçon 261)', () => {
    // Une régression qui réintroduirait `return null` pour `kind === 'video'`
    // ferait retomber ce witness — une absence affirmée seule ne suffit
    // jamais, il faut la présence positive d'un rendu en face.
    const html = renderOne(video, { languages: ['fr'] });
    expect(html.trim().length).toBeGreaterThan(0);
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
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
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
      root.render(<Attachments attachments={[broken]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" />);
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

/**
 * LA PROTECTION DÉCLARÉE SUR LA PIÈCE ELLE-MÊME (#6189, cycle 125).
 *
 * La protection du MESSAGE est gardée un cran plus haut (`bubble.test.tsx`,
 * `focal-row.test.tsx`, #6184). Ici on garde l'autre niveau, celui que la
 * mesure du 2026-09-12 a trouvé ouvert : une pièce `isViewOnce` sur un message
 * ORDINAIRE rendait son `<img>` et l'URL du fichier en clair
 * (`url_en_clair=true img=true voile=false`), pendant qu'iOS la retenait
 * (`FocalAttachmentBlock.swift:130`) et que le gateway composait déjà le verdict
 * des deux niveaux par un OU (`routes/posts/core.ts`).
 *
 * TROIS canaux, parce que la loi en lit trois — `isViewOnce`, `isBlurred` et le
 * bitmask `effectFlags`. Le troisième est celui qu'aucun témoin écrit « à vue »
 * ne couvrirait : il ne ressemble pas à une protection, c'est un entier.
 */
describe('Attachments — la pièce DÉCLARÉE protégée (#6189)', () => {
  // LES BITS SONT IMPORTÉS, JAMAIS RECOPIÉS. Écrits à la main dans ce témoin,
  // ils valaient `1 << 0` et `1 << 1` — c'est-à-dire EPHEMERAL et BLURRED, pas
  // VIEW_ONCE (`1 << 2`). Le témoin a rougi sur MA constante, et il avait
  // raison : un bitmask recopié est une seconde source de vérité qui se trompe
  // en silence dès que la première bouge.
  const { VIEW_ONCE, BLURRED, EPHEMERAL } = MESSAGE_EFFECT_FLAGS;

  const image = () => attachmentOf(MEDIA_IMAGE_WITNESS_ID);
  const langues = { languages: ['fr'] as const };

  for (const [canal, declaration] of [
    ['isViewOnce', { isViewOnce: true }],
    ['isBlurred', { isBlurred: true }],
    ['effectFlags (bit VIEW_ONCE)', { effectFlags: VIEW_ONCE }],
    ['effectFlags (bit BLURRED)', { effectFlags: BLURRED }],
  ] as const) {
    test(`${canal} ⇒ ni <img>, ni URL, ni nom de fichier, ni taille — et la marque est posée`, () => {
      const piece = image();
      const html = renderOne({ ...piece, ...declaration } as Attachment, langues);

      expect(html).not.toContain('<img');
      expect(html).not.toContain('<audio');
      expect(html).not.toContain(piece.fileUrl);
      // Le cycle 125 liste le NOM et la TAILLE parmi ce que la charge ne doit
      // pas transporter : « une protection se mesure sur tout ce que la charge
      // TRANSPORTE, jamais sur sa seule chaîne ».
      expect(html).not.toContain(piece.originalName);
      // La TAILLE se cherche hors des SVG : `fileSize` vaut 96 sur cette
      // fixture, et « 96 » apparaît dans les coordonnées des chemins d'icônes.
      // Une absence affirmée sur une chaîne courte et numérique croise le bruit
      // — elle rougissait ici sur un glyphe, pas sur une fuite.
      expect(sansGlyphes(html)).not.toContain(String(piece.fileSize));
      expect(html).toContain('data-protected-attachment="hidden"');
    });
  }

  /**
   * LE TÉMOIN QUI DISCRIMINE — `EPHEMERAL` (`1 << 0`) ne masque PAS une pièce.
   *
   * Sans lui, une loi écrite `effectFlags !== 0` passerait les quatre témoins
   * ci-dessus, et retiendrait le média de tout message éphémère ENCORE VALIDE :
   * l'éphémère se juge au niveau MESSAGE, sur son horloge (`protectionOf`
   * → `expired`), et une pièce d'un message éphémère non échu se lit
   * normalement. C'est aussi ce que dit la loi partagée : son masque est
   * exactement `VIEW_ONCE | BLURRED`.
   */
  test('effectFlags (bit EPHEMERAL) ⇒ la pièce est RENDUE : l’éphémère se juge au niveau MESSAGE', () => {
    const html = renderOne({ ...image(), effectFlags: EPHEMERAL } as Attachment, langues);

    expect(html).toContain('<img');
    expect(html).not.toContain('data-protected-attachment');
  });

  /**
   * LA CONTRE-ÉPREUVE — la MÊME pièce, sans déclaration, rend bien son média.
   * Sans elle, un `Attachments` qui cesserait de rendre TOUTE pièce ferait
   * passer les quatre témoins ci-dessus (leçon 261).
   */
  test('CONTRÔLE : la MÊME pièce SANS déclaration rend son <img> et son URL', () => {
    const piece = image();
    const html = renderOne(piece, langues);

    expect(html).toContain('<img');
    expect(html).toContain('data-attachment');
    expect(html).not.toContain('data-protected-attachment');
  });

  /**
   * LA QUESTION SE POSE PIÈCE PAR PIÈCE, jamais pour la première. Une garde
   * écrite `if (attachments.some(masked)) return notice` retiendrait les cinq
   * pièces d'un message dont une seule est déclarée — et une garde écrite sur
   * `attachments[0]` laisserait sortir les quatre autres. Ce témoin distingue
   * les deux fautes de la forme juste : DEUX pièces, UNE seule retenue.
   */
  test('deux pièces, une seule déclarée : la déclarée est retenue, l’autre est rendue', () => {
    const claire = image();
    const masquee = { ...claire, id: 'a-masquee', isViewOnce: true } as Attachment;
    const html = renderToStaticMarkup(
      <Attachments attachments={[masquee, claire]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" />,
    );

    expect(html).toContain('data-protected-attachment="hidden"');
    // La pièce claire est bien rendue : son <img> est là, une seule fois.
    expect(html.split('<img').length - 1).toBe(1);
    expect(html).toContain(`data-attachment="${claire.id}"`);
    expect(html).not.toContain('data-attachment="a-masquee"');
  });
});

/**
 * LA CONSOMMATION REMONTE AU SERVEUR, LA BARRE AU REPOS SUIT SANS ATTENDRE
 * LE SERVEUR (#7225, W6) — patron `createRoot`/`act` (§ « l'image en échec
 * de décodage » ci-dessus), un événement RÉEL (`toggle()` du vocal).
 */
describe('Attachments — le vocal RAPPORTE sa consommation (#7225)', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test('pause après lecture : la barre au repos apparaît SANS attendre un nouvel `attachment` du serveur (optimistic update)', async () => {
    const voice = attachmentOf(MEDIA_VOICE_EN_WITNESS_ID); // currentUserConsumption: undefined (fixture)
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Attachments attachments={[voice]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" />);
    });

    const audio = container.querySelector('audio')!;
    audio.play = () => {
      audio.dispatchEvent(new Event('play'));
      return Promise.resolve();
    };
    audio.pause = () => {
      audio.dispatchEvent(new Event('pause'));
    };
    Object.defineProperty(audio, 'duration', { value: 12, configurable: true });

    expect(container.querySelector('[data-consumption]')).toBeNull();

    const playButton = container.querySelector('button[aria-label="Lire l\'audio"]') as HTMLButtonElement;
    await act(async () => {
      playButton.click();
      await Promise.resolve();
    });

    Object.defineProperty(audio, 'currentTime', { value: 6, configurable: true, writable: true });
    const pauseButton = container.querySelector('button[aria-label="Mettre en pause"]') as HTMLButtonElement;
    await act(async () => {
      pauseButton.click();
    });

    const bar = container.querySelector('[data-consumption]') as HTMLElement | null;
    expect(bar).not.toBeNull();
    expect(bar?.style.width).toBe('50%');
  });

  test('#7911 — en lecture, le mot prononcé passe en GRAS à l’encre primaire ; à la pause, le texte redevient uniforme', async () => {
    const voice = attachmentOf(MEDIA_VOICE_EN_WITNESS_ID);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Attachments attachments={[voice]} languages={['en']} fallbackLanguage="en" mediaFrame="box" />);
    });

    const audio = container.querySelector('audio')!;
    audio.play = () => {
      audio.dispatchEvent(new Event('play'));
      return Promise.resolve();
    };
    audio.pause = () => {
      audio.dispatchEvent(new Event('pause'));
    };
    Object.defineProperty(audio, 'duration', { value: 12, configurable: true });
    Object.defineProperty(audio, 'currentTime', { value: 11.9, configurable: true, writable: true });

    await act(async () => {
      (container.querySelector('button[aria-label="Lire l\'audio"]') as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 40));
    });

    const active = [...container.querySelectorAll<HTMLElement>('[data-karaoke="active"]')];
    expect(active).toHaveLength(1);
    expect(active[0]?.textContent).toBe('report.');
    expect(active[0]?.style.fontWeight).toBe('700');
    expect(active[0]?.style.color).toBe('var(--color-karaoke-ink)');
    expect(container.querySelectorAll('[data-karaoke="past"]').length).toBeGreaterThan(0);

    await act(async () => {
      (container.querySelector('button[aria-label="Mettre en pause"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-karaoke="active"]')).toBeNull();
  });
});

/**
 * OUVRIR UN DOCUMENT ÉMET (#7363, W6) — avant ce lot, la rangée d'un
 * document était un `<div>` sans `href` ni `onClick` : rien ne s'ouvrait,
 * rien ne se rapportait. Patron `createRoot`/`act`, `deps` INJECTÉ
 * (`scriptedGateway`) pour observer ce qui PART sans réseau réel.
 */
describe('Attachments — ouvrir un document REÇU rapporte, jamais le sien (#7363, W6)', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const document_: Attachment = {
    ...attachmentDefaults,
    id: 'att-doc-1',
    messageId: 'm-doc',
    fileName: 'contrat.pdf',
    originalName: 'contrat.pdf',
    mimeType: 'application/pdf',
    fileSize: 204_800,
    fileUrl: 'https://cdn/contrat.pdf',
    uploadedBy: 'u-sender',
    createdAt: '2026-09-22T09:00:00.000Z',
  };

  test('la rangée est un lien accessible (44px, aria-label, href vers le fichier)', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Attachments attachments={[document_]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" />);
    });

    const link = container.querySelector('[data-attachment-file="att-doc-1"]') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.tagName).toBe('A');
    expect(link?.getAttribute('href')).toBe('https://cdn/contrat.pdf');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('aria-label')).toBe('Ouvrir contrat.pdf');
    expect(link?.style.minHeight).toBe('44px');
  });

  test('cliquer un document REÇU (isMine=false) rapporte "viewed" sur le port serveur', () => {
    const { calls, deps } = scriptedGateway({ 'POST /api/v1/attachments/att-doc-1/status': { ok: true, data: {} } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <Attachments attachments={[document_]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" isMine={false} deps={deps} />,
      );
    });

    const link = container.querySelector('[data-attachment-file="att-doc-1"]') as HTMLAnchorElement;
    act(() => {
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(calls()).toHaveLength(1);
    expect(calls()[0]?.path).toBe('/api/v1/attachments/att-doc-1/status');
    expect(calls()[0]?.body).toEqual({ action: 'viewed', playPositionMs: 0, durationMs: 0, complete: true });
  });

  test('cliquer SON PROPRE document (isMine=true) n’émet AUCUN rapport', () => {
    const { calls, deps } = scriptedGateway({ 'POST /api/v1/attachments/att-doc-1/status': { ok: true, data: {} } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <Attachments attachments={[document_]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" isMine={true} deps={deps} />,
      );
    });

    const link = container.querySelector('[data-attachment-file="att-doc-1"]') as HTMLAnchorElement;
    act(() => {
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(calls()).toHaveLength(0);
  });
});
