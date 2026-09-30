import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { MessageCardDelivery } from '@/lib/export/deliver-message-card';
import type { MessageCardInput } from '@/lib/export/message-card-layout';
import type { MessageCardSubject } from '@/lib/export/message-card-subject';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadExportCardCatalog } from '@/lib/i18n-export-card-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { INITIAL_MESSAGE_CARD_FORMAT, MESSAGE_CARD_FORMAT_KEY } from '@/lib/export/message-card-format';
import { ALL_TEMPLATE_IDS, CARD_LINKS, CARD_PALETTE_IDS, CARD_TYPEFACE_IDS, FEATURED_TEMPLATE_IDS } from '@/lib/export/message-card-templates';
import { MESSAGE_CARD_USAGE_KEY } from '@/lib/export/message-card-usage';
import type { SafeStorage } from '@/lib/storage';

import type { MotionRecorder, SourcesLoader } from './thread-export-output';
import { MessageExportSheet } from './thread-export-sheet';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const mounter = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadExportCardCatalog('fr');
});

afterEach(() => mounter.unmountAll());

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const subject: MessageCardSubject = {
  quoted: { author: 'Awa', text: 'On se retrouve où ce soir ?', handle: 'awa' },
  reply: { author: 'Jacques', text: 'Chez Lina, à 20 h !', handle: 'jacques' },
  sentAt: new Date('2026-09-28T18:30:00.000Z'),
  quotedAt: new Date('2026-09-28T18:29:00.000Z'),
  media: [],
};

const exportLanguages = {
  codes: ['fr', 'en'],
  subjectIn: (language: string): MessageCardSubject =>
    language === 'en'
      ? { ...subject, quoted: { author: 'Awa', text: 'Where do we meet tonight?', handle: 'awa' }, reply: { author: 'Jacques', text: 'At Lina’s, 8 pm!', handle: 'jacques' } }
      : subject,
};

const memoryStorage = (initial: Record<string, string> = {}): SafeStorage & { readonly entries: Map<string, string> } => {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
};

type Harness = {
  readonly painted: MessageCardInput[];
  readonly delivered: string[];
  readonly intents: string[];
  readonly announced: string[];
  readonly closed: { count: number };
  readonly thumbnails: string[];
};

const mountSheet = async (
  options: {
    readonly delivery?: MessageCardDelivery;
    readonly paintFails?: boolean;
    readonly quick?: boolean;
    readonly title?: string | null;
    readonly storage?: SafeStorage;
    readonly random?: () => number;
    readonly languages?: boolean;
    readonly subject?: MessageCardSubject;
    readonly loadSources?: SourcesLoader;
    readonly recordMotion?: MotionRecorder;
  } = {},
) => {
  const harness: Harness = { painted: [], delivered: [], intents: [], announced: [], closed: { count: 0 }, thumbnails: [] };
  const host = await mounter.mount(
    <MessageExportSheet
      subject={options.subject ?? subject}
      loadSources={options.loadSources ?? (async () => ({ sources: [], failed: [], dispose: () => undefined }))}
      {...(options.recordMotion === undefined ? {} : { recordMotion: options.recordMotion })}
      handle="jacques"
      {...(options.languages === true ? { exportLanguages } : {})}
      conversationTitle={options.title === undefined ? 'Soirée de lancement' : options.title}
      quick={options.quick ?? false}
      random={options.random ?? (() => 0)}
      storage={options.storage ?? memoryStorage()}
      announce={(message) => harness.announced.push(message)}
      onClose={() => {
        harness.closed.count += 1;
      }}
      paint={async (input) => {
        harness.painted.push(input);
        return options.paintFails === true
          ? null
          : {
              blob: new Blob([input.template], { type: 'image/png' }),
              truncated: false,
              width: 1080,
              height: 1080,
              regions: [
                ...(input.title == null ? [] : [{ part: 'header' as const, x: 96, y: 150, width: 888, height: 46 }]),
                { part: 'quote' as const, x: 96, y: 300, width: 888, height: 120 },
                { part: 'link' as const, x: 96, y: 420, width: 888, height: 132 },
                { part: 'reply' as const, x: 96, y: 552, width: 888, height: 200 },
              ],
            };
      }}
      deliver={async (_blob, fileName, intent) => {
        harness.delivered.push(fileName);
        harness.intents.push(intent);
        return options.delivery ?? 'gallery';
      }}
      thumbnail={async (input) => {
        harness.thumbnails.push(input.template);
        return new Blob([input.template]);
      }}
      createObjectURL={() => 'blob:card'}
      revokeObjectURL={() => {}}
    />,
  );
  await mounter.settle();
  return { host, harness };
};

