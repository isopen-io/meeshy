import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { AudienceChip } from './story-compose-audience';
import { AudienceSheet } from './story-compose-audience-sheet';

/**
 * LE SÉLECTEUR D'AUDIENCE DU STUDIO, AVEC LES CERCLES (#13939) — iso
 * `ComposerAudienceSheet` / `PostVisibility.composerSelectableCases` : l'échelle
 * des cercles dans l'ordre d'iOS, chaque cercle choisissable avec son sous-titre
 * et l'icône partagée de son niveau, et une audience servie inconnue qui se dit
 * « Restreinte », jamais « Public ».
 */

const noop = () => undefined;

const sheet = (props: { readonly value?: Parameters<typeof AudienceSheet>[0]['value']; readonly lang?: 'fr' | 'de' } = {}) =>
  renderToStaticMarkup(<AudienceSheet lang={props.lang ?? 'fr'} repostOfId={null} value={props.value ?? 'FRIENDS'} source="chosen" onChoose={noop} onClose={noop} />);

describe('la feuille d’audience', () => {
  test('neuf rangées, l’échelle des cercles d’abord, dans l’ordre d’iOS', () => {
    expect([...sheet().matchAll(/data-audience-choice="(\w+)"/g)].map((m) => m[1])).toEqual([
      'PUBLIC',
      'COMMUNITY',
      'ACQUAINTANCES',
      'FRIENDS',
      'CLOSE',
      'BLOOD',
      'EXCEPT',
      'ONLY',
      'PRIVATE',
    ]);
  });

  test('chaque cercle est choisissable, nommé, sous-titré, avec l’icône partagée de son niveau', () => {
    const html = sheet();
    for (const [visibility, label, icon] of [
      ['ACQUAINTANCES', 'Connaissances', '👋'],
      ['CLOSE', 'Proches', '🔥'],
      ['BLOOD', 'Sang', '🩸'],
    ] as const) {
      expect(html).toMatch(new RegExp(`data-audience-choice="${visibility}" aria-disabled="false"`));
      expect(html).toContain(label);
      expect(html).toContain(`data-audience-icon="${visibility}"`);
      expect(html).toContain(icon);
    }
    expect(html).toContain('Vos Sangs seulement — jamais repartagé');
    expect(html).toContain('Vos Proches et vos Sangs');
  });

  test('« Amis », comme le nom partagé du niveau', async () => {
    await loadInterfaceCatalog('de');
    expect(sheet()).toMatch(/data-audience-choice="FRIENDS"[^>]*>.*?Amis/);
    expect(sheet({ lang: 'de' })).toContain('Vertraute');
  });

  test('une audience servie inconnue ne coche aucune rangée', () => {
    expect(sheet({ value: 'RESTRICTED' })).not.toContain('aria-current="true"');
  });
});

describe('la pastille', () => {
  const chip = (value: Parameters<typeof AudienceChip>[0]['value'], source: Parameters<typeof AudienceChip>[0]['source']) =>
    renderToStaticMarkup(<AudienceChip lang="fr" value={value} source={source} open={false} onOpen={noop} />);

  test('un cercle choisi se dit par son nom et son icône', () => {
    const html = chip('CLOSE', 'chosen');
    expect(html).toContain('data-audience-value="CLOSE"');
    expect(html).toContain('Proches');
    expect(html).toContain('🔥');
  });

  test('une audience servie inconnue se dit « Restreinte », au cadenas — jamais « Public · par défaut »', () => {
    const html = chip('RESTRICTED', 'served');
    expect(html).toContain('Restreinte');
    expect(html).not.toContain('Public');
    expect(html).not.toContain('par défaut');
  });
});

/** « DÉSACTIVER LES COMMENTAIRES » (#16541) — une option de publication, posée sous l'audience, qui dit son état. */
describe('la feuille d’audience — les commentaires', () => {
  const withComments = (commentsDisabled: boolean) =>
    renderToStaticMarkup(
      <AudienceSheet lang="fr" repostOfId={null} value="PUBLIC" source="chosen" onChoose={noop} commentsDisabled={commentsDisabled} onCommentsDisabledChange={noop} onClose={noop} />,
    );

  test('un interrupteur nommé, à l’état servi', async () => {
    await loadInterfaceCatalog('fr');
    expect(withComments(false)).toMatch(/role="switch" aria-checked="false"[^>]*data-publish-comments-disabled/);
    expect(withComments(true)).toMatch(/aria-checked="true"/);
    expect(withComments(true)).toContain('Désactiver les commentaires');
  });

  test('sans hôte qui sache le faire, aucune rangée', () => {
    expect(sheet()).not.toContain('data-publish-comments-disabled');
  });
});
