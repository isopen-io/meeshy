/**
 * Une route dépréciée le DIT dans sa réponse (#4274).
 *
 * Ce que ces témoins tiennent, dans l'ordre où le défaut coûtait :
 *
 * 1. **L'annonce part même quand la requête est REFUSÉE.** C'est le témoin
 *    central. Posée dans le chemin de succès, l'annonce ne serait jamais lue
 *    par l'appelant qui en a le plus besoin : celui dont le jeton a expiré, ou
 *    que le débit plafonne. Le hook est donc `onRequest` — avant `authenticate`
 *    — et le témoin le prouve sur un 401, pas sur un 200.
 * 2. **`Sunset` ne s'invente pas.** Absent tant qu'aucune date n'est passée :
 *    la règle de retrait du dépôt est un compteur d'accès à zéro sur deux
 *    versions publiées (#4275), qui n'existe pas encore. Un témoin POSITIF sur
 *    « Sunset présent » aurait été le pire des témoins — il aurait exigé la
 *    date inventée que l'issue interdit.
 * 3. **`Link` s'AJOUTE.** Une route paginée pose déjà ses `next`/`prev` ;
 *    écraser l'en-tête ferait de l'annonce une régression de pagination.
 * 4. **Une adresse mal écrite fait échouer l'ENREGISTREMENT.** Une annonce
 *    fausse servie en silence pendant des mois coûte plus cher qu'un démarrage
 *    qui refuse de partir.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import Fastify, { type FastifyReply } from 'fastify';

import {
  depreciee,
  annoncerDepreciation,
  enTetesDeDepreciation,
  dateDeRetrait,
  FENETRE_DE_RETRAIT_JOURS,
} from '../../../utils/deprecation';

const DEPUIS = '2026-08-29';
const SUCCESSEUR = '/api/v1/reports';

async function monter(options: {
  readonly retraitLe?: string;
  readonly refuse?: boolean;
  readonly lienPrealable?: string;
}) {
  const app = Fastify({ logger: false });

  app.get(
    '/ancienne',
    {
      onRequest: [
        // Le `Link` préalable est posé AVANT l'annonce : c'est l'ordre réel
        // d'une route paginée, dont le `next` existe avant que la dépréciation
        // s'y ajoute.
        async (_request, reply) => {
          if (options.lienPrealable) reply.header('Link', options.lienPrealable);
        },
        depreciee({ depuis: DEPUIS, successeur: SUCCESSEUR, retraitLe: options.retraitLe }),
        async (_request, reply) => {
          if (options.refuse) await reply.status(401).send({ success: false });
        },
      ],
    },
    async () => ({ success: true })
  );

  await app.ready();
  return app;
}

describe("L'annonce part quel que soit le verdict", () => {
  it('pose les en-têtes sur un 200', async () => {
    const app = await monter({});

    const res = await app.inject({ method: 'GET', url: '/ancienne' });

    expect(res.statusCode).toBe(200);
    expect(res.headers.deprecation).toBe('@1787961600');
    expect(res.headers.link).toBe('</api/v1/reports>; rel="successor-version"');

    await app.close();
  });

  it('les pose AUSSI sur un 401 — le cas qui a besoin de migrer', async () => {
    const app = await monter({ refuse: true });

    const res = await app.inject({ method: 'GET', url: '/ancienne' });

    expect(res.statusCode).toBe(401);
    expect(res.headers.deprecation).toBe('@1787961600');
    expect(res.headers.link).toBe('</api/v1/reports>; rel="successor-version"');

    await app.close();
  });
});

describe('Sunset ne s’invente pas', () => {
  it("n'est PAS servi quand aucune date de retrait n'est passée", async () => {
    const app = await monter({});

    const res = await app.inject({ method: 'GET', url: '/ancienne' });

    expect(res.headers.sunset).toBeUndefined();
    expect(Object.keys(res.headers)).not.toContain('sunset');

    await app.close();
  });

  it('est servi en date HTTP quand une date est effectivement dérivée', async () => {
    const app = await monter({ retraitLe: '2027-03-01' });

    const res = await app.inject({ method: 'GET', url: '/ancienne' });

    expect(res.headers.sunset).toBe('Mon, 01 Mar 2027 00:00:00 GMT');

    await app.close();
  });
});

describe('Link est cumulatif', () => {
  it("n'écrase pas un Link déjà posé par la route", async () => {
    const app = await monter({ lienPrealable: '</api/v1/reports?cursor=42>; rel="next"' });

    const res = await app.inject({ method: 'GET', url: '/ancienne' });

    expect(res.headers.link).toBe(
      '</api/v1/reports?cursor=42>; rel="next", </api/v1/reports>; rel="successor-version"'
    );

    await app.close();
  });
});

describe('Une annonce fausse ne peut pas être servie', () => {
  it('refuse une date qui n’est pas ISO 8601', () => {
    expect(() => enTetesDeDepreciation({ depuis: '08/29/2026', successeur: SUCCESSEUR })).toThrow(
      /ISO 8601/
    );
  });

  it('refuse un retrait ANTÉRIEUR à la dépréciation', () => {
    expect(() =>
      enTetesDeDepreciation({ depuis: DEPUIS, successeur: SUCCESSEUR, retraitLe: '2026-01-01' })
    ).toThrow(/précède/);
  });

  it('refuse un successeur qui pourrait injecter un en-tête', () => {
    expect(() =>
      enTetesDeDepreciation({ depuis: DEPUIS, successeur: '/api/v1/x>; rel="stylesheet' })
    ).toThrow(/successeur/);
  });

  it('refuse un successeur relatif — un client ne saurait pas où le résoudre', () => {
    expect(() => enTetesDeDepreciation({ depuis: DEPUIS, successeur: 'reports' })).toThrow(
      /successeur/
    );
  });

  it('échoue à l’ENREGISTREMENT, pas à la première requête', () => {
    expect(() => depreciee({ depuis: 'jamais', successeur: SUCCESSEUR })).toThrow(/depuis/);
  });
});

describe('L’annonce se pose aussi depuis un handler', () => {
  it('annoncerDepreciation rend les mêmes trois en-têtes', async () => {
    const app = Fastify({ logger: false });
    app.get('/inline', async (_request, reply) => {
      annoncerDepreciation(reply, { depuis: DEPUIS, successeur: SUCCESSEUR, retraitLe: '2027-03-01' });
      return { success: true };
    });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/inline' });

    expect(res.headers.deprecation).toBe('@1787961600');
    expect(res.headers.sunset).toBe('Mon, 01 Mar 2027 00:00:00 GMT');
    expect(res.headers.link).toBe('</api/v1/reports>; rel="successor-version"');

    await app.close();
  });
});

describe("L'échéance se dérive d'une règle écrite, et son ancre ne bouge pas", () => {
  it('rend EXACTEMENT depuis + 180 jours — la seule règle de retrait CHIFFRÉE du dépôt', () => {
    expect(FENETRE_DE_RETRAIT_JOURS).toBe(180);
    expect(dateDeRetrait('2026-08-29T00:00:00.000Z')).toBe('2027-02-25T00:00:00.000Z');
  });

  it('accepte une fenêtre propre à une adresse, sans date en dur au site d’appel', () => {
    expect(dateDeRetrait('2026-08-29T00:00:00.000Z', 30)).toBe('2026-09-28T00:00:00.000Z');
  });

  it("ne bouge PAS d'un appel à l'autre — une échéance ancrée sur « maintenant » recule chaque jour et n'arrive jamais", () => {
    const premier = dateDeRetrait('2026-08-29T00:00:00.000Z');
    const second = dateDeRetrait('2026-08-29T00:00:00.000Z');
    expect(second).toBe(premier);
  });
});

describe("L'annonce COMPOSE, elle ne conclut pas", () => {
  it('ne touche ni status() ni send() — sendSuccess/sendError restent l’unique site d’envoi', () => {
    const touche: string[] = [];
    const reply = {
      header: () => reply,
      getHeader: () => undefined,
      status: () => { touche.push('status'); return reply; },
      send: () => { touche.push('send'); return reply; },
    } as unknown as FastifyReply;

    annoncerDepreciation(reply, { depuis: '2026-08-29', successeur: '/api/v1/reports' });
    expect(touche).toEqual([]);
  });
});
