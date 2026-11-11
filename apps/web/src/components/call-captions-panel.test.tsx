import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { CallCaption } from '@/lib/calls/call-captions';
import { speakerColor } from '@/lib/calls/call-speaker-color';
import type { ActiveCall } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import { CallCaptionsPanel } from './call-captions-panel';

const footerOf = (html: string): string => html.slice(html.indexOf('data-call-captions-footer'));

const colorOf = (line: Pick<CallCaption, 'speakerId' | 'speakerName'>): string => speakerColor(line.speakerId, line.speakerName);

/**
 * LE BANDEAU DES SOUS-TITRES (#8393) — un verre d'appel sombre, une couleur
 * STABLE par personne (celle du liseré de sa vignette), la petite étiquette
 * « EN → FR » d'une ligne traduite, et l'original déplié d'un toucher sur la
 * phrase. La région reste `aria-live` polie ; une ligne en révision n'y est
 * pas annoncée ; chaque texte porte `dir="auto"`.
 */

const caption = (overrides: Partial<CallCaption> = {}): CallCaption => ({
  id: 'w-1',
  speakerId: 'u-nadia',
  speakerName: 'Nadia',
  original: 'Hello everyone',
  translated: 'Bonjour à tous',
  pair: { from: 'en', to: 'fr' },
  isFinal: true,
  at: 1_000,
  mine: false,
  ...overrides,
});

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-1',
  conversationId: 'c-1',
  media: 'audio',
  direction: 'outgoing',
  isGroup: false,
  title: 'Nadia',
  avatar: null,
  callerName: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: false,
  facing: 'user',
  screenSharing: false,
  members: {},
  display: 'full',
  localStream: null,
  remoteStreams: {},
  captions: [caption()],
  captionsMode: 'translated',
  captionPeers: [],
  preview: null,
  previewed: false,
  transcription: 'idle',
  initiatorId: null,
  invitedBy: null,
  quality: null,
  ...overrides,
});

const panel = (overrides: Partial<ActiveCall> = {}, surface: 'glass' | 'inset' = 'glass') => renderToStaticMarkup(<CallCaptionsPanel call={call(overrides)} language="fr" colorOf={colorOf} surface={surface} />);

