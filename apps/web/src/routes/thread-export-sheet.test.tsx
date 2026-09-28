import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { MessageCardDelivery } from '@/lib/export/deliver-message-card';
import type { MessageCardInput } from '@/lib/export/message-card-layout';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

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
};

type Harness = {
  readonly painted: MessageCardInput[];
  readonly delivered: string[];
  readonly announced: string[];
  readonly closed: { count: number };
};

const mountSheet = async (options: { readonly delivery?: MessageCardDelivery; readonly paintFails?: boolean } = {}) => {
  const harness: Harness = { painted: [], delivered: [], announced: [], closed: { count: 0 } };
  const host = await mounter.mount(
    <MessageExportSheet
      subject={subject}
      exporter="Jacques"
      announce={(message) => harness.announced.push(message)}
      onClose={() => {
        harness.closed.count += 1;
      }}
      paint={async (input) => {
        harness.painted.push(input);
        return options.paintFails === true ? null : { blob: new Blob([input.style], { type: 'image/png' }), truncated: false };
      }}
      deliver={async (_blob, fileName) => {
        harness.delivered.push(fileName);
        return options.delivery ?? 'gallery';
      }}
      createObjectURL={() => 'blob:card'}
      revokeObjectURL={() => {}}
    />,
  );
  await mounter.settle();
  return { host, harness };
};

const styleButton = (host: HTMLElement, style: string) => host.querySelector<HTMLButtonElement>(`[data-export-style="${style}"]`);
const previewStyle = (host: HTMLElement): string | null => host.querySelector('[data-export-preview]')?.getAttribute('data-export-preview') ?? null;

describe('MessageExportSheet — voir la carte, choisir son style, l’enregistrer', () => {
  test('la carte est peinte à l’ouverture dans le premier style, signée par l’exportateur', async () => {
    const { host, harness } = await mountSheet();
    expect(previewStyle(host)).toBe('aurore');
    expect(harness.painted[0]?.exporter).toBe('Jacques');
    expect(harness.painted[0]?.footerLabel).toBe('Exporté par Jacques');
    expect(harness.painted[0]?.quoted?.text).toBe('On se retrouve où ce soir ?');
  });

  test('trois styles sont proposés, le choisi est enfoncé', async () => {
    const { host } = await mountSheet();
    expect(host.querySelectorAll('[data-export-style]').length).toBe(3);
    expect(styleButton(host, 'aurore')?.getAttribute('aria-pressed')).toBe('true');
    expect(styleButton(host, 'editorial')?.getAttribute('aria-pressed')).toBe('false');
  });

  test('changer de style repeint la carte', async () => {
    const { host, harness } = await mountSheet();
    await mounter.click(styleButton(host, 'manuscrit'));
    await mounter.settle();
    expect(harness.painted.map((input) => input.style)).toEqual(['aurore', 'manuscrit']);
    expect(previewStyle(host)).toBe('manuscrit');
  });

  test('« Enregistrer » dépose l’image dans la galerie, l’annonce et referme la feuille', async () => {
    const { host, harness } = await mountSheet({ delivery: 'gallery' });
    await mounter.click(host.querySelector('[data-export-save]'));
    await mounter.settle();
    expect(harness.delivered.length).toBe(1);
    expect(harness.delivered[0]?.endsWith('.png')).toBe(true);
    expect(harness.announced).toEqual(['Image enregistrée dans la galerie']);
    expect(harness.closed.count).toBe(1);
  });

  test('une feuille de partage fermée garde la carte ouverte', async () => {
    const { host, harness } = await mountSheet({ delivery: 'cancelled' });
    await mounter.click(host.querySelector('[data-export-save]'));
    await mounter.settle();
    expect(harness.announced).toEqual(['Export annulé']);
    expect(harness.closed.count).toBe(0);
  });

  test('une carte qui ne se peint pas le dit, et n’offre rien à enregistrer', async () => {
    const { host } = await mountSheet({ paintFails: true });
    expect(host.querySelector('[data-export-failed]') !== null).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-export-save]')?.disabled).toBe(true);
  });
});
