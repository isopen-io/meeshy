/**
 * L'évaluation de robustesse d'un mot de passe — UNE règle, pour tous les
 * sites qui en acceptent un (#3629).
 *
 * Avant ce fichier, `zxcvbn` n'était appelé qu'à UN endroit —
 * `PasswordResetService.validatePasswordStrength`, une méthode privée
 * consultée par le seul flux `/forgot-password` → complétion du reset.
 * L'inscription, le changement de mot de passe authentifié et les deux
 * gestes admin (création, réinitialisation) ne validaient que la LONGUEUR
 * (`PASSWORD_MIN_LENGTH`, via Zod) : un mot de passe de douze `a` passait
 * partout sauf au reset.
 *
 * Extrait ici pour que les cinq portes appellent la MÊME fonction plutôt que
 * de retaper — ou de ne jamais retaper — le même jugement.
 *
 * ## Score PROPORTIONNEL à la longueur, et pas de classes de caractères (#6436)
 *
 * Ce fichier exigeait un score `zxcvbn` ≥ 3/4 ET les quatre classes de
 * caractères, quelle que soit la longueur. `PASSWORD_MIN_LENGTH` valant 6
 * depuis le 2026-09-13 (directive porteur, friction d'inscription mesurée),
 * la borne DÉCLARÉE était devenue inatteignable : mesuré avec ce `zxcvbn`
 * (4.4.2), AUCUN mot de passe de 6 à 8 caractères — même engendré
 * aléatoirement sur un alphabet de 70+ symboles — n'atteint le score 3. Le
 * plafond n'est pas un réglage, c'est la façon dont `zxcvbn` estime le temps
 * de cassage : la longueur elle-même borne le score accessible.
 *
 * La réponse retenue (option 3 de #6436, recommandée par NIST SP 800-63B) :
 * pas de règle de composition — un long mot de passe/passphrase doit passer
 * SANS classes de caractères — et un plancher de score PROPORTIONNEL à ce que
 * la longueur permet d'atteindre, pour qu'un mot de passe court reste soumis
 * au maximum de rigueur que sa longueur autorise. Les paliers sont choisis
 * pour rester ATTEIGNABLES à leur propre borne basse (vérifié empiriquement
 * avec ce `zxcvbn`) :
 *
 * | longueur | score minimal | plafond mesuré à la borne basse |
 * |---|---|---|
 * | [`PASSWORD_MIN_LENGTH`, 10) | 1 | 6 caractères aléatoires atteignent 1, jamais 2 |
 * | [10, 16) | 2 | 10 caractères aléatoires atteignent jusqu'à 3 |
 * | [16, ∞) | 3 | une passphrase de 16+ caractères atteint 3-4 sans classes forcées |
 *
 * Un score 1 n'écarte que les mots de passe les plus devinables (motifs du
 * top-100, séquences, répétitions) — c'est le seul plancher que la longueur
 * DÉCLARÉE permette de tenir, et il reste strictement plus sévère que
 * l'ancienne règle, qui n'appliquait AUCUNE borne de score en dessous de 12
 * caractères (le score n'était vérifié qu'après le passage des quatre
 * classes, jamais indépendamment de la longueur).
 */
import zxcvbn from 'zxcvbn';
import { PASSWORD_MIN_LENGTH } from '@meeshy/shared/utils/validation';

/**
 * Paliers `{ longueur minimale, score zxcvbn minimal }`, du plus long au plus
 * court — le premier palier dont la longueur est atteinte gouverne.
 */
const PASSWORD_SCORE_TIERS: ReadonlyArray<{ readonly minLength: number; readonly minScore: number }> = [
  { minLength: 16, minScore: 3 },
  { minLength: 10, minScore: 2 },
  { minLength: 0, minScore: 1 },
];

/** Score zxcvbn minimal (0-4) exigé pour un mot de passe de cette longueur. */
export function minPasswordScoreForLength(length: number): number {
  const tier = PASSWORD_SCORE_TIERS.find((candidate) => length >= candidate.minLength);
  return tier ? tier.minScore : 1;
}

export interface PasswordStrengthResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Longueur + score `zxcvbn` proportionnel à cette longueur — aucune classe de
 * caractères n'est exigée (§ ci-dessus, #6436).
 */
export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`minimum ${PASSWORD_MIN_LENGTH} characters`);
  }

  const minScore = minPasswordScoreForLength(password.length);
  const result = zxcvbn(password);
  if (result.score < minScore) {
    errors.push(`password strength score is ${result.score}/4 (minimum: ${minScore}/4)`);
    if (result.feedback.warning) {
      errors.push(result.feedback.warning);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