describe('le bandeau', () => {
  test('un verre d’appel sombre — sauf posé DANS le cadre de verre d’un groupe (pas de verre sur verre)', () => {
    expect(panel()).toMatch(/<section[^>]*class="glass-call-prominent/);
    expect(panel({}, 'inset')).not.toContain('glass-call');
  });

  test('région vivante polie, texte en dir="auto"', () => {
    const html = panel();
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('dir="auto"');
  });

  test('le nom porte TOUJOURS la couleur de son auteur ; seule une phrase TRADUITE la prend, un original reste à l’encre de l’appel', () => {
    const html = panel({ captions: [caption(), caption({ id: 'w-2', speakerId: 'u-me', mine: true, translated: null, pair: null, original: 'Salut', at: 2_000 })] });
    const nadia = speakerColor('u-nadia', 'Nadia');
    const me = speakerColor('u-me', 'Nadia');
    expect(html).toContain(`<strong style="color:${nadia}">`);
    expect(html).toContain(`<strong style="color:${me}">`);
    expect(html).toContain(`<span dir="auto" style="color:${nadia}">Bonjour à tous</span>`);
    expect(html).toContain('<span dir="auto" style="color:var(--color-on-media)">Salut</span>');
    expect(panel({ captionsMode: 'original' })).toContain('<span dir="auto" style="color:var(--color-on-media)">Hello everyone</span>');
  });

  test('une ligne traduite porte l’étiquette « EN → FR » ; l’original n’en porte pas', () => {
    expect(panel()).toContain('EN → FR');
    expect(panel({ captionsMode: 'original' })).not.toContain('EN → FR');
    expect(panel({ captionsMode: 'original' })).toContain('Hello everyone');
  });

  test('une ligne en révision n’est pas annoncée', () => {
    expect(panel({ captions: [caption({ isFinal: false })] })).toContain('aria-hidden="true"');
  });
});

describe('#16665 — la capture dans le bandeau (R1)', () => {
  const karim = speakerColor('u-karim', 'Karim');

  test('« Karim · a capturé l’écran · 12:40 » : le pseudo à sa couleur, le reste à l’encre secondaire, l’heure de l’appel au bout', () => {
    const html = panel({ captions: [caption({ at: 700_000 })], journalNotes: [{ id: 'n1', kind: 'screenshot', userId: 'u-karim', name: 'Karim', at: 760_000 }] });
    expect(html).toContain('Bonjour à tous');
    expect(html).toContain(`<p class="py-1" dir="ltr" style="color:var(--color-on-media-3)" data-call-caption-note="screenshot"><strong style="color:${karim}" data-call-journal-note-name=""><bdi>Karim</bdi> · </strong>a capturé l’écran · 12:40</p>`);
  });

  test('en arabe, la note suit la direction de l’interface et isole le pseudo latin', async () => {
    await loadInterfaceCatalog('ar');
    const html = renderToStaticMarkup(<CallCaptionsPanel call={call({ captions: [], journalNotes: [{ id: 'n1', kind: 'screenshot', userId: 'u-karim', name: 'Karim', at: 760_000 }] })} language="ar" colorOf={colorOf} />);
    expect(html).toMatch(/<p class="py-1" dir="rtl"[^>]*data-call-caption-note="screenshot"><strong[^>]*><bdi>Karim<\/bdi> · <\/strong>/);
  });

  test('la phrase traduite garde sa couleur et son étiquette « EN → FR » à côté de la capture', () => {
    const html = panel({ captions: [caption({ at: 700_000 })], journalNotes: [{ id: 'n1', kind: 'screenshot', userId: 'u-karim', name: 'Karim', at: 760_000 }] });
    expect(html).toContain(`<span dir="auto" style="color:${speakerColor('u-nadia', 'Nadia')}">Bonjour à tous</span>`);
    expect(html).toContain('EN → FR');
  });

  test('le bandeau ne garde que les deux dernières entrées, phrases et captures mêlées', () => {
    const html = panel({
      captions: [caption({ id: 'old', original: 'Old', translated: 'Vieux', at: 1_000 }), caption({ id: 'new', original: 'New', translated: 'Neuf', at: 3_000 })],
      journalNotes: [{ id: 'n1', kind: 'recording', userId: 'u-karim', name: 'Karim', at: 2_000 }],
    });
    expect(html).not.toContain('Vieux');
    expect(html).toContain('enregistre l’écran');
    expect(html).toContain('Neuf');
  });

  test('l’enregistrement consenti : une phrase sans pseudo, à l’encre secondaire', () => {
    const html = panel({ captions: [], journalNotes: [{ id: 'r', kind: 'call-recording-stopped', userId: null, name: null, at: 60_000 }] });
    expect(html).toMatch(/data-call-caption-note="call-recording-stopped"[^>]*>L’enregistrement de l’appel s’est arrêté · 1:00<\/p>/);
    expect(html).not.toContain('Les sous-titres s’affichent ici');
  });
});

describe('les gestes', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(async () => {
    await loadCallControlsCatalog('fr');
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  const mount = (overrides: Partial<ActiveCall> = {}) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<CallCaptionsPanel call={call(overrides)} language="fr" colorOf={colorOf} surface="glass" />));
    const press = (selector: string) => act(() => (host.querySelector(selector) as HTMLElement | null)?.click());
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { host, press, done };
  };

  test('toucher une phrase traduite déplie son original sous elle, un second toucher le replie', () => {
    const view = mount();
    const line = view.host.querySelector('[data-call-caption-line="w-1"]');
    expect(line?.getAttribute('aria-expanded')).toBe('false');
    expect(view.host.querySelector('[data-call-caption-original]')).toBeNull();
    view.press('[data-call-caption-line="w-1"]');
    const original = view.host.querySelector('[data-call-caption-original]');
    expect(original?.textContent).toBe('Original · Hello everyone');
    expect(original?.getAttribute('dir')).toBe('ltr');
    const text = view.host.querySelector('[data-call-caption-original-text]');
    expect(text?.textContent).toBe('Hello everyone');
    expect(text?.getAttribute('dir')).toBe('auto');
    expect(text?.getAttribute('lang')).toBe('en');
    expect(view.host.querySelector('[data-call-caption-line="w-1"]')?.getAttribute('aria-expanded')).toBe('true');
    view.press('[data-call-caption-line="w-1"]');
    expect(view.host.querySelector('[data-call-caption-original]')).toBeNull();
    view.done();
  });

  test('le pied pose le bouton Journal quand l’appel peut l’ouvrir, et il l’ouvre (#17346)', () => {
    const opened: string[] = [];
    const view = mount();
    expect(view.host.querySelector('[data-call-captions-journal]')).toBeNull();
    view.done();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<CallCaptionsPanel call={call()} language="fr" colorOf={colorOf} onOpenJournal={() => opened.push('journal')} />));
    const button = host.querySelector('[data-call-captions-journal]') as HTMLElement | null;
    expect(button?.textContent).toBe('Journal');
    expect(host.querySelector('[data-call-captions-footer]')?.contains(button)).toBe(true);
    act(() => button?.click());
    expect(opened).toEqual(['journal']);
    act(() => root.unmount());
    host.remove();
  });

  test('une ligne qui EST l’original ne promet rien à déplier', () => {
    const view = mount({ captionsMode: 'original' });
    expect(view.host.querySelector('[data-call-caption-line="w-1"]')?.hasAttribute('aria-expanded')).toBe(false);
    view.done();
  });

  test('le bandeau ne montre que le direct : le Journal vit dans son panneau (#8579)', () => {
    const view = mount();
    expect(view.host.querySelector('[data-call-captions-journal-toggle]')).toBeNull();
    expect(view.host.querySelector('[data-call-journal-entry]')).toBeNull();
    view.done();
  });
});

