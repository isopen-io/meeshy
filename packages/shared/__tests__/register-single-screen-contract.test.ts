/**
 * L'inscription tient sur UN écran à trois champs (#5216) — et les DEUX
 * couches qui la valident disent la même chose.
 *
 * ## Ce que ce témoin garde, et pourquoi il faut les deux couches
 *
 * `POST /auth/register` traverse Ajv (`registerRequestSchema`, appliqué par
 * Fastify AVANT le handler) puis Zod (`AuthSchemas.register`, appliqué DANS le
 * handler). Une couche plus stricte que l'autre rend un refus que la seconde
 * n'explique pas : c'est exactement le défaut de longueur de mot de passe que
 * `password-min-length-parity.test.ts` a fermé, une couche plus bas.
 *
 * Ici la règle est une DISJONCTION — `displayName`, ou bien le couple
 * `firstName`/`lastName` — et elle ne s'exprime pas de la même façon des deux
 * côtés (`anyOf` chez Ajv, `superRefine` chez Zod). C'est précisément la forme
 * qui dérive : chaque couche est relue seule, et rien ne les compare.
 *
 * Ce paquet ne dépend pas d'Ajv (le compilateur vit chez Fastify, dans le
 * gateway) : les assertions ci-dessous portent donc sur la STRUCTURE du schéma
 * — ce qu'Ajv en fera est mécanique — et le verdict d'un Ajv RÉEL, monté dans
 * Fastify, est mesuré par
 * `services/gateway/src/__tests__/unit/routes/register-contract.test.ts`. Même
 * partage que `username-pattern.test.ts`.
 *
 * ## Le témoin le plus cher du fichier : l'absence de `default`
 *
 * `registerRequestSchema` posait `default: 'fr'` sur `systemLanguage` et
 * `regionalLanguage`. Ajv APPLIQUE les défauts — il ÉCRIT dans le corps avant
 * que le handler ne le voie. Une inscription qui n'exprime AUCUNE langue
 * arrivait donc au service en demandant du français, si bien que la descente de
 * `registration-languages.ts` (rang 1 ← rang 2 ← rang 3 ← locale appareil) ne
 * pouvait JAMAIS atteindre son dernier rang : le littéral était déjà là.
 *
 * > Un `default` de schéma n'est pas une commodité de documentation : c'est une
 * > ÉCRITURE dans la charge, faite avant le seul code qui saurait s'en passer.
 */

import { describe, it, expect } from 'vitest';

import { registerRequestSchema, personNamePatternSource } from '../types/api-schemas.js';
import { AuthSchemas } from '../utils/validation.js';

const zodOk = (corps: Record<string, unknown>) => AuthSchemas.register.safeParse(corps).success;

const TROIS_CHAMPS = {
  displayName: 'Lena Vogel',
  email: 'lena@example.com',
  password: 'Xk9$mQ2vLp8#nR4wZ',
} as const;

const HERITE = {
  username: 'lena',
  firstName: 'Lena',
  lastName: 'Vogel',
  email: 'lena@example.com',
  password: 'Xk9$mQ2vLp8#nR4wZ',
} as const;

describe('Zod accepte le formulaire à TROIS champs comme la charge héritée', () => {
  it('accepte { displayName, email, password }', () => {
    expect(zodOk({ ...TROIS_CHAMPS })).toBe(true);
  });

  it('accepte encore la charge HÉRITÉE { username, firstName, lastName }', () => {
    expect(zodOk({ ...HERITE })).toBe(true);
  });
});

describe("L'ADRESSE SEULE SUFFIT — la disjonction d'identité est TOMBÉE (#6424)", () => {
  /**
   * Ce bloc gardait l'inverse, et il avait raison de le faire tant que le
   * serveur ne savait pas nommer un compte sans qu'on le lui dise. Il le sait
   * depuis `displayNameDepuisEmail` / `pseudoRacine` : la disjonction refusait
   * donc une inscription au motif d'une donnée que le handler juste en dessous
   * fabrique.
   *
   * Ce que le témoin garde MAINTENANT est plus fort que la disjonction : que
   * les DEUX couches soient tombées ENSEMBLE. Une seule des deux, et le refus
   * serait rendu par la couche que l'autre n'explique pas — la panne exacte
   * que ce fichier existe pour empêcher.
   */
  const adresseSeule = { email: 'lena@example.com' };

  it("Ajv n'exige plus que l'e-mail", () => {
    expect([...registerRequestSchema.required]).toEqual(['email']);
  });

  it("Ajv ne porte plus d'anyOf d'identité", () => {
    expect(registerRequestSchema).not.toHaveProperty('anyOf');
  });

  it("Zod accepte une charge qui ne porte QUE l'adresse", () => {
    expect(zodOk({ ...adresseSeule })).toBe(true);
  });

  it('Zod accepte un firstName SEUL — le serveur complète le reste', () => {
    expect(zodOk({ ...adresseSeule, firstName: 'Lena' })).toBe(true);
  });

  it("Zod exige toujours l'ADRESSE — c'est la seule source qui nomme le compte", () => {
    expect(zodOk({ displayName: 'Lena Vogel', password: 'Xk9$mQ2vLp8#nR4wZ' })).toBe(false);
  });

  it('Zod refuse toujours une adresse MAL FORMÉE', () => {
    expect(zodOk({ email: 'pas-une-adresse' })).toBe(false);
  });
});

