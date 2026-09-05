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
  password: 'motdepasse',
} as const;

const HERITE = {
  username: 'lena',
  firstName: 'Lena',
  lastName: 'Vogel',
  email: 'lena@example.com',
  password: 'motdepasse',
} as const;

describe('Zod accepte le formulaire à TROIS champs comme la charge héritée', () => {
  it('accepte { displayName, email, password }', () => {
    expect(zodOk({ ...TROIS_CHAMPS })).toBe(true);
  });

  it('accepte encore la charge HÉRITÉE { username, firstName, lastName }', () => {
    expect(zodOk({ ...HERITE })).toBe(true);
  });
});

describe('une identité est EXIGÉE — mais laquelle est au choix', () => {
  const sansIdentite = { email: 'lena@example.com', password: 'motdepasse' };

  it("Ajv n'exige que l'e-mail et le mot de passe au premier niveau", () => {
    expect([...registerRequestSchema.required]).toEqual(['email', 'password']);
  });

  it("Ajv porte la disjonction d'identité dans un anyOf", () => {
    const branches = registerRequestSchema.anyOf.map((b) => [...b.required]);

    expect(branches).toEqual([['displayName'], ['firstName', 'lastName']]);
  });

  it('Zod refuse une charge sans displayName NI firstName/lastName', () => {
    expect(zodOk({ ...sansIdentite })).toBe(false);
  });

  it('Zod refuse un firstName SEUL — la moitié du couple ne vaut pas identité', () => {
    expect(zodOk({ ...sansIdentite, firstName: 'Lena' })).toBe(false);
  });

  it('le refus de Zod DÉSIGNE un champ — sans quoi le 400 ne dit rien', () => {
    const result = AuthSchemas.register.safeParse({ ...sansIdentite });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain('displayName');
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
