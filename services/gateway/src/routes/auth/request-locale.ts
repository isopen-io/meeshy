/**
 * Le rang 4 du Prisme tel que la requête le porte — partagé par l'inscription
 * et, depuis #8033, par la connexion qui crée un compte.
 *
 * @module routes/auth/request-locale
 */

import type { FastifyRequest } from 'fastify';
import { preferredAcceptLanguage } from '../../utils/accept-language';

/**
 * Le rang 4 du Prisme, tel que la REQUÊTE le porte.
 *
 * Deux sources, dans cet ordre : `X-Device-Locale`, que les clients Meeshy
 * posent explicitement, puis `Accept-Language`, que tout navigateur envoie sans
 * qu'on le lui demande. La seconde est une liste PONDÉRÉE et non ordonnée —
 * d'où `preferredAcceptLanguage` plutôt qu'un `split(',')[0]`, qui rendrait
 * `en` sur `en;q=0.5, fr`.
 *
 * Elle n'écrase JAMAIS une préférence exprimée : `registrationLanguages` ne la
 * consulte que lorsque l'inscription n'exprime AUCUN rang, exactement là où le
 * code écrivait auparavant le littéral `'fr'`.
 */
export function localeDeLaRequete(request: FastifyRequest): string | undefined {
  const entete = request.headers['x-device-locale'];
  const declaree = Array.isArray(entete) ? entete[0] : entete;
  if (typeof declaree === 'string' && declaree.trim() !== '') return declaree.trim();

  return preferredAcceptLanguage(request.headers['accept-language']);
}
