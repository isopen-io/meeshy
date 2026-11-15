import { describe, expect, it } from 'vitest';

import { linkJoinProfileSchema } from '../types/link-join.js';

/**
 * LA FORME D'UNE DEMANDE DE JONCTION — une seule, opposable des DEUX côtés.
 *
 * Le schéma vivait dans `services/gateway/src/routes/anonymous.ts`, hors de
 * portée du web : la v3 devait donc soit deviner les contraintes, soit ne rien
 * valider avant d'écrire. Les deux fabriquent une jumelle — la première dérive
 * au premier `max(50)` déplacé, la seconde laisse le lecteur découvrir un refus
 * après l'aller-retour, sur un téléphone en 3G.
 */
describe('linkJoinProfileSchema', () => {
  const base = { firstName: 'Tolu', lastName: 'Bello' } as const;

  it('accepte le strict nécessaire — prénom et nom', () => {
    const issue = linkJoinProfileSchema.safeParse({ ...base, language: 'fr' });
    expect(issue.success).toBe(true);
  });

  it('refuse un prénom vide et un nom trop long', () => {
    expect(linkJoinProfileSchema.safeParse({ ...base, firstName: '' }).success).toBe(false);
    expect(linkJoinProfileSchema.safeParse({ ...base, lastName: 'x'.repeat(51) }).success).toBe(false);
  });

  /**
   * La normalisation est DANS le schéma, jamais chez l'appelant : la langue du
   * participant alimente l'ensemble des cibles de traduction, clé en minuscules
   * — un `fr-FR` stocké verbatim y injecterait une cible qui ne matche jamais.
   */
  it('canonicalise la langue plutôt que de la stocker verbatim', () => {
    const issue = linkJoinProfileSchema.safeParse({ ...base, language: 'fr-FR' });
    expect(issue.success && issue.data.language).toBe('fr');
  });

  it('laisse passer une chaîne vide pour un courriel ou une date absents', () => {
    const issue = linkJoinProfileSchema.safeParse({ ...base, email: '', birthday: '' });
    expect(issue.success).toBe(true);
  });

  it('refuse un courriel qui n’en est pas un', () => {
    expect(linkJoinProfileSchema.safeParse({ ...base, email: 'pas-un-courriel' }).success).toBe(false);
  });

  /**
   * `birthday` attend un instant ISO COMPLET, pas le `YYYY-MM-DD` d'un
   * `<input type="date">` : c'est la conversion que tout client doit faire, et
   * la seule façon de le savoir sans la lire dans le code d'un service est que
   * le schéma soit partagé.
   */
  it('refuse une date seule et accepte un instant ISO', () => {
    expect(linkJoinProfileSchema.safeParse({ ...base, birthday: '1990-04-12' }).success).toBe(false);
    expect(
      linkJoinProfileSchema.safeParse({ ...base, birthday: '1990-04-12T00:00:00.000Z' }).success,
    ).toBe(true);
  });
});