describe('le MOT DE PASSE est facultatif — le lien magique est la porte (#6424)', () => {
  it("Ajv ne l'exige plus", () => {
    expect([...registerRequestSchema.required]).not.toContain('password');
  });

  it("Zod accepte une inscription qui n'en porte aucun", () => {
    expect(zodOk({ email: 'lena@example.com' })).toBe(true);
  });

  it('Zod laisse le mot de passe ABSENT plutôt que de poser une chaîne vide', () => {
    // Un `''` persisté serait haché : un secret que personne ne connaît, et
    // surtout indistinguable d'un vrai à la lecture. L'absence doit rester
    // l'absence jusqu'à `User.password = null`.
    expect(AuthSchemas.register.parse({ email: 'lena@example.com' }).password).toBeUndefined();
  });

  it('la borne de longueur s’applique encore à un mot de passe FOURNI', () => {
    expect(zodOk({ email: 'lena@example.com', password: 'aX1' })).toBe(false);
  });

  it('Ajv garde la même borne sur la valeur fournie', () => {
    expect(registerRequestSchema.properties.password.minLength).toBe(6);
  });
});

describe('le pseudo est FACULTATIF — le serveur le génère', () => {
  it("Ajv n'exige plus username", () => {
    expect([...registerRequestSchema.required]).not.toContain('username');
  });

  it('Zod accepte une charge sans pseudo', () => {
    expect(zodOk({ ...TROIS_CHAMPS })).toBe(true);
  });

  it('Zod refuse toujours un pseudo MAL FORMÉ quand il est fourni', () => {
    expect(zodOk({ ...TROIS_CHAMPS, username: 'la lionne noire' })).toBe(false);
  });
});

describe('displayName porte le MÊME motif de nom que firstName/lastName', () => {
  it('Ajv déclare le motif partagé sur displayName', () => {
    expect(registerRequestSchema.properties.displayName.pattern).toBe(personNamePatternSource);
  });

  it.each(['12345', '  ', '@@@'])('Zod refuse le nom affiché %j', (displayName) => {
    expect(zodOk({ ...TROIS_CHAMPS, displayName })).toBe(false);
  });

  it.each(["Jean-Éric O’Connor", 'Prince', 'Ana María de la Cruz'])(
    'Zod accepte le nom affiché %j',
    (displayName) => {
      expect(zodOk({ ...TROIS_CHAMPS, displayName })).toBe(true);
    },
  );
});

describe("aucune couche n'ÉCRIT une langue que l'inscription n'a pas demandée", () => {
  it('le schéma Ajv ne DÉCLARE plus de default sur les deux rangs', () => {
    expect(registerRequestSchema.properties.systemLanguage).not.toHaveProperty('default');
    expect(registerRequestSchema.properties.regionalLanguage).not.toHaveProperty('default');
  });

  it("Zod laisse les deux rangs ABSENTS quand l'inscription n'en exprime aucun", () => {
    const parsed = AuthSchemas.register.parse({ ...TROIS_CHAMPS });

    expect(parsed.systemLanguage).toBeUndefined();
    expect(parsed.regionalLanguage).toBeUndefined();
  });

  it('Zod garde et normalise un rang RÉELLEMENT demandé', () => {
    const parsed = AuthSchemas.register.parse({ ...TROIS_CHAMPS, regionalLanguage: 'DE' });

    expect(parsed.regionalLanguage).toBe('de');
    expect(parsed.systemLanguage).toBeUndefined();
  });
});

describe('le téléphone reste facultatif, et sa forme reste gardée', () => {
  it('Zod accepte un numéro avec son pays', () => {
    expect(zodOk({ ...TROIS_CHAMPS, phoneNumber: '+33612345678', phoneCountryCode: 'FR' })).toBe(
      true,
    );
  });

  it('Zod refuse un code pays qui ne fait pas deux lettres', () => {
    expect(zodOk({ ...TROIS_CHAMPS, phoneCountryCode: 'FRA' })).toBe(false);
  });
});
