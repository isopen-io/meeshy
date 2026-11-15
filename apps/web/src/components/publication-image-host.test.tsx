import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { closePublicationImage, openPublicationImage } from '@/lib/export/publication-image-store';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadExportCardCatalog } from '@/lib/i18n-export-card-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PublicationImageHost } from './publication-image-host';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const mounter = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadExportCardCatalog('fr');
});

afterEach(() => {
  closePublicationImage();
  mounter.unmountAll();
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

describe('PublicationImageHost — l’hôte unique de l’atelier de carte (#16393)', () => {
  test('rien ne se monte tant qu’aucune publication n’est imagée ; une demande ouvre l’atelier, la fermeture le retire', async () => {
    const host = await mounter.mount(<PublicationImageHost />);
    expect(host.textContent).toBe('');
    openPublicationImage({
      key: 'post:p1',
      subject: { quoted: null, reply: { author: 'Awa', text: 'Bonjour', handle: 'awa' }, sentAt: new Date('2026-11-05T10:00:00Z'), quotedAt: null, media: [] },
      scene: null,
    });
    await import('@/routes/publication-image-sheet');
    await mounter.settle();
    await mounter.settle();
    expect(document.body.textContent).toContain('Imagine');
    closePublicationImage();
    await mounter.settle();
    expect(document.body.textContent).not.toContain('Imagine');
  });
});
