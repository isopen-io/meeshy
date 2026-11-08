/**
 * « Créer des Connaissances automatiquement » (#14406) : ni un REMPLACEMENT qui ne
 * nomme pas la clé (`PUT` d'alias, `PATCH ?mode=replace`), ni une RÉINITIALISATION
 * (`DELETE`) ne lèvent le choix stocké de la personne — un refus (RGPD art. 21)
 * moins que tout (contre-audit #14464 C7 et N3). Même mécanisme que « Recevoir
 * des Bring » (`keptWhenUnnamed`, #13936), dont les routes sont témoins ailleurs.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { keepUnnamedKeys, resetDocumentFor } from '../../../../routes/me/preferences/preference-registry';

const USER = '507f1f77bcf86cd799439011';

const prismaWith = (privacy: Record<string, unknown> | null) => ({
  userPreferences: { findUnique: async () => (privacy ? { privacy } : null) },
  userPreference: { findMany: async () => [] },
});

describe('keptWhenUnnamed — la confidentialité garde le choix de la Connaissance automatique', () => {
  it('un remplacement qui ne la nomme pas garde un refus stocké', async () => {
    const doc = await keepUnnamedKeys(prismaWith({ showLastSeen: true, autoAcquaintance: false }) as never, USER, 'privacy', { showLastSeen: false }, { showLastSeen: false });
    expect(doc).toEqual({ showLastSeen: false, autoAcquaintance: false });
  });

  it('un remplacement qui la NOMME l’emporte', async () => {
    const doc = await keepUnnamedKeys(prismaWith({ autoAcquaintance: false }) as never, USER, 'privacy', { autoAcquaintance: true }, { autoAcquaintance: true });
    expect(doc).toEqual({ autoAcquaintance: true });
  });

  it('la réinitialisation garde le choix stocké, dans les deux sens', async () => {
    expect(await resetDocumentFor(prismaWith({ showLastSeen: false, autoAcquaintance: false }) as never, USER, 'privacy')).toEqual({ autoAcquaintance: false });
    expect(await resetDocumentFor(prismaWith({ autoAcquaintance: true }) as never, USER, 'privacy')).toEqual({ autoAcquaintance: true });
  });

  it('sans choix stocké, la confidentialité revient entière aux défauts', async () => {
    expect(await resetDocumentFor(prismaWith({ showLastSeen: false }) as never, USER, 'privacy')).toBeNull();
    expect(await resetDocumentFor(prismaWith(null) as never, USER, 'privacy')).toBeNull();
  });
});
