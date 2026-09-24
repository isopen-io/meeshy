import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { startArrivalsNotice, withArrival } from '@meeshy/shared/utils/arrivals-notice';

import { SystemNotice } from './system-notice';

/* La ligne d'arrivées regroupées de Meeshy Global (#7740) se rend comme un
   jalon du fil — heure, glyphe d'arrivée, texte — sur les DEUX peaux, et
   son libellé d'accessibilité est la phrase entière. */

const notice = ['Tom', 'Aïcha'].reduce(
  (current, displayName) => withArrival(current, { participantId: `p-${displayName}`, displayName }),
  startArrivalsNotice({ participantId: 'p-lea', displayName: 'Léa' }, '2026-09-24T10:00:00.000Z'),
);

describe('SystemNotice — arrivées regroupées de Meeshy Global (#7740)', () => {
  test.each(['row', 'bubble'] as const)('peau %s : jalon étiqueté, glyphe et phrase entière', (surface) => {
    const html = renderToStaticMarkup(<SystemNotice row={{ kind: 'arrivals', notice }} timeString="10:04" surface={surface} />);

    expect(html).toContain('data-system="arrivals"');
    expect(html).toContain('<svg');
    expect(html).toContain('Aïcha, Tom et Léa viennent d’arriver — dis-leur salut');
    expect(html).toContain('aria-label="Aïcha, Tom et Léa viennent d’arriver — dis-leur salut"');
  });
});
