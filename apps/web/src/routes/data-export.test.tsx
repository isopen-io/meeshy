import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import type { DataExportResult } from '@/lib/api/data-export';
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

function scripted(result: ApiResult<DataExportResult> = { ok: true, data: SERVED }) {
  const requested: number[] = [];
  const downloaded: Array<{ fileName: string; jsonText: string }> = [];
  const deps: DataExportPageDeps = {
    request: async () => {
      requested.push(requested.length);
      return result;
    },
    download: (fileName, jsonText) => {
      downloaded.push({ fileName, jsonText });
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
      download: () => undefined,
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
