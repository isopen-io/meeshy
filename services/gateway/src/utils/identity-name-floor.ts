/**
 * La borne d'un NOM en MODIFICATION, et le refus qui la nomme (#13825, audit).
 *
 * ## Pourquoi la borne n'est pas dans le schéma de modification
 *
 * L'iOS publié renvoie prénom, nom et nom affiché INCHANGÉS à chaque
 * enregistrement du profil, et la console d'administration la fiche entière.
 * Un compte créé sous l'ancienne borne (« A ») qui change sa bio recevrait un
 * 400 si les schémas de modification portaient le plancher de 2 : un ancien
 * client cesserait de fonctionner contre le nouveau serveur. Les schémas de
 * MODIFICATION gardent donc le minimum d'avant, et la borne se juge ICI, sur
 * les seuls noms CHANGÉS.
 *
 * ## Ce que « changé » veut dire
 *
 * La valeur reçue et la valeur stockée passent par la MÊME normalisation que
 * l'écriture (capitalisation, nettoyage) avant d'être comparées : un prénom
 * stocké « a » et renvoyé « a » n'a pas changé, même si la route l'écrit « A ».
 *
 * ## Sur quoi se mesure la borne
 *
 * Sur la valeur NORMALISÉE — celle qui sera stockée — en graphèmes visibles
 * (`visibleNameLength`) : « A » suivi d'un invisible, d'un caractère de
 * contrôle ou d'une balise vide, et « É » décomposé, ne font pas un nom de 2.
 */
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import { nameMinLength, usernameMinLength } from '@meeshy/shared/types/api-schemas/auth';
import { visibleNameLength, visibleNameText } from '@meeshy/shared/utils/visible-name-length';
import { sendBadRequest } from './response';
import { SecuritySanitizer } from './sanitize';

export type NameField = 'firstName' | 'lastName' | 'displayName';

/**
 * Un refus de longueur par champ. `minimum` est un NOMBRE pour que chaque client
 * compose sa propre phrase dans la langue de son interface ; `message` en est
 * la version française, pour les clients qui l'affichent tel quel.
 */
export type LengthViolation = { readonly path: string; readonly message: string; readonly minimum: number };

type NameValues = Partial<Record<NameField, string | null | undefined>>;

const NAME_FIELDS: readonly NameField[] = ['firstName', 'lastName', 'displayName'];

/** Le nom affiché s'EFFACE (`''` ou `null`) ; un prénom ou un nom, non. */
const ERASABLE: ReadonlySet<NameField> = new Set<NameField>(['displayName']);

const floorViolation = (path: string, minimum: number): LengthViolation => ({
  path,
  message: `${path} : au moins ${minimum} caractères`,
  minimum,
});

function violationFor(
  field: NameField,
  incoming: string | null,
  stored: string | null | undefined,
  normalize: (field: NameField, value: string) => string,
): LengthViolation | null {
  if (incoming === null) return null;
  const written = normalize(field, incoming);
  // Comparés sur leur texte VISIBLE (NFC compris) : un nom stocké décomposé
  // (NFD) et renvoyé composé (NFC) n'a pas changé.
  const shown = visibleNameText(written);
  const unchanged = stored !== null && stored !== undefined
    && (shown === visibleNameText(stored) || shown === visibleNameText(normalize(field, stored)));
  if (unchanged) return null;
  if (ERASABLE.has(field) && shown === '') return null;
  if (visibleNameLength(written) >= nameMinLength) return null;
  return floorViolation(field, nameMinLength);
}

/**
 * Les noms CHANGÉS qui passent sous la borne. `incoming` porte les champs du
 * corps (absent = non touché, `null` = effacement) ; `stored` la ligne lue
 * avant l'écriture (`null` si elle n'a pas été trouvée : tout est alors jugé).
 */
export function changedNameViolations(options: {
  readonly incoming: NameValues;
  readonly stored: NameValues | null;
  readonly normalize: (field: NameField, value: string) => string;
}): readonly LengthViolation[] {
  return NAME_FIELDS
    .filter((field) => options.incoming[field] !== undefined)
    .map((field) => violationFor(field, options.incoming[field] ?? null, options.stored?.[field], options.normalize))
    .filter((violation): violation is LengthViolation => violation !== null);
}

const minimumOf = (issue: z.ZodError['issues'][number]): number | null => {
  if (issue.code === 'too_small' && issue.origin === 'string') return Number(issue.minimum);
  if (issue.code === 'custom' && typeof issue.params?.minimum === 'number') return issue.params.minimum;
  return null;
};

/**
 * Le nom d'un INVITÉ, mesuré sur ce que la jonction STOCKE
 * (`SecuritySanitizer.sanitizeText`, `link-admission.ts` `joinAsGuest`) :
 * DOMPurify retire aussi une balise non fermée ou le contenu d'un `<script>`,
 * si bien que « A<xy » passerait toute mesure faite avant lui et serait stocké
 * « A ».
 */
export function storedGuestNameViolation(path: string, value: string | undefined): LengthViolation | null {
  if (visibleNameLength(SecuritySanitizer.sanitizeText(value ?? '')) >= nameMinLength) return null;
  return floorViolation(path, nameMinLength);
}

/**
 * Le pseudo SAISI d'un invité, mesuré sur la base qui le SERT
 * (`SecuritySanitizer.sanitizeUsername`, `[a-zA-Z0-9_.-]`). Absent ou blanc, il
 * reste permis : la passerelle nomme alors l'invité elle-même.
 */
export function servedGuestNicknameViolation(path: string, value: string | undefined): LengthViolation | null {
  const typed = (value ?? '').trim();
  if (typed === '') return null;
  if (SecuritySanitizer.sanitizeUsername(typed).length >= usernameMinLength) return null;
  return floorViolation(path, usernameMinLength);
}

/** Les violations réelles d'une liste de mesures. */
export const presentViolations = (violations: readonly (LengthViolation | null)[]): readonly LengthViolation[] =>
  violations.filter((violation): violation is LengthViolation => violation !== null);

/**
 * Les refus de LONGUEUR d'une erreur Zod — borne native (`.min`) ou borne
 * visible (`lengthFloorRefusal`, qui porte son minimum en paramètre).
 */
export function lengthFloorViolations(error: z.ZodError): readonly LengthViolation[] {
  return error.issues.flatMap((issue) => {
    const minimum = minimumOf(issue);
    if (minimum === null) return [];
    return [floorViolation(issue.path.map(String).join('.'), minimum)];
  });
}

/**
 * Le 400 d'un refus de longueur : la MÊME enveloppe que le refus générique
 * de la route (même `error`, même `code`), le champ et le minimum dans
 * `message`, le détail par champ dans `violations` — un ancien client qui lit
 * `error` ne voit aucune différence.
 */
export function sendLengthFloorRefusal(reply: FastifyReply, error: string, violations: readonly LengthViolation[]): void {
  sendBadRequest(reply, error, {
    message: violations.map((violation) => violation.message).join(' ; '),
    violations: [...violations],
  });
}

/** Le refus d'une erreur Zod : enrichi si elle porte un refus de longueur, générique sinon. */
export function sendZodRefusal(reply: FastifyReply, error: string, zodError: z.ZodError): void {
  const violations = lengthFloorViolations(zodError);
  if (violations.length === 0) {
    sendBadRequest(reply, error);
    return;
  }
  sendLengthFloorRefusal(reply, error, violations);
}