const openTab = async (host: HTMLElement, tab: string) => {
  await mounter.click(host.querySelector(`[data-export-tab="${tab}"]`));
  await mounter.settle();
};
const chip = (host: HTMLElement, dimension: string, value: string) => host.querySelector<HTMLButtonElement>(`[data-export-${dimension}="${value}"]`);
const previewTemplate = (host: HTMLElement): string | null => host.querySelector('[data-export-preview]')?.getAttribute('data-export-preview') ?? null;
const stored = (format: object) => memoryStorage({ [MESSAGE_CARD_FORMAT_KEY]: JSON.stringify({ ...INITIAL_MESSAGE_CARD_FORMAT, ...format }) });

describe('MessageExportSheet — voir la carte, choisir son template, l’enregistrer', () => {
  test('la carte est peinte à l’ouverture dans le template par défaut, signée du seul pseudo', async () => {
    const { host, harness } = await mountSheet();
    expect(previewTemplate(host)).toBe('aurore.rond.orbite');
    expect(harness.painted[0]?.handle).toBe('jacques');
    expect(harness.painted[0]?.quoted?.text).toBe('On se retrouve où ce soir ?');
    expect(host.textContent?.includes('Exporté par')).toBe(false);
  });

  test('le plateau n’affiche qu’un réglage à la fois : les styles d’abord, puis l’onglet choisi', async () => {
    const { host } = await mountSheet();
    expect(host.querySelector('[data-export-tab="styles"]')?.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelectorAll('[data-export-palette]').length).toBe(0);
    await openTab(host, 'palette');
    expect(host.querySelectorAll('[data-export-palette]').length).toBe(CARD_PALETTE_IDS.length);
    expect(host.querySelectorAll('[data-export-typeface]').length).toBe(0);
    await openTab(host, 'typeface');
    expect(host.querySelectorAll('[data-export-typeface]').length).toBe(CARD_TYPEFACE_IDS.length);
    await openTab(host, 'link');
    expect(host.querySelectorAll('[data-export-link]').length).toBe(CARD_LINKS.length);
    expect(chip(host, 'link', 'orbite')?.getAttribute('aria-pressed')).toBe('true');
    expect(chip(host, 'link', 'bulles')?.getAttribute('aria-pressed')).toBe('false');
  });

  test('changer une dimension garde les deux autres et repeint la carte', async () => {
    const { host, harness } = await mountSheet();
    await openTab(host, 'link');
    await mounter.click(chip(host, 'link', 'bulles'));
    await mounter.settle();
    await openTab(host, 'palette');
    await mounter.click(chip(host, 'palette', 'neige'));
    await mounter.settle();
    await openTab(host, 'typeface');
    await mounter.click(chip(host, 'typeface', 'didone'));
    await mounter.settle();
    expect(harness.painted.map((input) => input.template)).toEqual(['aurore.rond.orbite', 'aurore.rond.bulles', 'neige.rond.bulles', 'neige.didone.bulles']);
    expect(previewTemplate(host)).toBe('neige.didone.bulles');
  });

  test('toucher une partie de la carte ouvre son réglage, et la signale', async () => {
    const { host } = await mountSheet();
    expect(host.querySelector('[data-export-hint]') !== null).toBe(true);
    const cases: readonly (readonly [string, string])[] = [
      ['background', 'palette'],
      ['link', 'link'],
      ['quote', 'typeface'],
      ['reply', 'typeface'],
    ];
    for (const [part, tab] of cases) {
      await mounter.click(host.querySelector(`[data-export-part="${part}"]`));
      await mounter.settle();
      expect(host.querySelector(`[data-export-tab="${tab}"]`)?.getAttribute('aria-selected')).toBe('true');
      expect(host.querySelector(`[data-export-part="${part}"]`)?.getAttribute('aria-pressed')).toBe('true');
    }
    expect(host.querySelector('[data-export-hint]')).toBeNull();
  });

  test('l’en-tête n’est une zone que s’il est peint, et ouvre l’onglet Frame (#8693)', async () => {
    const { host } = await mountSheet();
    expect(host.querySelector('[data-export-part="header"]')).toBeNull();
    await openTab(host, 'details');
    await mounter.click(host.querySelector('[data-export-option="showConversationTitle"]'));
    await mounter.settle();
    await openTab(host, 'styles');
    await mounter.click(host.querySelector('[data-export-part="header"]'));
    await mounter.settle();
    expect(host.querySelector('[data-export-tab="frame"]')?.getAttribute('aria-selected')).toBe('true');
  });

  test('toucher la citation ou la réponse offre SON anonymat, et lui seul', async () => {
    const { host, harness } = await mountSheet();
    await mounter.click(host.querySelector('[data-export-part="quote"]'));
    await mounter.settle();
    await mounter.click(host.querySelector('[data-export-anonymize="quote"]'));
    await mounter.settle();
    const quoted = harness.painted[harness.painted.length - 1];
    expect([quoted?.quoted?.author, quoted?.reply.author]).toEqual(['Anonyme', 'Jacques']);
    await mounter.click(host.querySelector('[data-export-part="reply"]'));
    await mounter.settle();
    expect(host.querySelector('[data-export-anonymize="quote"]')).toBeNull();
    await mounter.click(host.querySelector('[data-export-anonymize="reply"]'));
    await mounter.settle();
    const both = harness.painted[harness.painted.length - 1];
    expect([both?.quoted?.author, both?.reply.author, both?.handle]).toEqual(['Anonyme', 'Anonyme', 'jacques']);
  });

  test('la galerie montre les vraies cartes, se cherche et applique le style touché', async () => {
    const { host, harness } = await mountSheet();
    await mounter.click(host.querySelector('[data-export-gallery]'));
    await mounter.settle();
    expect(host.querySelector('[data-export-count]')?.getAttribute('data-export-count')).toBe(String(ALL_TEMPLATE_IDS.length));
    mounter.type(host, '[data-export-search]', 'pêche flèche');
    await mounter.settle();
    const found = Array.from(host.querySelectorAll('[data-export-gallery-template]')).map((node) => node.getAttribute('data-export-gallery-template'));
    expect(found.length).toBe(CARD_TYPEFACE_IDS.length);
    expect(found.every((id) => id?.startsWith('peche.') === true && id.endsWith('.fleche'))).toBe(true);
    await mounter.click(host.querySelector('[data-export-gallery-template="peche.plume.fleche"]'));
    await mounter.settle();
    expect(host.querySelector('[data-export-gallery-sheet]')).toBeNull();
    expect(harness.painted[harness.painted.length - 1]?.template).toBe('peche.plume.fleche');
  });

  test('une recherche qui ne nomme rien le dit', async () => {
    const { host } = await mountSheet();
    await mounter.click(host.querySelector('[data-export-gallery]'));
    await mounter.settle();
    mounter.type(host, '[data-export-search]', 'zzz');
    await mounter.settle();
    expect(host.querySelector('[data-export-gallery-empty]') !== null).toBe(true);
  });

  test('les tons filtrent la galerie : sombres ou clairs', async () => {
    const { host } = await mountSheet();
    await mounter.click(host.querySelector('[data-export-gallery]'));
    await mounter.settle();
    await mounter.click(host.querySelector('[data-export-tone="light"]'));
    await mounter.settle();
    expect(host.querySelector('[data-export-count]')?.getAttribute('data-export-count')).toBe(String(ALL_TEMPLATE_IDS.length / 2));
  });

  test('un appareil neuf voit la vitrine en « Populaires » ; ensuite, ses plus utilisés d’abord', async () => {
    const fresh = await mountSheet();
    const shown = (host: HTMLElement) => Array.from(host.querySelectorAll('[data-export-template]')).map((node) => node.getAttribute('data-export-template'));
    expect(shown(fresh.host)).toEqual([...FEATURED_TEMPLATE_IDS]);
    mounter.unmountAll();
    const storage = memoryStorage({ [MESSAGE_CARD_USAGE_KEY]: JSON.stringify({ 'braise.marqueur.silence': 4, 'lagon.futur.filet': 1 }) });
    const used = await mountSheet({ storage });
    expect(shown(used.host).slice(0, 2)).toEqual(['braise.marqueur.silence', 'lagon.futur.filet']);
  });

  test('« Au hasard » tire un template parmi tous', async () => {
    const { host, harness } = await mountSheet({ random: () => 0.9999 });
    await mounter.click(host.querySelector('[data-export-random]'));
    await mounter.settle();
    expect(harness.painted[harness.painted.length - 1]?.template).toBe(ALL_TEMPLATE_IDS[ALL_TEMPLATE_IDS.length - 1] ?? '');
  });

  test('« Enregistrer » dépose l’image dans la galerie, l’annonce, compte le template et referme', async () => {
    const storage = memoryStorage();
    const { host, harness } = await mountSheet({ delivery: 'gallery', storage });
    await mounter.click(host.querySelector('[data-export-save]'));
    await mounter.settle();
    expect(harness.delivered.length).toBe(1);
    expect(harness.delivered[0]?.endsWith('.png')).toBe(true);
    expect(harness.intents).toEqual(['save']);
    expect(harness.announced).toEqual(['Image enregistrée dans la galerie']);
    expect(JSON.parse(storage.entries.get(MESSAGE_CARD_USAGE_KEY) ?? '{}')).toEqual({ 'aurore.rond.orbite': 1 });
    expect(harness.closed.count).toBe(1);
  });

  test('une feuille de partage fermée garde la carte ouverte, et ne compte rien', async () => {
    const storage = memoryStorage();
    const { host, harness } = await mountSheet({ delivery: 'cancelled', storage });
    await mounter.click(host.querySelector('[data-export-save]'));
    await mounter.settle();
    expect(harness.announced).toEqual(['Export annulé']);
    expect(harness.closed.count).toBe(0);
    expect(storage.entries.has(MESSAGE_CARD_USAGE_KEY)).toBe(false);
  });

  test('une carte qui ne se peint pas le dit, et n’offre rien à enregistrer', async () => {
    const { host } = await mountSheet({ paintFails: true });
    expect(host.querySelector('[data-export-failed]') !== null).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-export-save]')?.disabled).toBe(true);
  });

  test('les options montrent le titre de la conversation et la date, ou masquent les auteurs', async () => {
    const { host, harness } = await mountSheet();
    expect(harness.painted[0]?.title ?? null).toBeNull();
    await openTab(host, 'details');
    await mounter.click(host.querySelector('[data-export-option="showConversationTitle"]'));
    await mounter.settle();
    await openTab(host, 'frame');
    await mounter.click(host.querySelector('[data-export-option="showDate"]'));
    await mounter.settle();
    await openTab(host, 'details');
    await mounter.click(host.querySelector('[data-export-option="showAuthors"]'));
    await mounter.settle();
    const last = harness.painted[harness.painted.length - 1];
    expect(last?.title).toBe('Soirée de lancement');
    expect(last?.date).toBe('28 septembre 2026');
    expect(last?.showAuthors).toBe(false);
  });

  test('chaque auteur s’anonymise séparément, et le filigrane reste', async () => {
    const { host, harness } = await mountSheet();
    await openTab(host, 'frame');
    await mounter.click(host.querySelector('[data-export-option="anonymizeQuoted"]'));
    await mounter.settle();
    const quotedOnly = harness.painted[harness.painted.length - 1];
    expect([quotedOnly?.quoted?.author, quotedOnly?.reply.author]).toEqual(['Anonyme', 'Jacques']);
    await mounter.click(host.querySelector('[data-export-option="anonymizeReply"]'));
    await mounter.settle();
    const both = harness.painted[harness.painted.length - 1];
    expect([both?.quoted?.author, both?.reply.author, both?.handle]).toEqual(['Anonyme', 'Anonyme', 'jacques']);
  });

  test('sans les noms des auteurs, l’anonymat ne s’offre pas', async () => {
    const { host } = await mountSheet();
    await openTab(host, 'details');
    await mounter.click(host.querySelector('[data-export-option="showAuthors"]'));
    await mounter.settle();
    await openTab(host, 'frame');
    expect(host.querySelector('[data-export-option="anonymizeQuoted"]')).toBeNull();
    expect(host.querySelector('[data-export-option="anonymizeReply"]')).toBeNull();
    await mounter.click(host.querySelector('[data-export-part="reply"]'));
    await mounter.settle();
    expect(host.querySelector('[data-export-anonymize]')).toBeNull();
  });

  test('une conversation sans titre n’offre pas l’option du titre', async () => {
    const { host } = await mountSheet({ title: null });
    await openTab(host, 'details');
    expect(host.querySelector('[data-export-option="showConversationTitle"]') === null).toBe(true);
    expect(host.querySelectorAll('[data-export-option]').length).toBe(1);
  });

  test('« Utiliser comme format par défaut » l’enregistre sur l’appareil et le dit', async () => {
    const storage = memoryStorage();
    const { host, harness } = await mountSheet({ storage });
    await openTab(host, 'palette');
    await mounter.click(chip(host, 'palette', 'editorial'));
    await mounter.settle();
    await mounter.click(host.querySelector('[data-export-default]'));
    await mounter.settle();
    expect(JSON.parse(storage.entries.get(MESSAGE_CARD_FORMAT_KEY) ?? '{}').template).toBe('editorial.rond.orbite');
    expect(harness.announced).toEqual(['Format par défaut enregistré']);
    expect(host.querySelector<HTMLButtonElement>('[data-export-default]')?.disabled).toBe(true);
  });

  test('la feuille s’ouvre dans le format par défaut enregistré', async () => {
    const { harness } = await mountSheet({ storage: stored({ template: 'manuscrit.plume.fil', showConversationTitle: true, anonymizeReply: true }) });
    expect(harness.painted[0]?.template).toBe('manuscrit.plume.fil');
    expect(harness.painted[0]?.title).toBe('Soirée de lancement');
    expect(harness.painted[0]?.reply.author).toBe('Anonyme');
  });

  test('« Export rapide » enregistre la carte dès qu’elle est peinte, sans autre geste', async () => {
    const { harness } = await mountSheet({ storage: stored({ template: 'editorial.didone.guillemets', showDate: true }), quick: true });
    expect(harness.painted.map((input) => input.template)).toEqual(['editorial.didone.guillemets']);
    expect(harness.delivered.length).toBe(1);
    expect(harness.closed.count).toBe(1);
  });

  test('deux boutons à la fin : « Sauvegarder » et « Partager »', async () => {
    const { host } = await mountSheet();
    expect(host.querySelector('[data-export-save]')?.textContent).toBe('Sauvegarder');
    expect(host.querySelector('[data-export-share]')?.textContent).toBe('Partager');
  });

  test('« Partager » ouvre la feuille du système, compte le template et referme', async () => {
    const storage = memoryStorage();
    const { host, harness } = await mountSheet({ delivery: 'shared', storage });
    await mounter.click(host.querySelector('[data-export-share]'));
    await mounter.settle();
    expect(harness.intents).toEqual(['share']);
    expect(harness.announced).toEqual(['Image prête']);
    expect(JSON.parse(storage.entries.get(MESSAGE_CARD_USAGE_KEY) ?? '{}')).toEqual({ 'aurore.rond.orbite': 1 });
    expect(harness.closed.count).toBe(1);
  });

  test('après le format, la langue : la carte part comme je la lis, ou dans une langue choisie', async () => {
    const { host, harness } = await mountSheet({ languages: true });
    const tabs = Array.from(host.querySelectorAll('[data-export-tab]')).map((node) => node.getAttribute('data-export-tab'));
    expect(tabs.at(-1)).toBe('language');
    await openTab(host, 'language');
    expect(host.querySelector('[data-export-language=""]')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelectorAll('[data-export-language]').length).toBe(3);
    await mounter.click(host.querySelector('[data-export-language="en"]'));
    await mounter.settle();
    const last = harness.painted[harness.painted.length - 1];
    expect([last?.quoted?.text, last?.reply.text]).toEqual(['Where do we meet tonight?', 'At Lina’s, 8 pm!']);
  });

  test('un message dans une seule langue n’offre pas de choix de langue', async () => {
    const { host } = await mountSheet();
    expect(host.querySelector('[data-export-tab="language"]')).toBeNull();
  });
});

