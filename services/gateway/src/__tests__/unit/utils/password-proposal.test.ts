import { PASSWORD_PROPOSAL_LEVELS } from '@meeshy/shared/types/admin-password-proposal';
import {
  DRAWS_PER_LEVEL,
  HARD_PASSWORD_LENGTH,
  PASSWORD_LEVEL_LENGTHS,
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

  it('tient la longueur de chaque niveau : 6, 8, 12 et 16 caractères (#8220)', () => {
    expect(PASSWORD_LEVEL_LENGTHS).toEqual({ simple: 6, easy: 8, medium: 12, hard: 16 });

    for (let round = 0; round < 50; round += 1) {
      const proposals = proposePasswords({ source: { username: 'alice' } });
      for (const level of PASSWORD_PROPOSAL_LEVELS) {
        expect({ level, password: proposals[level], length: proposals[level].length }).toEqual({
          level,
          password: proposals[level],
          length: PASSWORD_LEVEL_LENGTHS[level],
        });
      }
    }
  });

  it('le niveau difficile ignore le pseudo', () => {
    const proposals = proposePasswords({ source: { username: 'alice' } });

    expect(proposals.hard).toHaveLength(HARD_PASSWORD_LENGTH);
    expect(proposals.hard.toLowerCase()).not.toContain('alice');
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

describe('simple et facile (#8192, #8220) — faciles à taper, pas faciles à deviner', () => {
  const drawn = (level: 'simple' | 'easy', count: number) =>
    Array.from({ length: count }, () => proposePassword(level, { source: { username: 'alice' } }));

  const isNear = (digits: string): boolean => {
    const values = [...digits].map(Number);
    const steps = values.slice(1).map((value, index) => value - values[index]!);
    const repeatedPair = values.length === 4 && values[0] === values[2] && values[1] === values[3];
    const doubledPairs = values.length === 4 && values[0] === values[1] && values[2] === values[3];
    const mirrored = values.length === 3 && values[0] === values[2];
    const doubledThenAny = values.length === 3 && values[0] === values[1];
    return repeatedPair || doubledPairs || mirrored || doubledThenAny || steps.every((step) => step === 0 || step === 1 || step === -1);
  };

  it.each(['simple'] as const)('%s se complète de chiffres voisins ou répétés, comme 4545, 2334 ou 55', (level) => {
    for (const password of drawn(level, 1_000)) {
      const digits = password.match(/[2-9]{2,4}/)?.[0] ?? '';
      expect({ password, near: isNear(digits), counted: digits.length >= 2 }).toEqual({ password, near: true, counted: true });
    }
  });

  it.each(['simple', 'easy'] as const)('%s prend le pseudo PARFOIS, et le plus souvent des touches voisines au clavier', (level) => {
    const passwords = drawn(level, 1_000);
    const withPseudo = passwords.filter((password) => password.toLowerCase().includes('alic')).length;

    expect(withPseudo).toBeGreaterThan(passwords.length * 0.05);
    expect(withPseudo).toBeLessThan(passwords.length * 0.5);
    expect(passwords.some((password) => /zert|qsdf|wxcv|azer|erty|sdfg|xcvb/i.test(password))).toBe(true);
  });

  it('ne se devinent plus depuis le pseudo : l’espace dépasse de loin les 512 secrets de l’ancienne forme', () => {
    expect(new Set(drawn('simple', 10_000)).size).toBeGreaterThan(4_000);
    expect(new Set(drawn('easy', 10_000)).size).toBeGreaterThan(9_500);
  });

  it('facile tire n’importe quels chiffres, pas seulement des voisins (porteur 2026-09-27)', () => {
    const digitsOf = (password: string) => password.match(/[2-9]{2,4}/)?.[0] ?? '';
    const isNearOrRepeated = (digits: string) =>
      [...digits].every((value, index, all) => index === 0 || Math.abs(Number(value) - Number(all[index - 1])) <= 1 || value === all[index - 2]);

    const passwords = drawn('easy', 1_000);

    expect(passwords.every((password) => digitsOf(password).length >= 2)).toBe(true);
    expect(passwords.filter((password) => !isNearOrRepeated(digitsOf(password))).length).toBeGreaterThan(500);
  });

  it.each(['simple', 'easy'] as const)('%s reste à son niveau : la politique de robustesse l’accepte presque toujours', (level) => {
    const verdicts: boolean[] = [];
    const judged = (password: string) => {
      const accepted = validatePasswordStrength(password).isValid;
      verdicts.push(accepted);
      return accepted;
    };

    const passwords = Array.from({ length: 1_000 }, () => proposePassword(level, { source: { username: 'alice' }, accept: judged }));

    expect(passwords.filter((password) => password.length !== PASSWORD_LEVEL_LENGTHS[level])).toEqual([]);
    expect(verdicts.filter((accepted) => !accepted).length).toBeLessThan(verdicts.length * 0.05);
  });
});

describe('proposePassword — un niveau intenable monte d’un cran au lieu d’échouer', () => {
  it('sert le niveau aléatoire quand la politique refuse toutes les formes lisibles', () => {
    const refusesTheBase = (password: string) => password.length >= HARD_PASSWORD_LENGTH;
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
