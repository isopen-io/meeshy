import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import type { DataExportResult } from '@/lib/api/data-export';
import type { DeliverFileOutcome } from '@/lib/media/deliver-file';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { DataExportPage, type DataExportPageDeps } from './data-export';

/**
 * `/settings/data-export` RENDU (#6725) — la rangée « Exporter mes données »,
 * masquée depuis la décommission du legacy (#6335), revient à sa page de la
 * v2. Le geste est explicite : arriver sur la page ne télécharge rien
 * (#4183, même règle que la suppression de compte et le désabonnement).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(unmountAll);

const SERVED: DataExportResult = { raw: { exportDate: '2026-09-16T08:00:00.000Z' }, exportDate: '2026-09-16T08:00:00.000Z' };

function scripted(
  result: ApiResult<DataExportResult> = { ok: true, data: SERVED },
  outcomes: readonly DeliverFileOutcome[] = ['delivered'],
) {
  const requested: number[] = [];
  const downloaded: Array<{ fileName: string; jsonText: string }> = [];
  const deps: DataExportPageDeps = {
    request: async () => {
      requested.push(requested.length);
      return result;
    },
    download: async (fileName, jsonText) => {
      downloaded.push({ fileName, jsonText });
      return outcomes[downloaded.length - 1] ?? 'delivered';
    },
  };
  return { deps, requested, downloaded };
}

describe('/settings/data-export — un geste explicite, jamais au montage', () => {
  test('sans session : rien n’est demandé, et la page dit pourquoi', async () => {
    const script = scripted();
    const host = await mount(<DataExportPage signedIn={false} online language="fr" deps={script.deps} />);

    expect(script.requested).toEqual([]);
    expect(host.querySelector('h1')?.textContent).toBe('Connectez-vous pour continuer');
  });

  test('arriver sur la page ne télécharge rien', async () => {
    const script = scripted();
    await mount(<DataExportPage signedIn online language="fr" deps={script.deps} />);

    expect(script.requested).toEqual([]);
    expect(script.downloaded).toEqual([]);
  });

  test('le geste demande l’export, puis déclenche le téléchargement', async () => {
    const script = scripted();
    const host = await mount(<DataExportPage signedIn online language="fr" deps={script.deps} />);

    expect(host.textContent).toContain('Exporter mes données');
    await click(buttonNamed(host, 'Exporter mes données'));

    expect(script.requested).toEqual([0]);
    expect(script.downloaded).toEqual([{ fileName: 'meeshy-export-2026-09-16.json', jsonText: JSON.stringify(SERVED.raw, null, 2) }]);
    expect(host.textContent).toContain('Le fichier a été téléchargé sur cet appareil.');
  });

  test('le geste se voit avant la réponse — bouton désactivé, état « en cours »', async () => {
    let resolve: ((value: ApiResult<DataExportResult>) => void) | undefined;
    const deps: DataExportPageDeps = {
      request: () => new Promise((r) => { resolve = r; }),
      download: async () => 'delivered',
    };
    const host = await mount(<DataExportPage signedIn online language="fr" deps={deps} />);

    await click(buttonNamed(host, 'Exporter mes données'));
    expect(host.textContent).toContain('Export en cours…');
    expect(buttonNamed(host, 'Export en cours…')?.hasAttribute('disabled')).toBe(true);

    await act(async () => {
      resolve?.({ ok: true, data: SERVED });
    });
  });

  test('un échec réseau le dit, et « Réessayer » relance le même geste', async () => {
    const script = scripted({ ok: false, status: 0, error: 'x' });
    const host = await mount(<DataExportPage signedIn online language="fr" deps={script.deps} />);

    await click(buttonNamed(host, 'Exporter mes données'));

    expect(host.querySelector('h1')?.textContent).toBe('Hors ligne');
    expect(script.downloaded).toEqual([]);
  });

  test('hors ligne : le bouton est désactivé', async () => {
    const script = scripted();
    const host = await mount(<DataExportPage signedIn online={false} language="fr" deps={script.deps} />);

    expect(host.textContent).toContain('Reconnectez-vous à Internet');
    expect(buttonNamed(host, 'Exporter mes données')?.hasAttribute('disabled')).toBe(true);
  });
});

/**
 * LE FICHIER DOIT ARRIVER QUELQUE PART (#7864). Aucune coque ne branche le
 * téléchargement de sa WebView : l'export passe par le portail de livraison,
 * et la page ne dit « téléchargé » que si le fichier est parti. Un partage
 * annulé ou une activation expirée gardent l'export EN MAIN : le tap suivant
 * le livre sans le redemander au serveur.
 */
describe('/settings/data-export — le fichier est livré, pas seulement annoncé (#7864)', () => {
  test('une feuille fermée sans choix garde l’export prêt, sans le redemander', async () => {
    const script = scripted({ ok: true, data: SERVED }, ['cancelled', 'delivered']);
    const host = await mount(<DataExportPage signedIn online language="fr" deps={script.deps} />);

    await click(buttonNamed(host, 'Exporter mes données'));
    expect(host.textContent).not.toContain('Le fichier a été téléchargé sur cet appareil.');

    await click(buttonNamed(host, 'Enregistrer le fichier'));

    expect(script.requested).toEqual([0]);
    expect(script.downloaded.map((entry) => entry.fileName)).toEqual(['meeshy-export-2026-09-16.json', 'meeshy-export-2026-09-16.json']);
    expect(host.textContent).toContain('Le fichier a été téléchargé sur cet appareil.');
  });

  test('un appareil qui ne peut rien recevoir le dit, au lieu d’annoncer un export terminé', async () => {
    const script = scripted({ ok: true, data: SERVED }, ['unavailable']);
    const host = await mount(<DataExportPage signedIn online language="fr" deps={script.deps} />);

    await click(buttonNamed(host, 'Exporter mes données'));

    expect(host.textContent).not.toContain('Export terminé');
    expect(host.textContent).toContain('Cet appareil n’a pas pu recevoir le fichier.');
  });
});
