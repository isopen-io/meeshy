import { describe, expect, test } from 'bun:test';

import { copyText, downloadTextFile } from '@/lib/admin/download-text';
import type { FileDeliveryHost } from '@/lib/media/file-delivery-host';

/**
 * L'EXPORT YAML ATTEINT L'ADMIN DANS LA COQUE (#10563) — la WebView de
 * `@capacitor/android` ne branche aucun `DownloadListener` : l'ancre
 * `<a download>` y est un clic sans effet. Le fichier passe par le portail de
 * livraison, comme l'export de données (#7864), et l'écran dit ce qui s'est
 * réellement passé.
 */

const sharingHost = (shared: File[], refusal?: Error): FileDeliveryHost => ({
  canShareFiles: () => true,
  shareFiles: async ({ files }) => {
    if (refusal !== undefined) throw refusal;
    shared.push(...files);
  },
});

const anchorHost = (clicked: string[]): Pick<FileDeliveryHost, 'document' | 'createObjectURL' | 'revokeObjectURL'> => ({
  document: {
    createElement: (() => {
      const anchor = { href: '', download: '', click: () => clicked.push(anchor.download) };
      return anchor;
    }) as unknown as Document['createElement'],
    body: { appendChild: (node) => node, removeChild: (node) => node } as Pick<HTMLElement, 'appendChild' | 'removeChild'>,
  },
  createObjectURL: () => 'blob:test',
  revokeObjectURL: () => undefined,
});

describe('le YAML de l’export des saisons se livre par le portail (#10563)', () => {
  test('dans la coque, sans ancre, le fichier part au pont de partage', async () => {
    const shared: File[] = [];
    const outcome = await downloadTextFile({ name: 'andp-app-events-r5.yaml', text: 'app_events: []\n', host: sharingHost(shared) });
    expect(outcome).toBe('delivered');
    expect(shared.map((file) => file.name)).toEqual(['andp-app-events-r5.yaml']);
    expect(shared[0]?.type).toBe('text/yaml;charset=utf-8');
    expect(await shared[0]?.text()).toBe('app_events: []\n');
  });

  test('un hôte sans aucune porte ne prétend pas avoir livré', async () => {
    expect(await downloadTextFile({ name: 'app-events.yaml', text: 'x', host: {} })).toBe('unavailable');
  });

  test('une feuille de partage fermée est une annulation, pas un échec', async () => {
    const refusal = Object.assign(new Error('fermée'), { name: 'AbortError' });
    expect(await downloadTextFile({ name: 'app-events.yaml', text: 'x', host: sharingHost([], refusal) })).toBe('cancelled');
  });

  test('dans le navigateur, l’ancre télécharge, sans ouvrir la feuille de partage', async () => {
    const clicked: string[] = [];
    const shared: File[] = [];
    const outcome = await downloadTextFile({ name: 'app-events.yaml', text: 'x', host: { ...anchorHost(clicked), ...sharingHost(shared) } });
    expect(outcome).toBe('delivered');
    expect(clicked).toEqual(['app-events.yaml']);
    expect(shared).toEqual([]);
  });
});

describe('le YAML de l’export se copie avec le repli des autres copies (#10591)', () => {
  const refused = async () => {
    throw Object.assign(new Error('refusé'), { name: 'NotAllowedError' });
  };

  test('un writeText refusé par la WebView retombe sur la copie historique', async () => {
    const copied: string[] = [];
    const ok = await copyText('app_events: []\n', { writeText: refused, legacyCopy: (text) => copied.push(text) > 0 });
    expect(ok).toBe(true);
    expect(copied).toEqual(['app_events: []\n']);
  });

  test('sans presse-papiers asynchrone, la copie historique suffit', async () => {
    expect(await copyText('x', { writeText: undefined, legacyCopy: () => true })).toBe(true);
  });

  test('seul l’échec des deux chemins se dit', async () => {
    expect(await copyText('x', { writeText: refused, legacyCopy: () => false })).toBe(false);
  });
});
