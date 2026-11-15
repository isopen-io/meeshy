import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ContentRemovalSheet } from './content-removal-sheet';

/**
 * #11150 — LE MOTIF DU RETRAIT, une feuille pour les quatre surfaces
 * (message, publication, story, commentaire). « Retirer » reste désactivé tant
 * que le motif nettoyé n'a pas 3 caractères ; il remet le motif nettoyé ;
 * « Annuler » ne retire rien. Le champ est nommé, et dit que l'auteur sera prévenu.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const mount = (journal: string[]) =>
  mounter.mount(<ContentRemovalSheet onConfirm={(reason) => journal.push(`remove:${reason}`)} onCancel={() => journal.push('cancel')} />);

const confirmButton = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('[data-content-removal="confirm"]');
const field = (host: HTMLElement) => host.querySelector<HTMLTextAreaElement>('[data-content-removal-reason]');

describe('ContentRemovalSheet', () => {
  test('le champ est nommé « Motif du retrait », et l’effet sur l’auteur est dit', async () => {
    const host = await mount([]);
    const textarea = field(host);
    expect(textarea).not.toBeNull();
    const label = host.querySelector(`label[for="${textarea?.id}"]`);
    expect(label?.textContent).toContain('Motif du retrait');
    expect(textarea?.getAttribute('aria-describedby')).toBeTruthy();
    expect(host.textContent).toContain('L’auteur sera prévenu du motif.');
    expect(textarea?.maxLength).toBe(500);
  });

  test('« Retirer » désactivé sous 3 caractères nettoyés, offert au-delà, et remet le motif nettoyé', async () => {
    const journal: string[] = [];
    const host = await mount(journal);
    expect(confirmButton(host)?.disabled).toBe(true);
    mounter.type(host, '[data-content-removal-reason]', '  ab  ');
    expect(confirmButton(host)?.disabled).toBe(true);
    mounter.type(host, '[data-content-removal-reason]', '  Spam répété  ');
    expect(confirmButton(host)?.disabled).toBe(false);
    await mounter.click(confirmButton(host));
    expect(journal).toEqual(['remove:Spam répété']);
  });

  test('« Annuler » referme sans rien retirer', async () => {
    const journal: string[] = [];
    const host = await mount(journal);
    await mounter.click(host.querySelector('[data-content-removal="cancel"]'));
    expect(journal).toEqual(['cancel']);
  });
});
