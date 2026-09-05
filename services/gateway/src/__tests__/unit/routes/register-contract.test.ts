/**
 * Le contrat d'entrée de `POST /auth/register`, rendu par le VRAI Ajv de
 * Fastify (#5216).
 *
 * ## Pourquoi ce fichier existe à côté des suites de route
 *
 * Les trois suites de `POST /register` du dépôt remplacent `registerRequestSchema`
 * par `{ additionalProperties: true }` ou mockent `AuthSchemas.register` : elles
 * sont **structurellement aveugles** au contrat de REQUÊTE — c'est délibéré, et
 * c'est écrit chez elles. Ce fichier monte les schémas RÉELS, avec les options
 * Ajv du serveur, pour que le 400 vienne du vrai compilateur. Même partage que
 * `username-pattern-contract.test.ts`, dont il reprend le harnais.
 *
 * ## Ce qu'il garde, et que rien d'autre ne peut garder
 *
 * 1. **La disjonction d'identité** (`anyOf`) : trois champs suffisent, la charge
 *    héritée passe encore, et une moitié de couple ne vaut pas identité.
 * 2. **L'ABSENCE de `default`** sur les deux langues. Ajv APPLIQUE les défauts :
 *    il écrit la clé dans le corps AVANT le handler. C'est la seule couche où
 *    cette écriture se voit, et c'est elle qui rendait inatteignable la descente
 *    du Prisme à l'inscription. Un `default` réintroduit fait tomber ce témoin
 *    et lui seul.
 * 3. **Le mode strict compile sans avertir** : `required` dans un `anyOf` dont
 *    la branche ne déclare pas la propriété journalise
 *    `strictRequired` à chaque démarrage — et deviendrait un refus de
 *    compilation, donc une route non montée, au premier durcissement du réglage.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { registerRequestSchema } from '@meeshy/shared/types';

const TROIS_CHAMPS = {
  displayName: 'Lena Vogel',
  email: 'lena@example.com',
  password: 'motdepasse',
};

const HERITE = {
  username: 'lena',
  firstName: 'Lena',
  lastName: 'Vogel',
  email: 'lena@example.com',
  password: 'motdepasse',
};

describe("contrat d'entrée de POST /register — couche Ajv RÉELLE", () => {
  let app: FastifyInstance;
  /** Ce que le handler REÇOIT — c'est-à-dire ce qu'Ajv a laissé passer ET écrit. */
  let recu: Record<string, unknown> | undefined;
  let avertissementsStrictMode: string[];

  beforeAll(async () => {
    avertissementsStrictMode = [];
    const logger = jest
      .spyOn(console, 'warn')
      .mockImplementation((...args: unknown[]) => {
        avertissementsStrictMode.push(args.map(String).join(' '));
      });

    // Mêmes options Ajv que le vrai serveur (`server.ts`) : sans `strict: 'log'`
    // et le mot-clé `example`, Ajv REFUSE de compiler les schémas OpenAPI du
    // dépôt et `ready()` lève — le test échouerait pour une raison sans rapport.
    app = Fastify({ ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } } });
    app.post('/register', { schema: { body: registerRequestSchema } }, async (request) => {
      recu = request.body as Record<string, unknown>;
      return { ok: true };
    });
    await app.ready();
    logger.mockRestore();
  });

  afterAll(async () => {
    await app.close();
  });

  const poster = async (payload: Record<string, unknown>) => {
    recu = undefined;
    return app.inject({ method: 'POST', url: '/register', payload });
  };

  it('compile SANS avertissement de mode strict — sinon la route bruite chaque démarrage', () => {
    expect(avertissementsStrictMode.filter((l) => l.includes('strictRequired'))).toEqual([]);
  });

  describe('la disjonction d’identité', () => {
    it('accepte le formulaire à TROIS champs', async () => {
      expect((await poster({ ...TROIS_CHAMPS })).statusCode).toBe(200);
    });

    it('accepte encore la charge HÉRITÉE — les apps en circulation ne cassent pas', async () => {
      expect((await poster({ ...HERITE })).statusCode).toBe(200);
    });

    it('refuse une charge SANS aucune identité', async () => {
      const res = await poster({ email: 'lena@example.com', password: 'motdepasse' });

      expect(res.statusCode).toBe(400);
    });

    it('refuse un firstName SEUL — la moitié du couple ne vaut pas identité', async () => {
      const res = await poster({ email: 'lena@example.com', password: 'motdepasse', firstName: 'Lena' });

      expect(res.statusCode).toBe(400);
    });

    it("refuse une charge sans mot de passe, même avec l'identité", async () => {
      expect((await poster({ displayName: 'Lena Vogel', email: 'lena@example.com' })).statusCode).toBe(400);
    });
  });

  describe('les bornes qui restent gardées', () => {
    it('refuse un pseudo mal formé quand il est FOURNI', async () => {
      expect((await poster({ ...TROIS_CHAMPS, username: 'la lionne noire' })).statusCode).toBe(400);
    });

    it.each(['12345', '@@@'])('refuse le nom affiché %j', async (displayName) => {
      expect((await poster({ ...TROIS_CHAMPS, displayName })).statusCode).toBe(400);
    });

    it('accepte un nom affiché accentué avec apostrophe typographique', async () => {
      expect((await poster({ ...TROIS_CHAMPS, displayName: 'Jean-Éric O’Connor' })).statusCode).toBe(200);
    });

    it('refuse un mot de passe sous la borne partagée', async () => {
      expect((await poster({ ...TROIS_CHAMPS, password: 'court' })).statusCode).toBe(400);
    });

    it('refuse un code pays qui ne fait pas deux lettres', async () => {
      expect((await poster({ ...TROIS_CHAMPS, phoneCountryCode: 'FRA' })).statusCode).toBe(400);
    });
  });

  describe("Ajv n'ÉCRIT aucune langue dans le corps", () => {
    it("ne pose ni systemLanguage ni regionalLanguage quand l'inscription n'en demande pas", async () => {
      await poster({ ...TROIS_CHAMPS });

      // Le témoin de tout le lot : un `default: 'fr'` réintroduit ici rendrait
      // la descente du Prisme inatteignable, sans qu'aucune autre garde ne tombe.
      expect(recu).not.toHaveProperty('systemLanguage');
      expect(recu).not.toHaveProperty('regionalLanguage');
    });

    it('laisse passer VERBATIM une langue réellement demandée', async () => {
      await poster({ ...TROIS_CHAMPS, regionalLanguage: 'de' });

      expect(recu?.regionalLanguage).toBe('de');
      expect(recu).not.toHaveProperty('systemLanguage');
    });

    it('accepte le jeton de transfert de numéro — un champ non déclaré serait retiré', async () => {
      await poster({ ...TROIS_CHAMPS, phoneTransferToken: 'jeton-de-transfert' });

      expect(recu?.phoneTransferToken).toBe('jeton-de-transfert');
    });
  });
});
