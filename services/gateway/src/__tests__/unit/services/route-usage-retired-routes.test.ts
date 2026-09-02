/**
 * Une adresse RETIRÉE reste comptable — sinon son zéro ne prouve rien (#4365).
 *
 * Quatre lots de retrait (#4186, #4187, #4188, #4190) portent le même critère :
 * « grep sur les trois clients ET journaux d'accès du gateway sur 30 jours à
 * zéro ». La première moitié a été faite ; la seconde ne POUVAIT pas l'être —
 * le compteur (#4275) est arrivé après, et il s'attache aux routes SERVIES.
 *
 * Une adresse qui n'est plus montée rend `routePattern: undefined`, donc son
 * trafic tombait dans le seau unique `(unrouted)`, avec toutes les fautes de
 * frappe de la planète. **On savait qu'il y avait des 404 ; jamais sur quoi.**
 *
 * ## Le zéro qui prouve, et celui qui ne prouve pas
 *
 * Un couple ABSENT de `ROUTES_RETIREES` et à zéro dans `(unrouted)` ne prouve
 * rien — l'agrégat noie tout. Un couple PRÉSENT et à zéro prouve qu'aucune
 * requête n'a atteint cette adresse. C'est la seule forme de zéro qui vaille,
 * et elle exige de DÉCLARER ce qu'on surveille avant de pouvoir l'affirmer.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { routeRetireeDe, ROUTES_RETIREES } from '../../../services/route-usage.service';

describe('Adresses retirées — comptables par déclaration (#4365)', () => {
  it('nomme une adresse retirée au lieu de la noyer dans `(unrouted)`', () => {
    expect(routeRetireeDe({ method: 'GET', rawPath: '/api/v1/me/me' })).toBe('/api/v1/me/me');
    expect(routeRetireeDe({ method: 'POST', rawPath: '/api/v1/auth/validate-session' }))
      .toBe('/api/v1/auth/validate-session');
  });

  it('ignore la chaîne de requête — une adresse reste la même avec ou sans paramètres', () => {
    expect(routeRetireeDe({ method: 'GET', rawPath: '/api/v1/me/me?fields=id' })).toBe('/api/v1/me/me');
  });

  it('exige la MÉTHODE aussi — `GET` sur une adresse retirée en `POST` n\'est pas elle', () => {
    // Sans cette exigence, un balayeur qui `GET` toutes les URL connues
    // fabriquerait du trafic sur une adresse retirée en POST, et le zéro
    // qu'on cherche à établir deviendrait un faux positif.
    expect(routeRetireeDe({ method: 'GET', rawPath: '/api/v1/auth/validate-session' })).toBeUndefined();
  });

  it('ne nomme PAS une adresse non déclarée — la cardinalité reste bornée par déclaration', () => {
    // C'est la garde qui empêche un appelant de fabriquer autant de seaux
    // qu'il veut en inventant des chemins.
    expect(routeRetireeDe({ method: 'GET', rawPath: '/api/v1/chemin/invente/par/un/robot' })).toBeUndefined();
    expect(routeRetireeDe({ method: 'GET', rawPath: undefined })).toBeUndefined();
  });

  it('la table ne contient que des adresses SANS paramètre — la comparaison est littérale', () => {
    // Un `:param` dans cette table ne matcherait jamais : le chemin brut porte
    // une valeur, pas un gabarit. Mieux vaut l'interdire que de le découvrir
    // sur un zéro qui ne veut rien dire.
    for (const entree of ROUTES_RETIREES) {
      expect(entree).not.toContain(':');
      expect(entree).toMatch(/^(GET|POST|PUT|PATCH|DELETE) \/api\//);
    }
  });
});
