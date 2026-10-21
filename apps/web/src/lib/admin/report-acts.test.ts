import { describe, expect, test } from 'bun:test';

import { reportActsFor, withReportClosed } from './report-acts';

/** UN SIGNALEMENT SE TRAITE EN UN GESTE (#10394) — ce que chaque dossier offre, et l'effet vu d'avance. */
describe('reportActsFor — les actes qu’un signalement OUVERT offre, selon ce qu’il vise', () => {
  test('une publication ou une story : hors ligne, en privé, classer', () => {
    expect(reportActsFor({ reportedType: 'post', status: 'pending' })).toEqual(['take-offline', 'make-private', 'dismiss']);
    expect(reportActsFor({ reportedType: 'story', status: 'under_review' })).toEqual(['take-offline', 'make-private', 'dismiss']);
  });
  test('un commentaire : le retirer, classer ; tout autre contenu : classer', () => {
    expect(reportActsFor({ reportedType: 'comment', status: 'pending' })).toEqual(['remove-comment', 'dismiss']);
    expect(reportActsFor({ reportedType: 'user', status: 'pending' })).toEqual(['dismiss']);
  });
  test('un dossier clos n’offre rien', () => {
    for (const status of ['resolved', 'rejected', 'dismissed']) expect(reportActsFor({ reportedType: 'post', status })).toEqual([]);
  });
});

describe('withReportClosed — la file le dit tout de suite', () => {
  test('un acte sur le contenu résout ; classer classe ; les autres lignes ne bougent pas', () => {
    const page = { rows: [{ id: 'a', status: 'pending' }, { id: 'b', status: 'pending' }], total: 2, hasMore: false };
    expect(withReportClosed(page, 'a', 'take-offline').rows).toEqual([{ id: 'a', status: 'resolved' }, { id: 'b', status: 'pending' }]);
    expect(withReportClosed(page, 'b', 'dismiss').rows[1]).toEqual({ id: 'b', status: 'dismissed' });
    expect(withReportClosed(page, 'b', 'dismiss').rows[0]).toBe(page.rows[0]);
  });
});