/**
 * LA PHRASE DIT SA LANGUE, SON ATTENTE ET « MOI » (planche P3-P5, miroir d'iOS
 * `CallCaptionLine`) : l'original d'une langue hors du Prisme part tout de suite,
 * étiqueté « EN », avec trois points tant qu'une traduction est attendue ; ma ligne
 * se dit « Moi » ; la région annonce « Sous-titres de l'appel ».
 */
describe('la phrase dit sa langue d’origine et son attente de traduction', () => {
  const spanish = (until: number | null, overrides: Partial<CallCaption> = {}) =>
    caption({ id: 'w-es', original: 'Hola a todos', translated: null, pair: null, origin: { language: 'es', foreign: true, awaitingUntil: until }, ...overrides });
  const soon = () => Date.now() + 60_000;

  test('l’original d’une langue étrangère porte sa langue seule, sans flèche', () => {
    const html = panel({ captions: [spanish(null)] });
    expect(html).toMatch(/data-call-caption-languages="">ES</);
    expect(html).not.toContain('→');
    expect(html).not.toContain('data-call-caption-waiting');
  });

  test('une traduction attendue ajoute trois points, cachés, et le dit au lecteur d’écran', () => {
    const html = panel({ captions: [spanish(soon())] });
    expect(html).toMatch(/data-call-caption-waiting=""[^>]*><i[^>]*><\/i><i[^>]*><\/i><i[^>]*><\/i>/);
    expect(html).toContain('aria-hidden="true" class="ms-1.5 inline-flex');
    expect(html).toContain('<span class="sr-only">, Traduction en cours</span>');
  });

  test('l’échéance passée, les points tombent et l’étiquette de la langue reste', () => {
    const html = panel({ captions: [spanish(Date.now() - 1)] });
    expect(html).not.toContain('data-call-caption-waiting');
    expect(html).toMatch(/data-call-caption-languages="">ES</);
  });

  test('une phrase non finale n’attend rien et reste pâle ; une langue du lecteur n’est pas étiquetée', () => {
    expect(panel({ captions: [spanish(null, { isFinal: false })] })).toContain('opacity:0.7');
    const html = panel({ captions: [spanish(null, { original: 'Bonjour', origin: { language: 'fr', foreign: false, awaitingUntil: null } })] });
    expect(html).not.toContain('data-call-caption-languages');
  });

  test('la traduction arrivée remplace l’original sur place : « EN → FR », plus de points', () => {
    const html = panel({ captions: [caption({ origin: { language: 'en', foreign: true, awaitingUntil: null } })] });
    expect(html).toContain('EN → FR');
    expect(html).not.toContain('data-call-caption-waiting');
  });

  test('ma ligne se dit « Moi » (« Me » en anglais), sans étiquette de langue ; le fil garde « Vous »', async () => {
    const mine = caption({ id: 'w-me', speakerId: 'u-me', mine: true, translated: null, pair: null, original: 'Salut', origin: null });
    expect(panel({ captions: [mine] })).toContain('Moi · </strong>');
    expect(panel({ captions: [mine] })).not.toContain('Vous');
    expect(panel({ captions: [mine] })).not.toContain('data-call-caption-languages');
    await loadInterfaceCatalog('en');
    expect(renderToStaticMarkup(<CallCaptionsPanel call={call({ captions: [mine] })} language="en" colorOf={colorOf} />)).toContain('Me · </strong>');
    expect(translate('fr', 'message.author.self')).toBe('Vous');
  });

  test('la région annonce « Sous-titres de l’appel », pas la légende du bouton', () => {
    const html = panel();
    expect(html).toContain('aria-label="Sous-titres de l’appel"');
    expect(html).not.toContain('aria-label="Sous-titres"');
  });

  test('le pied dit la traduction attendue, puis les langues comptées quand il y en a plusieurs', () => {
    expect(footerOf(panel({ captions: [spanish(soon())] }))).toContain('ES · traduction en cours');
    const mixed = [caption({ id: 'a', at: 1 }), caption({ id: 'b', at: 2, translated: 'Hola', pair: { from: 'es', to: 'fr' }, original: 'Hola a todos' })];
    expect(footerOf(panel({ captions: mixed }))).toContain('Traduit · 3 langues');
  });

  test('toute la bande retient son toucher : elle ne range pas les commandes d’une scène vidéo', () => {
    expect(panel()).toMatch(/<section[^>]*data-call-chrome-keep=""/);
  });

  test('les nouveaux textes existent dans les sept langues', async () => {
    await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadInterfaceCatalog(language)));
    const keys = ['callCaptions.self', 'callCaptions.regionLabel', 'callCaptions.translating', 'callCaptions.footer.translating', 'callCaptions.footer.translatedLanguages'] as const;
    for (const key of keys) {
      const texts = SUPPORTED_INTERFACE_LANGUAGES.map((language) => translate(language, key, { language: 'ES', count: '3' }));
      expect(texts.every((text) => text !== '' && !text.includes('{'))).toBe(true);
      expect(new Set(texts).size).toBeGreaterThan(5);
    }
  });
});

