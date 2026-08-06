import { resolveBuildInfo } from '../../../utils/build-info';

/**
 * Le gateway ne disait pas quel code il exécutait : `/health` renvoyait un
 * `version: '1.0.0'` codé en dur, identique depuis toujours. Savoir si un
 * correctif était en production supposait un `docker inspect` sur le serveur,
 * ou une corrélation entre l'uptime du container et l'horodatage des tags du
 * registre — une inférence, jamais une lecture.
 *
 * L'information existait pourtant déjà : le Dockerfile grave
 * `org.opencontainers.image.revision` depuis le build-arg `VCS_REF`, que la CI
 * alimente avec `github.sha`. Elle n'était simplement pas remontée au runtime.
 */
describe('resolveBuildInfo', () => {
  it('expose le commit gravé dans l’image', () => {
    const info = resolveBuildInfo({ GIT_COMMIT: 'fc11ab82a1b2c3d4e5f6' });

    expect(info.commit).toBe('fc11ab82a1b2c3d4e5f6');
  });

  it('expose une forme courte alignée sur les tags `sha-<short>` du registre', () => {
    const info = resolveBuildInfo({ GIT_COMMIT: 'fc11ab82a1b2c3d4e5f6' });

    expect(info.commitShort).toBe('fc11ab8');
  });

  /**
   * Un repli fabriqué ('unknown', 'dev', le SHA d'un autre build) rendrait une
   * lecture morte indiscernable d'une lecture réussie — précisément le défaut
   * qu'on corrige. L'absence doit rester visible.
   */
  it('rend null plutôt qu’une valeur fabriquée quand le commit est absent', () => {
    const info = resolveBuildInfo({});

    expect(info.commit).toBeNull();
    expect(info.commitShort).toBeNull();
  });

  it('traite une variable vide ou blanche comme absente', () => {
    expect(resolveBuildInfo({ GIT_COMMIT: '' }).commit).toBeNull();
    expect(resolveBuildInfo({ GIT_COMMIT: '   ' }).commit).toBeNull();
  });

  it('expose la date de build quand elle est gravée', () => {
    const info = resolveBuildInfo({ BUILD_DATE: '2026-08-06T02:47:00Z' });

    expect(info.builtAt).toBe('2026-08-06T02:47:00Z');
  });

  it('rend null quand la date de build est absente', () => {
    expect(resolveBuildInfo({}).builtAt).toBeNull();
  });

  /**
   * Un SHA court gravé tel quel (déploiement manuel, build local) ne doit pas
   * être tronqué davantage ni rejeté.
   */
  it('accepte un SHA déjà court sans le mutiler', () => {
    const info = resolveBuildInfo({ GIT_COMMIT: 'fc11ab8' });

    expect(info.commit).toBe('fc11ab8');
    expect(info.commitShort).toBe('fc11ab8');
  });

  it('lit process.env par défaut, sans argument', () => {
    const previous = process.env.GIT_COMMIT;
    process.env.GIT_COMMIT = 'abcdef1234567890';
    try {
      expect(resolveBuildInfo().commit).toBe('abcdef1234567890');
    } finally {
      if (previous === undefined) delete process.env.GIT_COMMIT;
      else process.env.GIT_COMMIT = previous;
    }
  });
});
