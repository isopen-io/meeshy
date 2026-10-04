import type { FastifyRequest, FastifyReply } from 'fastify';
import { isSovereign } from './authorize';

/**
 * Le motif écrit d'un geste d'administration : obligatoire pour tous, sauf
 * pour le rang SOUVERAIN (spec 2026-10-04 § 4 — « BIGBOSS n'a besoin de rien
 * justifier »).
 *
 * ## Pourquoi la règle quitte le schéma
 *
 * La validation de schéma (AJV/Zod) tourne AVANT le handler et ne connaît pas
 * l'acteur : elle ne peut pas dire « obligatoire, sauf pour lui ». Le schéma
 * ne garde donc plus que la FORME (une chaîne, bornée en haut) ; la présence et
 * la longueur minimale se décident ici, une fois, pour toutes les routes.
 *
 * ## Les trois règles
 *
 * 1. Un motif absent ou blanc est ABSENT — refusé pour un non-souverain,
 *    admis pour le souverain.
 * 2. Un motif FOURNI est validé, quel que soit le rang : un BIGBOSS qui écrit
 *    « ok » reçoit le même refus qu'un ADMIN. Écrire un motif, c'est accepter
 *    qu'il soit lisible.
 * 3. Le refus garde le MESSAGE qu'AJV rendait jusqu'ici (même enveloppe que
 *    `utils/schema-validation-error.ts`) : un client qui lisait le refus le lit
 *    toujours.
 */
// Les deux membres portent les deux clés : le gateway compile sans
// `strictNullChecks`, où une union discriminée par un booléen ne se resserre
// pas — lire `problem` d'un côté ou `reason` de l'autre doit rester typé.
export type ReasonVerdict =
  | { readonly ok: true; readonly reason: string | undefined; readonly problem?: undefined }
  | { readonly ok: false; readonly problem: 'missing' | 'short'; readonly reason?: undefined };

export function judgeReason(request: FastifyRequest, raw: unknown, min: number): ReasonVerdict {
  const reason = typeof raw === 'string' && raw.trim() !== '' ? raw : undefined;
  if (reason === undefined) {
    return isSovereign(request) ? { ok: true, reason: undefined } : { ok: false, problem: 'missing' };
  }
  if (reason.length < min) return { ok: false, problem: 'short' };
  return { ok: true, reason };
}

type Source = 'body' | 'querystring';

function lire(request: FastifyRequest, source: Source, field: string): unknown {
  const conteneur = source === 'body' ? request.body : request.query;
  return conteneur && typeof conteneur === 'object'
    ? (conteneur as Record<string, unknown>)[field]
    : undefined;
}

type Refus = { source: Source; min: number; field?: string };

/**
 * Le refus, sous la forme d'un refus de schéma AJV : `message`, `statusCode`
 * et `validation` identiques à ceux qu'AJV produisait quand le motif était au
 * schéma. Le gestionnaire global (`schemaValidationErrorResponse`) le rend donc
 * avec la même enveloppe et le même message qu'hier.
 */
export function reasonRefusalError(problem: 'missing' | 'short', options: Refus): Error {
  const field = options.field ?? 'reason';
  const violation = problem === 'missing'
    ? { instancePath: '', params: { missingProperty: field }, message: `must have required property '${field}'` }
    : { instancePath: `/${field}`, params: { limit: options.min }, message: `must NOT have fewer than ${options.min} characters` };
  const message = problem === 'missing'
    ? `${options.source} ${violation.message}`
    : `${options.source}/${field} ${violation.message}`;
  return Object.assign(new Error(message), {
    statusCode: 400,
    code: 'FST_ERR_VALIDATION',
    validation: [violation],
    validationContext: options.source,
  });
}

/**
 * Le même refus, rendu DEPUIS un handler (qui a ses propres gardes à faire
 * passer avant celle du motif) : l'enveloppe de `schemaValidationErrorResponse`.
 */
export function sendReasonRefusal(reply: FastifyReply, problem: 'missing' | 'short', options: Refus): FastifyReply {
  const erreur = reasonRefusalError(problem, options) as Error & { validation: { instancePath: string; params: { missingProperty?: string }; message: string }[] };
  const field = options.field ?? 'reason';
  const details = erreur.validation.map((v) => ({ field, message: v.message }));
  return reply.status(400).send({
    success: false,
    error: 'Validation Error',
    message: erreur.message,
    code: 'VALIDATION_ERROR',
    details,
    violations: details.map((d) => ({ path: d.field, message: d.message })),
  });
}

/**
 * La garde, en `preHandler` (APRÈS la validation de forme, AVANT le handler).
 * Le handler lit ensuite `reason` tel quel : absent seulement pour le
 * souverain.
 *
 * Elle REFUSE en levant, jamais en répondant : un hook `async` qui envoie sa
 * réponse laisse Fastify décider seul si la chaîne doit s'arrêter, et sous
 * `inject` le handler courait après le 400 — le geste avait lieu malgré le
 * refus. Une erreur levée arrête la chaîne à coup sûr.
 */
export function requireReasonUnlessSovereign(options: Refus) {
  const field = options.field ?? 'reason';
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const verdict = judgeReason(request, lire(request, options.source, field), options.min);
    if (verdict.problem) throw reasonRefusalError(verdict.problem, options);
    // Un motif blanc est un motif absent : on ne consigne pas une chaîne vide.
    const conteneur = options.source === 'body' ? request.body : request.query;
    if (verdict.reason === undefined && conteneur && typeof conteneur === 'object') {
      delete (conteneur as Record<string, unknown>)[field];
    }
  };
}
