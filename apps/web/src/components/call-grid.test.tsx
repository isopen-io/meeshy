import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { CallMember } from '@/lib/calls/call-store';

import { CallGrid, type CallGridProps } from './call-grid';

/**
 * LA GRILLE D'UN APPEL DE GROUPE (#3721) — une tuile par participant et la
 * sienne ; toucher une tuile la met en avant, les autres passent en bandeau ;
 * un modérateur y trouve « Retirer de l'appel ».
 */

const member = (userId: string, name: string): CallMember => ({ userId, name, avatar: null, micMuted: false, cameraOn: false, link: 'connected' });

const grid = (overrides: Partial<CallGridProps> = {}) =>
  renderToStaticMarkup(
    <CallGrid
      members={[member('u-a', 'Awa'), member('u-b', 'Bintou')]}
      remoteStreams={{}}
      self={{ stream: null, cameraOn: false, mirrored: true }}
      featuredId={null}
      onFeature={() => undefined}
      removal={null}
      language="fr"
      {...overrides}
    />,
  );

describe('CallGrid', () => {
  test('sans mise en avant : une tuile par participant, la sienne comprise, chacune se met en avant', () => {
    const html = grid();
    expect(html).toContain('data-call-tile="u-a"');
    expect(html).toContain('data-call-tile="u-b"');
    expect(html).toContain('data-call-tile-self=""');
    expect(html).toContain('aria-label="Mettre Awa en avant"');
    expect(html).not.toContain('data-call-spotlight');
  });

  test('en avant : le participant choisi occupe la scène, les autres passent en bandeau', () => {
    const html = grid({ featuredId: 'u-b' });
    expect(html).toContain('data-call-spotlight="u-b"');
    expect(html).toContain('aria-label="Revenir à la grille"');
    expect(html).toContain('data-call-strip=""');
    expect(html).toContain('data-call-tile="u-a"');
  });

  test('un modérateur trouve « Retirer » sur le participant en avant, pas un membre ordinaire', () => {
    const removal = { canRemove: (userId: string) => userId === 'u-b', remove: () => undefined, failed: false };
    expect(grid({ featuredId: 'u-b', removal })).toContain('Retirer Bintou de l’appel');
    expect(grid({ featuredId: 'u-a', removal })).not.toContain('Retirer');
    expect(grid({ featuredId: 'u-b' })).not.toContain('Retirer');
  });

  test('un retrait refusé le dit', () => {
    const removal = { canRemove: () => true, remove: () => undefined, failed: true };
    expect(grid({ featuredId: 'u-b', removal })).toContain('Impossible de retirer ce participant');
  });
});
