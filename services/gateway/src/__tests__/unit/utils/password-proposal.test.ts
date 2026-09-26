import { PASSWORD_PROPOSAL_LEVELS } from '@meeshy/shared/types/admin-password-proposal';
import {
  DRAWS_PER_LEVEL,
  HARD_PASSWORD_LENGTH,
  passwordBaseOf,
  proposePassword,
  proposePasswords,
} from '../../../utils/password-proposal';
import { validatePasswordStrength } from '../../../utils/password-strength';
import { hashPassword, verifyPassword } from '../../../utils/password-hash';

/**
 * LES QUATRE NIVEAUX DE MOT DE PASSE D'UN ADMINISTRATEUR (#8051) — ce qui est
 * proposé est lisible, dérivé du membre, accepté par la politique de
 * robustesse AVANT d'être servi, et reconnu par la connexion ensuite.
 */

/** Un aléa DÉTERMINISTE : rend les entiers de la suite, en boucle. */
const sequence = (values: readonly number[]) => {
  let cursor = 0;
  return (max: number): number => {
    const value = values[cursor % values.length]! % max;
    cursor += 1;
    return value;
  };
};

describe('passwordBaseOf — le mot qui vient du membre', () => {
  it('préfère le pseudo au nom affiché', () => {
    expect(passwordBaseOf({ username: 'alice', displayName: 'Alice Martin' })).toBe('alice');
  });

  it('réduit un nom affiché accentué à des lettres ASCII minuscules', () => {
    expect(passwordBaseOf({ username: null, displayName: 'Élodie Durand' })).toBe('elodiedurand');
  });

  it('descend au nom affiché quand le pseudo est trop court pour dire quelque chose', () => {
    expect(passwordBaseOf({ username: 'ab', displayName: 'Bob Marley' })).toBe('bobmarley');
  });

  it('retombe sur « meeshy » quand rien ne reste', () => {
    expect(passwordBaseOf({ username: '__', displayName: '…', firstName: null })).toBe('meeshy');
  });
});

describe('proposePasswords — quatre niveaux, tous acceptés par la politique', () => {
  const sources = [
    { username: 'alice', displayName: 'Alice Martin' },
    { username: 'admin', displayName: 'Admin' },
    { username: 'password', displayName: 'Pass Word' },
    { username: 'jean-christophe_dupont', displayName: 'Jean-Christophe' },
    { username: 'a', displayName: 'Ab' },
  ];

  it.each(sources)('sert les quatre niveaux, chacun accepté par validatePasswordStrength — %o', (source) => {
    const proposals = proposePasswords({ source });

    for (const level of PASSWORD_PROPOSAL_LEVELS) {
      const verdict = validatePasswordStrength(proposals[level]);
      expect({ level, password: proposals[level], errors: verdict.errors }).toEqual({ level, password: proposals[level], errors: [] });
    }
  });

  it('va du plus court au plus long, et le niveau difficile ignore le pseudo', () => {
    const proposals = proposePasswords({ source: { username: 'alice' } });

    expect(proposals.simple.length).toBeLessThan(proposals.easy.length);
    expect(proposals.easy.length).toBeLessThan(proposals.medium.length);
    expect(proposals.medium.length).toBeLessThan(proposals.hard.length);
    expect(proposals.hard).toHaveLength(HARD_PASSWORD_LENGTH);
    expect(proposals.hard.toLowerCase()).not.toContain('alice');
  });

  it('dérive les trois premiers niveaux du pseudo', () => {
    const proposals = proposePasswords({ source: { username: 'alice' } });

    expect(proposals.simple).toMatch(/^alice[2-9]{3}$/);
    expect(proposals.easy).toMatch(/^Alice-[2-9]{4}[!?#*]$/);
    expect(proposals.medium).toMatch(/^Alice\.[A-Za-z2-9]{4}[!?#*][2-9]{4}$/);
  });

  it('ne sert jamais un caractère qui se confond à la lecture', () => {
    const proposals = proposePasswords({ source: { username: 'marc' }, random: sequence([0, 7, 13, 21, 34, 55]) });

    for (const level of PASSWORD_PROPOSAL_LEVELS) {
      expect(proposals[level]).not.toMatch(/[O0lI1]/);
    }
  });

  it('est déterministe à aléa égal, et change dès que l’aléa change', () => {
    const source = { username: 'alice' };

    expect(proposePasswords({ source, random: sequence([3, 1, 4, 1, 5, 9]) })).toEqual(
      proposePasswords({ source, random: sequence([3, 1, 4, 1, 5, 9]) }),
    );
    expect(proposePasswords({ source }).hard).not.toBe(proposePasswords({ source }).hard);
  });
});

describe('proposePassword — un niveau intenable monte d’un cran au lieu d’échouer', () => {
  it('sert un mot de passe SANS la base quand la politique refuse tout ce qui la contient', () => {
    const refusesTheBase = (password: string) => !password.toLowerCase().includes('alice');
    let draws = 0;
    const counting = (max: number) => {
      draws += 1;
      return draws % max;
    };

    const proposal = proposePassword('simple', { source: { username: 'alice' }, random: counting, accept: refusesTheBase });

    expect(proposal.toLowerCase()).not.toContain('alice');
    expect(proposal).toHaveLength(HARD_PASSWORD_LENGTH);
    expect(draws).toBeGreaterThan(DRAWS_PER_LEVEL * 3);
  });
});

describe('la chaîne réinitialisation → connexion tient sur les quatre niveaux', () => {
  it('reconnaît chaque proposition une fois hachée comme le ferait resetPassword, puis vérifiée comme le ferait login', async () => {
    const proposals = proposePasswords({ source: { username: 'alice', displayName: 'Alice Martin' } });

    for (const level of PASSWORD_PROPOSAL_LEVELS) {
      const stored = await hashPassword(proposals[level]);
      expect(await verifyPassword(proposals[level], stored)).toBe(true);
      expect(await verifyPassword(`${proposals[level]} `, stored)).toBe(false);
    }
  }, 30_000);
});
