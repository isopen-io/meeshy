import { offenders, sensitiveModules } from './instanceof-checked-class-mock-completeness-sweep';

/**
 * Voir le doc-comment de `instanceof-checked-class-mock-completeness-sweep.ts` —
 * cette garde généralise #6294 (`withMutationLog-mock-spread-guard.test.ts`) à
 * tout module qui exporte une classe vérifiée par `instanceof` depuis un
 * fichier DIFFÉRENT de celui qui la déclare. #6296.
 */
describe('les doubles de modules exportant une classe instanceof-vérifiée étalent le module réel (#6296)', () => {
  const sensitive = sensitiveModules();

  /** Un balayage qui ne trouve RIEN rendrait la garde verte par vacuité. */
  it('le balayage trouve des modules sensibles (au moins les 5 confirmés au 2026-09-13)', () => {
    expect(sensitive.length).toBeGreaterThanOrEqual(5);
  });

  it("`middleware/auth.ts` n'est PAS sensible — `GuestAccessRevokedError` n'est vérifiée que par elle-même", () => {
    expect(sensitive.some((s) => s.modulePath.endsWith('middleware/auth.ts'))).toBe(false);
  });

  it('chaque double total d\'un module sensible étale `jest.requireActual` du MÊME module, casté `as object`', () => {
    expect(offenders()).toEqual([]);
  });
});
