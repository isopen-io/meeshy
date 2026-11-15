/**
 * `validatePasswordStrength` — la règle unique extraite de
 * `PasswordResetService` par #3629, désormais partagée par l'inscription,
 * le changement de mot de passe authentifié, la création admin et la
 * réinitialisation admin.
 *
 * Score proportionnel à la longueur, sans classe de caractères imposée
 * (#6436) — voir le doc-comment de `password-strength.ts` pour la mesure qui
 * justifie les paliers.
 */
import { describe, it, expect } from '@jest/globals';
import { validatePasswordStrength, minPasswordScoreForLength } from '../../utils/password-strength';
import { PASSWORD_MIN_LENGTH } from '@meeshy/shared/utils/validation';

describe('validatePasswordStrength', () => {
  it('accepts a long, varied, high-entropy password', () => {
    const result = validatePasswordStrength('Xk9$mQ2vLp8#nR4wZ');
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a password shorter than PASSWORD_MIN_LENGTH', () => {
    const short = 'Ab1'.padEnd(PASSWORD_MIN_LENGTH - 1, 'a');
    const result = validatePasswordStrength(short);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(`minimum ${PASSWORD_MIN_LENGTH} characters`);
  });

  it('accepts a password with no character-class variety at all, as long as its zxcvbn score clears the bar for its length', () => {
    // Exactement ce que la règle de composition interdisait avant #6436 :
    // pas de majuscule, pas de chiffre — et pourtant pas trivialement
    // devinable à cette longueur.
    const result = validatePasswordStrength('correcthorsebatterystaple');
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("proves the declared PASSWORD_MIN_LENGTH is reachable: a password of exactly that length can pass", () => {
    // Le critère de fin de #6436 : ce témoin serait ROUGE sous l'ancienne
    // règle (score >= 3 fixe), qu'aucun mot de passe de 6 caractères
    // n'atteint jamais, si aléatoire soit-il.
    const password = 'Vr7#tL';
    expect(password).toHaveLength(PASSWORD_MIN_LENGTH);

    const result = validatePasswordStrength(password);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a common, guessable password at PASSWORD_MIN_LENGTH on zxcvbn score alone', () => {
    // Un motif du top-100 (score 0) reste refusé même à la longueur minimale.
    const result = validatePasswordStrength('123456');
    expect(result.isValid).toBe(false);
    const scoreError = result.errors.find((e) => e.includes('password strength score'));
    expect(scoreError).toBeDefined();
    expect(scoreError).toContain(`minimum: ${minPasswordScoreForLength(6)}/4`);
  });

  it('rejects a common, guessable password well past PASSWORD_MIN_LENGTH on zxcvbn score alone', () => {
    // Longueur et classes de caractères réunies ne suffisent pas à couvrir un
    // motif connu — exactement le cas que la longueur seule ne peut pas
    // attraper.
    const result = validatePasswordStrength('Password12345');
    expect(result.isValid).toBe(false);
    const scoreError = result.errors.find((e) => e.includes('password strength score'));
    expect(scoreError).toBeDefined();
    expect(scoreError).toContain(`minimum: ${minPasswordScoreForLength('Password12345'.length)}/4`);
  });

  describe('minPasswordScoreForLength', () => {
    it('is monotonically non-decreasing with length', () => {
      let previous = 0;
      for (let length = PASSWORD_MIN_LENGTH; length <= 40; length++) {
        const score = minPasswordScoreForLength(length);
        expect(score).toBeGreaterThanOrEqual(previous);
        previous = score;
      }
    });

    it('never exceeds the zxcvbn scale', () => {
      expect(minPasswordScoreForLength(1000)).toBeLessThanOrEqual(4);
    });
  });
});
