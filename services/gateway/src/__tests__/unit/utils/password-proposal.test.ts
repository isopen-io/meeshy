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

  it('va du plus court au plus long à partir de « facile », et le niveau difficile ignore le pseudo', () => {
    const proposals = proposePasswords({ source: { username: 'alice' } });

    expect(proposals.easy.length).toBeLessThan(proposals.medium.length);
    expect(proposals.medium.length).toBeLessThan(proposals.hard.length);
    expect(proposals.hard).toHaveLength(HARD_PASSWORD_LENGTH);
    expect(proposals.hard.toLowerCase()).not.toContain('alice');
  });

  it('dérive les niveaux facile et moyen du pseudo', () => {
    const proposals = proposePasswords({ source: { username: 'alice' } });

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

describe('le niveau simple (#8192) — facile à taper, pas facile à deviner', () => {
  const SAMPLES = 20_000;
  const simples = (username: string) =>
    Array.from({ length: SAMPLES }, () => proposePassword('simple', { source: { username } }));

  it('se complète toujours de chiffres voisins ou répétés, comme 4545, 1223 ou 3456', () => {
    for (const password of simples('alice').slice(0, 500)) {
      const digits = password.match(/[2-9]{4}/)?.[0];
      expect({ password, digits }).toEqual({ password, digits: expect.any(String) });
      const [a, b, c, d] = [...digits!].map(Number);
      const repeatedPair = a === c && b === d;
      const doubledPairs = a === b && c === d;
      const stair = b === a! + 1 && c === b && d === c! + 1;
      const run = b === a! + 1 && c === b! + 1 && d === c! + 1;
      expect({ password, shaped: repeatedPair || doubledPairs || stair || run }).toEqual({ password, shaped: true });
    }
  });

  it('prend le pseudo PARFOIS, et le plus souvent des lettres voisines au clavier', () => {
    const drawn = simples('alice').slice(0, 2_000);
    const withPseudo = drawn.filter((password) => password.toLowerCase().includes('alice')).length;

    expect(withPseudo).toBeGreaterThan(drawn.length * 0.1);
    expect(withPseudo).toBeLessThan(drawn.length * 0.6);
    expect(drawn.some((password) => /zert|qsdf|wxcv|azer|erty|sdfg|xcvb/i.test(password))).toBe(true);
  });

  it('ne se devine plus en quelques centaines d’essais : 20 000 tirages pour un même pseudo restent presque tous distincts', () => {
    const distinct = new Set(simples('alice')).size;

    expect(distinct).toBeGreaterThan(SAMPLES * 0.8);
  });

  it('reste au niveau simple : la politique de robustesse l’accepte presque toujours au premier tirage', () => {
    const verdicts: boolean[] = [];
    const judged = (password: string) => {
      const accepted = validatePasswordStrength(password).isValid;
      verdicts.push(accepted);
      return accepted;
    };

    const drawn = Array.from({ length: 2_000 }, () => proposePassword('simple', { source: { username: 'alice' }, accept: judged }));

    expect(drawn.filter((password) => password.includes('-') || password.length >= HARD_PASSWORD_LENGTH)).toEqual([]);
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
