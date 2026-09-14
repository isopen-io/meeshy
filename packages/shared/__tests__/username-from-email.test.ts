/**
 * LE PSEUDO TIRÉ D'UNE ADRESSE (#6424).
 *
 * Directive porteur 2026-09-14 : « on met un e-mail, tu crées un compte avec le
 * pseudo pris de la première partie de l'e-mail, le display name pareil ».
 *
 * Ce que la loi doit garantir, et pourquoi un témoin par garantie :
 *
 * 1. **Le résultat est ACCEPTÉ par le contrat d'inscription.** `registerRequest`
 *    exige `^[a-zA-Z0-9_-]+$` sur 2 à 16 caractères ; une partie locale
 *    d'adresse n'a aucune de ces contraintes. Un pseudo refusé APRÈS que
 *    l'utilisateur a cru s'inscrire est le défaut que cette loi existe pour
 *    empêcher — donc le témoin le plus important est celui qui rejoue le
 *    contrat, pas celui qui vérifie une chaîne attendue.
 * 2. **`null` plutôt qu'un pseudo inventé.** Quand il ne reste rien de
 *    conforme, l'appelant doit DEMANDER — jamais fabriquer un identifiant que
 *    l'utilisateur ne reconnaîtrait pas comme le sien.
 * 3. **Les propositions de collision restent dans les bornes.** C'est sur les
 *    pseudos les plus DISPUTÉS que la deuxième proposition sert, donc c'est là
 *    qu'un débordement de borne échouerait — exactement au pire moment.
 */

import { describe, expect, it } from 'vitest';
import {
  USERNAME_MAX,
  USERNAME_MIN,
  displayNameFromEmail,
  usernameCandidates,
  usernameFromEmail,
} from '../utils/username-from-email.js';
import { registerRequestSchema } from '../types/api-schemas/auth.js';

/** Le contrat, relu depuis le schéma servi — jamais recopié. */
const contrat = (() => {
  const propriete = registerRequestSchema.properties.username as {
    pattern: string;
    minLength: number;
    maxLength: number;
  };
  return {
    motif: new RegExp(propriete.pattern),
    min: propriete.minLength,
    max: propriete.maxLength,
  };
})();

describe('usernameFromEmail — le pseudo tiré de la partie locale', () => {
  it('prend la partie locale telle quelle quand elle est déjà conforme', () => {
    expect(usernameFromEmail('marie@example.com')).toBe('marie');
  });

  it('coupe le sous-adressage : le `+` filtre le courrier, il ne nomme personne', () => {
    expect(usernameFromEmail('jean+meeshy@example.com')).toBe('jean');
  });

  it('déplie les diacritiques au lieu de les supprimer', () => {
    expect(usernameFromEmail('jérôme@example.com')).toBe('jerome');
  });

  it('réduit les caractères hors contrat à un seul séparateur, sans bords', () => {
    expect(usernameFromEmail('marie..dupont.@example.com')).toBe('marie-dupont');
  });

  it('abaisse la casse — deux adresses qui n’en diffèrent que là donnent un seul pseudo', () => {
    expect(usernameFromEmail('Marie@example.com')).toBe(usernameFromEmail('marie@example.com'));
  });

  it('tronque à la borne haute du contrat', () => {
    const pseudo = usernameFromEmail('unnomvraimenttreslong@example.com');
    expect(pseudo).not.toBeNull();
    expect(pseudo!.length).toBe(USERNAME_MAX);
  });

  it('rend `null` — jamais un pseudo inventé — quand il ne reste rien de conforme', () => {
    expect(usernameFromEmail('...@example.com')).toBeNull();
    expect(usernameFromEmail('好@example.com')).toBeNull();
    expect(usernameFromEmail('@example.com')).toBeNull();
  });

  it('rend `null` sous la borne basse plutôt qu’un pseudo d’une lettre', () => {
    expect(usernameFromEmail('a@example.com')).toBeNull();
    expect(USERNAME_MIN).toBe(contrat.min);
  });

  it('TOUT pseudo rendu satisfait le contrat servi par `registerRequestSchema`', () => {
    const adresses = [
      'marie@example.com',
      'jean+meeshy@example.com',
      'jérôme@example.com',
      'marie..dupont.@example.com',
      'MARIE.DUPONT@EXAMPLE.COM',
      'unnomvraimenttreslong@example.com',
      'a.b@example.com',
      "o'brien@example.com",
      'user_name-42@example.com',
      'ano_bob@example.com',
    ];

    for (const adresse of adresses) {
      const pseudo = usernameFromEmail(adresse);
      if (pseudo === null) continue;
      expect(contrat.motif.test(pseudo), `${adresse} → ${pseudo}`).toBe(true);
      expect(pseudo.length, `${adresse} → ${pseudo}`).toBeGreaterThanOrEqual(contrat.min);
      expect(pseudo.length, `${adresse} → ${pseudo}`).toBeLessThanOrEqual(contrat.max);
    }
  });
});

describe('usernameCandidates — la suite de propositions pour l’unicité', () => {
  it('propose d’abord le pseudo nu, puis un COMPTEUR lisible', () => {
    expect(usernameCandidates('marie@example.com', 3)).toEqual(['marie', 'marie2', 'marie3']);
  });

  it('CHAQUE proposition satisfait le contrat, y compris sur un pseudo à la borne', () => {
    for (const proposition of usernameCandidates('unnomvraimenttreslong@example.com', 15)) {
      expect(contrat.motif.test(proposition), proposition).toBe(true);
      expect(proposition.length, proposition).toBeLessThanOrEqual(contrat.max);
      expect(proposition.length, proposition).toBeGreaterThanOrEqual(contrat.min);
    }
  });

  it('les propositions sont DISTINCTES — une liste qui se répète ne débloque rien', () => {
    const propositions = usernameCandidates('unnomvraimenttreslong@example.com', 20);
    expect(new Set(propositions).size).toBe(propositions.length);
  });

  it('rend une suite VIDE quand aucun pseudo ne se tire de l’adresse', () => {
    expect(usernameCandidates('...@example.com')).toEqual([]);
  });
});

describe('displayNameFromEmail — le nom qu’on LIT', () => {
  it('rend les séparateurs à l’espace et capitalise chaque mot', () => {
    expect(displayNameFromEmail('marie.dupont@example.com')).toBe('Marie Dupont');
  });

  it('reste distinct du pseudo : le pseudo est un identifiant, le nom se lit', () => {
    expect(displayNameFromEmail('jean_luc@example.com')).toBe('Jean Luc');
    expect(usernameFromEmail('jean_luc@example.com')).toBe('jean_luc');
  });

  it('rend `null` exactement quand le pseudo est `null`', () => {
    expect(displayNameFromEmail('...@example.com')).toBeNull();
  });
});