describe('« Imagine » — l’atelier d’« Imager » (#8693)', () => {
  const withVideo: MessageCardSubject = {
    ...subject,
    media: [
      { id: 'v', card: { kind: 'video', width: 1920, height: 1080 }, url: '/v.mp4', mimeType: 'video/mp4', posterUrl: '/v.jpg' },
      { id: 'i', card: { kind: 'image', width: 800, height: 600 }, url: '/i.jpg', mimeType: 'image/jpeg', posterUrl: null },
    ],
  };
  const withVoice: MessageCardSubject = {
    ...subject,
    media: [{ id: 'a', card: { kind: 'audio', durationMs: 8000, name: 'note.m4a', peaks: [1, 2, 3] }, url: '/a.m4a', mimeType: 'audio/mp4', posterUrl: null }],
  };
  const outputsOf = (host: HTMLElement) => [...host.querySelectorAll('[data-export-output]')].map((el) => el.getAttribute('data-export-output'));

  test('l’atelier est titré « Imagine »', async () => {
    const { host } = await mountSheet();
    expect(host.ownerDocument.body.textContent?.includes('Imagine')).toBe(true);
  });

  test('l’onglet Frame vient AVANT Fond ; Médias n’apparaît que si la carte en porte', async () => {
    const { host } = await mountSheet();
    const tabs = [...host.querySelectorAll('[data-export-tab]')].map((el) => el.getAttribute('data-export-tab'));
    expect(tabs.indexOf('frame')).toBe(tabs.indexOf('palette') - 1);
    expect(tabs).not.toContain('media');
    const media = await mountSheet({ subject: withVideo });
    expect([...media.host.querySelectorAll('[data-export-tab]')].map((el) => el.getAttribute('data-export-tab'))).toContain('media');
  });

  test('le FORMAT de l’image se choisit dans Frame et part dans la carte', async () => {
    const { host, harness } = await mountSheet();
    expect(harness.painted[0]?.aspect).toBe('auto');
    await openTab(host, 'frame');
    for (const aspect of ['story', 'portrait', 'square', 'landscape']) expect(chip(host, 'aspect', aspect)).not.toBeNull();
    await mounter.click(chip(host, 'aspect', 'landscape'));
    await mounter.settle();
    expect(harness.painted[harness.painted.length - 1]?.aspect).toBe('landscape');
    expect(chip(host, 'aspect', 'landscape')?.getAttribute('aria-checked')).toBe('true');
  });

  test('Frame : noms à la fin, heures des messages, rotation, pseudo au lieu du nom affiché', async () => {
    const { host, harness } = await mountSheet();
    await openTab(host, 'frame');
    await mounter.click(host.querySelector('[data-export-option="showTimes"]'));
    await mounter.settle();
    await mounter.click(chip(host, 'authors-at', 'end'));
    await mounter.settle();
    await mounter.click(chip(host, 'tilt', 'left'));
    await mounter.settle();
    await mounter.click(host.querySelector('[data-export-option="usePseudonyms"]'));
    await mounter.settle();
    const last = harness.painted[harness.painted.length - 1];
    expect(last?.frame).toEqual({ header: 'horizontal', authors: 'end', tilt: 'left' });
    expect(last?.reply.author).toBe('@jacques');
    expect(last?.quoted?.author).toBe('@awa');
    expect(typeof last?.reply.time).toBe('string');
    expect(last?.reply.time).not.toBe('');
  });

  test('l’en-tête ne se couche que s’il est peint', async () => {
    const { host, harness } = await mountSheet();
    await openTab(host, 'frame');
    expect(host.querySelector('[data-export-group="header"]')).toBeNull();
    await mounter.click(host.querySelector('[data-export-option="showDate"]'));
    await mounter.settle();
    await mounter.click(chip(host, 'header', 'letters'));
    await mounter.settle();
    expect(harness.painted[harness.painted.length - 1]?.frame?.header).toBe('letters');
  });

  test('les médias partent dans la carte ; leurs pixels arrivent ensuite et la carte se repeint', async () => {
    const loaded: string[][] = [];
    const bitmap = { width: 10, height: 10 } as unknown as CanvasImageSource;
    const { harness } = await mountSheet({
      subject: withVideo,
      loadSources: async (items) => {
        loaded.push(items.map((item) => item.id));
        return { sources: [bitmap, null], failed: [], dispose: () => undefined };
      },
    });
    await mounter.settle();
    expect(loaded).toEqual([['v', 'i']]);
    expect(harness.painted[0]?.media?.map((item) => item.kind)).toEqual(['video', 'image']);
    expect(harness.painted.length).toBeGreaterThanOrEqual(2);
  });

  test('« Imager rapide » attend les pixels des médias : jamais une carte aux cadres vides', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { harness } = await mountSheet({
      subject: withVideo,
      quick: true,
      loadSources: async () => {
        await gate;
        return { sources: [null, null], failed: [], dispose: () => undefined };
      },
    });
    await mounter.settle();
    expect(harness.delivered).toEqual([]);
    (release as (() => void) | null)?.();
    await mounter.settle();
    await mounter.settle();
    expect(harness.delivered).toHaveLength(1);
  });

  test('un média qui ne se charge pas le DIT, et « Réessayer » le recharge (#8901)', async () => {
    const bitmap = { width: 10, height: 10 } as unknown as CanvasImageSource;
    let attempts = 0;
    const { host, harness } = await mountSheet({
      subject: withVideo,
      loadSources: async () => {
        attempts += 1;
        return attempts === 1 ? { sources: [null, bitmap], failed: ['v'], dispose: () => undefined } : { sources: [bitmap, bitmap], failed: [], dispose: () => undefined };
      },
    });
    await mounter.settle();
    const alert = host.querySelector('[data-export-media-failed]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('Un média n’a pas pu se charger');
    const painted = harness.painted.length;
    await mounter.click(host.querySelector('[data-export-media-retry]'));
    await mounter.settle();
    await mounter.settle();
    expect(attempts).toBe(2);
    expect(host.querySelector('[data-export-media-failed]')).toBeNull();
    expect(harness.painted.length).toBeGreaterThan(painted);
  });

  test('un chargeur qui échoue en bloc dit l’échec de chaque média visuel, jamais un cadre vide muet', async () => {
    const { host } = await mountSheet({ subject: withVideo, loadSources: async () => Promise.reject(new Error('offline')) });
    await mounter.settle();
    await mounter.settle();
    expect(host.querySelector('[data-export-media-failed]')?.textContent).toContain('2 médias n’ont pas pu se charger');
  });

  test('« Imager rapide » ne part pas avec un média en échec : il attend « Réessayer »', async () => {
    const { host, harness } = await mountSheet({ subject: withVideo, quick: true, loadSources: async () => ({ sources: [null, null], failed: ['v', 'i'], dispose: () => undefined }) });
    await mounter.settle();
    await mounter.settle();
    expect(harness.delivered).toEqual([]);
    expect(host.querySelector('[data-export-media-retry]')).not.toBeNull();
  });

  test('Médias : disposition des images et représentation de l’audio', async () => {
    const video = await mountSheet({ subject: withVideo });
    await openTab(video.host, 'media');
    expect(chip(video.host, 'media-style', 'bande')).not.toBeNull();
    expect(video.host.querySelector('[data-export-audio-style]')).toBeNull();
    await mounter.click(chip(video.host, 'media-style', 'bande'));
    await mounter.settle();
    expect(video.harness.painted[video.harness.painted.length - 1]?.mediaStyle).toBe('bande');

    const voice = await mountSheet({ subject: withVoice });
    await openTab(voice.host, 'media');
    for (const style of ['onde', 'spectre', 'pastille', 'etiquette']) expect(chip(voice.host, 'audio-style', style)).not.toBeNull();
    await mounter.click(chip(voice.host, 'audio-style', 'pastille'));
    await mounter.settle();
    expect(voice.harness.painted[voice.harness.painted.length - 1]?.audioStyle).toBe('pastille');
  });

  test('avant d’enregistrer : Image · GIF · Vidéo pour une vidéo, Image · Vidéo pour un audio, rien pour un texte', async () => {
    expect(outputsOf((await mountSheet()).host)).toEqual([]);
    expect(outputsOf((await mountSheet({ subject: withVideo })).host)).toEqual(['image', 'gif', 'video']);
    expect(outputsOf((await mountSheet({ subject: withVoice })).host)).toEqual(['image', 'video']);
  });

  test('« Vidéo » fabrique la vidéo de la carte, la livre sous son extension, et ne la refilme pas au second geste', async () => {
    const recorded: string[] = [];
    const { host, harness } = await mountSheet({
      subject: withVoice,
      delivery: 'expired',
      recordMotion: async ({ output, item }) => {
        recorded.push(`${output}:${item.id}`);
        return new Blob(['v'], { type: 'video/mp4' });
      },
    });
    await mounter.click(host.querySelector('[data-export-output="video"]'));
    await mounter.settle();
    await mounter.click(host.querySelector('[data-export-save]'));
    await mounter.settle();
    await mounter.click(host.querySelector('[data-export-save]'));
    await mounter.settle();
    expect(recorded).toEqual(['video:a']);
    expect(harness.delivered.every((name) => name.endsWith('.mp4'))).toBe(true);
    expect(harness.delivered).toHaveLength(2);
  });

  test('un navigateur qui ne sait pas animer le dit, sans rien livrer', async () => {
    const { host, harness } = await mountSheet({ subject: withVideo, recordMotion: async () => null });
    await mounter.click(host.querySelector('[data-export-output="gif"]'));
    await mounter.settle();
    await mounter.click(host.querySelector('[data-export-save]'));
    await mounter.settle();
    expect(harness.delivered).toEqual([]);
    expect(harness.announced).toContain('Ce navigateur ne sait pas créer cette animation');
  });

  test('la miniature montre la carte ENTIÈRE — rien de rogné, le séparateur compris', async () => {
    const original = globalThis.IntersectionObserver;
    /* Un observateur qui voit tout : chaque vignette entre à l'écran aussitôt observée. */
    class SeeingObserver {
      constructor(private readonly callback: (entries: { readonly isIntersecting: boolean }[]) => void) {}
      observe() {
        this.callback([{ isIntersecting: true }]);
      }
      disconnect() {}
    }
    globalThis.IntersectionObserver = SeeingObserver as unknown as typeof IntersectionObserver;
    try {
      const { host } = await mountSheet();
      await mounter.settle();
      await mounter.settle();
      const thumb = host.querySelector('[data-export-template] img');
      expect(thumb?.className.includes('object-contain')).toBe(true);
      expect(thumb?.className.includes('object-cover')).toBe(false);
    } finally {
      globalThis.IntersectionObserver = original;
    }
  });
});
