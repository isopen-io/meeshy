import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { StartCallRequest } from '@/lib/calls/engine';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { CallBackPromptPanel } from './call-back-prompt-layer';

/**
 * « APPELER » QUAND LE NAVIGATEUR ATTEND UN GESTE (#8199) — le rappel d'un
 * onglet ouvert à froid se confirme d'un toucher, qui débloque le son.
 */

const noop = () => undefined;

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
});

const request = (overrides: Partial<StartCallRequest> = {}): StartCallRequest => ({
  conversationId: 'conv-1',
  media: 'audio',
  title: 'Awa',
  avatar: null,
  isGroup: false,
  ...overrides,
});

const render = (value: StartCallRequest) =>
  renderToStaticMarkup(<CallBackPromptPanel request={value} language="fr" onCall={noop} onCancel={noop} />);

describe('la confirmation du rappel (#8199)', () => {
  test('elle nomme la personne rappelée et offre « Appeler » et « Annuler », en cibles de 44 px', () => {
    const html = render(request());
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-label="Rappeler Awa ?"');
    expect(html).toContain('data-call-back-prompt-action="call"');
    expect(html).toContain('>Appeler<');
    expect(html).toContain('>Annuler<');
    expect(html.match(/min-h-11/g)?.length).toBe(2);
  });

  test('un rappel vidéo le dit', () => {
    const html = render(request({ media: 'video' }));
    expect(html).toContain('Rappeler Awa en vidéo ?');
    expect(html).toContain('data-call-back-prompt="video"');
  });

  test('sans nom connu, la question nomme le type d’appel', () => {
    expect(render(request({ title: '' }))).toContain('aria-label="Appel vocal"');
    expect(render(request({ title: '', media: 'video' }))).toContain('aria-label="Appel vidéo"');
  });
});