describe('la voix non transcrite (#9142)', () => {
  test('la note ne nomme pas le navigateur : la coque Android n’en a pas, et la note y est permanente', async () => {
    await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadInterfaceCatalog(language)));
    const notes = SUPPORTED_INTERFACE_LANGUAGES.map((language) =>
      renderToStaticMarkup(<CallCaptionsPanel call={call({ transcription: 'unsupported' })} language={language} colorOf={colorOf} />).match(/data-call-captions-note="unsupported">([^<]*)</)?.[1] ?? '',
    );
    expect(notes.every((note) => note !== '')).toBe(true);
    expect(notes.filter((note) => /navigateur|browser|navegador|المتصفح/i.test(note))).toEqual([]);
  });
});

/**
 * #17343 · #17473 — LE PIED, COMME SUR iOS (`CallCaptionsFooter`) : il dit la paire
 * de la dernière phrase TRADUITE et le geste qui montre l'original, dans les sept
 * langues ; sans phrase traduite, il ne dit rien de plus — aucune étiquette de mode
 * qu'iOS ne pose pas. La note de la voix non transcrite (#9142) y reste.
 */
describe('le pied des sous-titres, aligné sur iOS (#17473)', () => {
  test('une phrase traduite : « EN → FR · toucher = original », sur une ligne', () => {
    const footer = footerOf(panel());
    expect(footer).toContain('EN → FR · toucher = original');
    expect(footer).toMatch(/<span class="truncate"[^>]*data-call-captions-pair="EN → FR">/);
  });

  test('sans phrase traduite, le pied ne pose aucune étiquette de mode', () => {
    for (const html of [panel({ captionsMode: 'original' }), panel({ captions: [caption({ translated: null, pair: null })] }), panel({ captions: [] })]) {
      const footer = footerOf(html);
      expect(footer).not.toContain('data-call-captions-pair');
      expect(footer).not.toContain('Traduits dans votre langue');
      expect(footer).not.toContain('Dans la langue d’origine');
    }
  });

  test('la note de la voix non transcrite reste au pied', () => {
    expect(footerOf(panel({ transcription: 'unsupported', captionsMode: 'original' }))).toContain('data-call-captions-note="unsupported"');
  });

  test('le geste est dit dans les sept langues, avec la paire en tête comme sur iOS', async () => {
    await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadInterfaceCatalog(language)));
    const footers = SUPPORTED_INTERFACE_LANGUAGES.map((language) => renderToStaticMarkup(<CallCaptionsPanel call={call()} language={language} colorOf={colorOf} />).match(/data-call-captions-pair="EN → FR"[^>]*>([^<]*)</)?.[1] ?? '');
    expect(footers).toHaveLength(7);
    expect(footers.every((footer) => footer.startsWith('EN → FR · ') && footer.length > 'EN → FR · '.length)).toBe(true);
  });
});
