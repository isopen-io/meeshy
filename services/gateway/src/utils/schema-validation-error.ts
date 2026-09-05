/**
 * Traduit un refus de schéma Fastify en réponse qui DIT ce qui ne va pas.
 *
 * Le gestionnaire global reconnaissait la `ValidationError` maison et rendait
 * son message ; il ne reconnaissait pas celle de Fastify — le rejet produit par
 * le schéma Ajv du `body`, avant même que le handler de route ne s'exécute. Ces
 * erreurs tombaient dans le repli générique et ressortaient en
 * `{ error: "Internal Server Error", message: "An unexpected error occurred" }`
 * sous un code 400 : le client apprenait qu'il avait tort, jamais sur quoi.
 *
 * C'est la moitié restante du défaut d'inscription du 2026-08-18. La borne de
 * mot de passe est réparée, mais sans ceci toute saisie réellement invalide
 * reste muette — et « une erreur inattendue » sur un formulaire rempli est
 * indiscernable d'une panne serveur, donc irréparable par l'utilisateur.
 *
 * Le discriminant est `err.validation`, le tableau de violations que Fastify
 * attache. PAS le code 400 seul : un refus métier (conversation fermée, garde
 * d'accès) porte le même code, et l'habiller en « erreur de validation » lui
 * collerait un `details` vide qui promettrait une précision inexistante.
 */

export type SchemaValidationErrorResponse = {
  /**
   * Le champ que tout client teste EN PREMIER — et le seul que ce producteur
   * omettait (#4688).
   *
   * `validationErrorResponseSchema` le DÉCLARE, le format de réponse du dépôt
   * est `{ success, data?, error? }`, et la branche voisine du même
   * gestionnaire (`TypedErrorBody`) le pose depuis toujours : une
   * `ValidationError` LEVÉE et un refus d'Ajv sortaient donc sous le même
   * statut, le même `code` et le même schéma, avec deux enveloppes
   * différentes. `if (!body.success)` s'en tirait par accident sur
   * `undefined` ; `if (body.success === false)` — la forme qu'un contrat typé
   * encourage — ne reconnaissait pas le refus.
   */
  readonly success: false;
  readonly error: 'Validation Error';
  readonly message: string;
  readonly code: 'VALIDATION_ERROR';
  /**
   * Le canal de retour du STATUT, jamais un champ de fil.
   *
   * `validationErrorResponseSchema` ne le déclare pas, et c'est sans
   * conséquence : le gestionnaire l'EXTRAIT du corps avant d'envoyer
   * (`const { statusCode: refusStatus, ...corpsRefus } = schemaRefusal`) et
   * s'en sert comme statut HTTP — exactement comme `TypedErrorBody.statusCode`.
   * Le retirer priverait `server.ts` de son statut ; le déclarer dans
   * `packages/shared` le ferait voyager sur les 595 déclarations de statut que
   * #4689 vient de nettoyer. Mesuré, pas affirmé :
   * `__tests__/unit/routes/schema-refusal-carries-success-flag.test.ts`.
   */
  readonly statusCode: 400;
  /** Une entrée par violation — le formulaire peut surligner chaque champ. */
  readonly details: readonly { readonly field: string; readonly message: string }[];
};

type FastifyValidationViolation = {
  instancePath?: string;
  params?: { missingProperty?: string };
  message?: string;
};

/**
 * Nom du champ tel qu'un formulaire le connaît.
 *
 * `instancePath` vaut `/password` pour une contrainte violée, et la chaîne VIDE
 * quand la propriété manque — c'est alors `params.missingProperty` qui la
 * nomme. Ne lire que le premier laisserait « champ obligatoire absent » sans
 * champ, le cas le plus fréquent d'un formulaire incomplet.
 */
function fieldName(violation: FastifyValidationViolation): string {
  const fromPath = (violation.instancePath ?? '').replace(/^\//, '').replace(/\//g, '.');
  return fromPath || violation.params?.missingProperty || 'body';
}

export function schemaValidationErrorResponse(error: unknown): SchemaValidationErrorResponse | null {
  if (!error || typeof error !== 'object') return null;

  const violations = (error as { validation?: unknown }).validation;
  if (!Array.isArray(violations) || violations.length === 0) return null;

  const details = (violations as FastifyValidationViolation[]).map((violation) => ({
    field: fieldName(violation),
    message: violation.message ?? 'invalide',
  }));

  return {
    success: false,
    error: 'Validation Error',
    // Le message de Fastify nomme déjà le champ (`body/password must NOT have
    // fewer than 6 characters`) : on le garde tel quel plutôt que d'en
    // fabriquer un second, qui divergerait du `details`.
    message: (error as { message?: string }).message ?? 'Données invalides',
    code: 'VALIDATION_ERROR',
    statusCode: 400,
    details,
  };
}
