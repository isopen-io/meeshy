import { describe, it, expect } from 'vitest';
import { resolveBuildInfo } from '../../utils/build-info';

/**
 * Aucun service ne disait quel code il exécutait : les endpoints `/health`
 * renvoyaient une version codée en dur, identique depuis toujours. Savoir si un
 * correctif était en production supposait un `docker inspect` sur l'hôte, ou une
 * corrélation entre l'uptime du container et l'horodatage des tags `sha-<short>`
 * du registre — une inférence, jamais une lecture.
 *
 * L'information existait pourtant déjà : les trois Dockerfiles gravent
 * `org.opencontainers.image.revision` depuis le build-arg `VCS_REF`, que
 * `.github/workflows/docker.yml` alimente avec `github.sha`.
 *
 * Ce helper vit dans `shared` et non dans chaque service : le gateway et le web
 * le consomment tous deux, et le contrat de champs doit rester identique pour
 * que les trois `/health` se comparent sans traduction. Le translator (Python)
 * en porte un miroir, `src/utils/build_info.py`, tenu aligné sur ces mêmes noms.
 */
describe('resolveBuildInfo', () => {
  it('expose le commit gravé dans l’image', () => {
    expect(resolveBuildInfo({ GIT_COMMIT: 'fc11ab82a1b2c3d4e5f6' }).commit).toBe('fc11ab82a1b2c3d4e5f6');
  });

  it('expose une forme courte alignée sur les tags `sha-<short>` du registre', () => {
    expect(resolveBuildInfo({ GIT_COMMIT: 'fc11ab82a1b2c3d4e5f6' }).commitShort).toBe('fc11ab8');
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
    expect(resolveBuildInfo({ BUILD_DATE: '2026-08-06T02:47:00Z' }).builtAt).toBe('2026-08-06T02:47:00Z');
  });

  it('rend null quand la date de build est absente', () => {
    expect(resolveBuildInfo({}).builtAt).toBeNull();
  });

  /** Un SHA déjà court (build local, déploiement manuel) n'est ni tronqué ni rejeté. */
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
