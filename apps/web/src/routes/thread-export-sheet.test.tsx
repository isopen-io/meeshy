import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { MessageCardDelivery } from '@/lib/export/deliver-message-card';
import type { MessageCardInput } from '@/lib/export/message-card-layout';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { INITIAL_MESSAGE_CARD_FORMAT, MESSAGE_CARD_FORMAT_KEY } from '@/lib/export/message-card-format';
import { ALL_TEMPLATE_IDS, CARD_LINKS, CARD_PALETTE_IDS, CARD_TYPEFACE_IDS, FEATURED_TEMPLATE_IDS } from '@/lib/export/message-card-templates';
import { MESSAGE_CARD_USAGE_KEY } from '@/lib/export/message-card-usage';
import type { SafeStorage } from '@/lib/storage';

import { MessageExportSheet } from './thread-export-sheet';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const mounter = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterEach(() => mounter.unmountAll());

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const subject = {
  quoted: { author: 'Awa', text: 'On se retrouve où ce soir ?' },
  reply: { author: 'Jacques', text: 'Chez Lina, à 20 h !' },
  sentAt: new Date('2026-09-28T18:30:00.000Z'),
};

const exportLanguages = {
  codes: ['fr', 'en'],
  subjectIn: (language: string) =>
    language === 'en'
      ? { quoted: { author: 'Awa', text: 'Where do we meet tonight?' }, reply: { author: 'Jacques', text: 'At Lina’s, 8 pm!' }, sentAt: subject.sentAt }
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
  } = {},
) => {
  const harness: Harness = { painted: [], delivered: [], intents: [], announced: [], closed: { count: 0 } };
  const host = await mounter.mount(
    <MessageExportSheet
      subject={subject}
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
        return options.paintFails === true ? null : { blob: new Blob([input.template], { type: 'image/png' }), truncated: false };
      }}
      deliver={async (_blob, fileName, intent) => {
        harness.delivered.push(fileName);
        harness.intents.push(intent);
        return options.delivery ?? 'gallery';
      }}
      createObjectURL={() => 'blob:card'}
      revokeObjectURL={() => {}}
    />,
  );
  await mounter.settle();
  return { host, harness };
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

  test('chaque dimension du template se choisit : couleurs, typographie, liaison', async () => {
    const { host } = await mountSheet();
    expect(host.querySelectorAll('[data-export-palette]').length).toBe(CARD_PALETTE_IDS.length);
    expect(host.querySelectorAll('[data-export-typeface]').length).toBe(CARD_TYPEFACE_IDS.length);
    expect(host.querySelectorAll('[data-export-link]').length).toBe(CARD_LINKS.length);
    expect(chip(host, 'palette', 'aurore')?.getAttribute('aria-pressed')).toBe('true');
    expect(chip(host, 'link', 'bulles')?.getAttribute('aria-pressed')).toBe('false');
  });

  test('changer une dimension garde les deux autres et repeint la carte', async () => {
    const { host, harness } = await mountSheet();
    await mounter.click(chip(host, 'link', 'bulles'));
    await mounter.settle();
    await mounter.click(chip(host, 'palette', 'neige'));
    await mounter.settle();
    await mounter.click(chip(host, 'typeface', 'didone'));
    await mounter.settle();
    expect(harness.painted.map((input) => input.template)).toEqual(['aurore.rond.orbite', 'aurore.rond.bulles', 'neige.rond.bulles', 'neige.didone.bulles']);
    expect(previewTemplate(host)).toBe('neige.didone.bulles');
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
    await mounter.click(host.querySelector('[data-export-option="showConversationTitle"]'));
    await mounter.settle();
    await mounter.click(host.querySelector('[data-export-option="showDate"]'));
    await mounter.settle();
    await mounter.click(host.querySelector('[data-export-option="showAuthors"]'));
    await mounter.settle();
    const last = harness.painted[harness.painted.length - 1];
    expect(last?.title).toBe('Soirée de lancement');
    expect(last?.date).toBe('28 septembre 2026');
    expect(last?.showAuthors).toBe(false);
  });

  test('chaque auteur s’anonymise séparément, et le filigrane reste', async () => {
    const { host, harness } = await mountSheet();
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
    await mounter.click(host.querySelector('[data-export-option="showAuthors"]'));
    await mounter.settle();
    expect(host.querySelector('[data-export-option="anonymizeQuoted"]')).toBeNull();
    expect(host.querySelector('[data-export-option="anonymizeReply"]')).toBeNull();
  });

  test('une conversation sans titre n’offre pas l’option du titre', async () => {
    const { host } = await mountSheet({ title: null });
    expect(host.querySelector('[data-export-option="showConversationTitle"]') === null).toBe(true);
    expect(host.querySelectorAll('[data-export-option]').length).toBe(4);
  });

  test('« Utiliser comme format par défaut » l’enregistre sur l’appareil et le dit', async () => {
    const storage = memoryStorage();
    const { host, harness } = await mountSheet({ storage });
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
    expect(host.querySelector('[data-export-language=""]')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelectorAll('[data-export-language]').length).toBe(3);
    await mounter.click(host.querySelector('[data-export-language="en"]'));
    await mounter.settle();
    const last = harness.painted[harness.painted.length - 1];
    expect([last?.quoted?.text, last?.reply.text]).toEqual(['Where do we meet tonight?', 'At Lina’s, 8 pm!']);
    const rows = Array.from(host.querySelectorAll('[role="group"]')).map((group) => group.getAttribute('aria-label'));
    expect(rows.indexOf('Langue du message') > rows.indexOf('Liaison')).toBe(true);
  });

  test('un message dans une seule langue n’offre pas de choix de langue', async () => {
    const { host } = await mountSheet();
    expect(host.querySelector('[data-export-language]')).toBeNull();
  });
});
