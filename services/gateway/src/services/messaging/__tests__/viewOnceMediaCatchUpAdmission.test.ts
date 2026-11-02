/**
 * #11269 (audit adversarial, F3) — le rattrapage n'écrit hors staging qu'avec
 * une sauvegarde VÉRIFIÉE nommée : ce qu'il réarme est effacé dans les minutes
 * qui suivent, et ne revient pas (#9223).
 *
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { viewOnceCatchUpWriteAdmission } from '../viewOnceMediaCatchUpAdmission';

describe('viewOnceCatchUpWriteAdmission (#11269, F3)', () => {
  it('sans APPLY=1 : à sec, partout', () => {
    expect(viewOnceCatchUpWriteAdmission({ OPS_ENVIRONMENT: 'production' })).toEqual({ kind: 'dry-run' });
  });

  it('en staging, APPLY=1 suffit', () => {
    expect(viewOnceCatchUpWriteAdmission({ APPLY: '1', OPS_ENVIRONMENT: 'staging' })).toEqual({
      kind: 'apply',
      environment: 'staging',
      backupVerified: null,
    });
  });

  it('hors staging, APPLY=1 sans BACKUP_VERIFIED est REFUSÉ', () => {
    expect(viewOnceCatchUpWriteAdmission({ APPLY: '1', OPS_ENVIRONMENT: 'production' })).toMatchObject({ kind: 'refused' });
  });

  it('un BACKUP_VERIFIED vide ou blanc ne vaut pas sauvegarde', () => {
    expect(viewOnceCatchUpWriteAdmission({ APPLY: '1', OPS_ENVIRONMENT: 'production', BACKUP_VERIFIED: '  ' })).toMatchObject({
      kind: 'refused',
    });
  });

  it('un environnement NON DÉCLARÉ vaut production — fail-closed', () => {
    expect(viewOnceCatchUpWriteAdmission({ APPLY: '1' })).toMatchObject({ kind: 'refused' });
  });

  it('hors staging, APPLY=1 + BACKUP_VERIFIED=<identifiant> écrit, et rend l’identifiant à journaliser', () => {
    expect(
      viewOnceCatchUpWriteAdmission({ APPLY: '1', OPS_ENVIRONMENT: 'production', BACKUP_VERIFIED: ' backup-2026-11-01T02:30Z ' }),
    ).toEqual({ kind: 'apply', environment: 'production', backupVerified: 'backup-2026-11-01T02:30Z' });
  });
});
