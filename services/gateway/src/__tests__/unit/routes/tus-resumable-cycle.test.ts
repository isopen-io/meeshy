/**
 * Le cycle resumable TUS est ROUTÉ de bout en bout (#4370, suite de #4190).
 *
 * #4190 a retiré chirurgicalement des verbes du montage TUS. Il n'existait
 * aucun témoin sur la SÉQUENCE — création, reprise, poursuite, abandon.
 *
 * > Retirer des verbes d'un protocole à ÉTATS sans éprouver son cycle, c'est
 * > vérifier la porte sans vérifier le passage. Un `HEAD` manquant ne casse pas
 * > un téléversement qui réussit du premier coup — il casse celui qui REPREND,
 * > c'est-à-dire exactement le cas d'usage du protocole.
 *
 * ## Ce que ce fichier garde, et ce qu'il ne garde PAS
 *
 * Il garde le ROUTAGE : chaque verbe de la séquence est monté, à la bonne URL.
 * C'est précisément ce que #4190 a changé, donc précisément ce qu'un lot
 * suivant peut reperdre — retirer un verbe de la liste est une ligne.
 *
 * Il ne garde PAS la sémantique du protocole (offsets, `Upload-Length`,
 * concaténation) : elle appartient à `@tus/server`, qui a ses propres tests, et
 * la vérifier ici reviendrait à tester une dépendance à travers un double.
 * **Dire lequel des deux on tient vaut mieux que laisser croire qu'on tient les
 * deux.**
 *
 * `@tus/server` est publié en ESM pur — Jest ne peut pas le charger, d'où le
 * double ci-dessous.
 *
 * ## Pourquoi ce fichier n'est PAS dans un répertoire `uploads/`
 *
 * `services/gateway/.gitignore:53` porte `uploads/` — la règle vise le
 * répertoire de STOCKAGE des fichiers téléversés, et elle attrape n'importe
 * quel répertoire de ce nom, y compris sous `__tests__/`. Un témoin rangé là
 * disparaît du dépôt **sans un mot** : `git add` le refuse, et un commit par
 * chemins explicites échoue en nommant un fichier « inconnu de git » — le seul
 * indice qu'on ait. Mesuré ici même le 2026-08-31.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('@tus/server', () => ({
  Server: class MockTusServer {
    private opts: any;
    constructor(opts: any) {
      this.opts = opts;
    }
    async handle(req: any, res: any) {
      const headers = req?.headers || {};
      const headersApi = { get: (k: string) => headers[k.toLowerCase()] };
      // #4190 — AVANT : ce double n'appelait QUE `onUploadCreate` et rendait
      // donc 201/401 POUR TOUTE MÉTHODE. Or `onUploadCreate` n'est invoqué en
      // production que par le gestionnaire POST : GET/HEAD/PATCH/DELETE passent
      // par `onIncomingRequest`. Le double fabriquait un 401 sur des méthodes
      // que ce chemin ne garde pas — n'importe quel témoin écrit contre ce
      // montage mesurait le double, jamais la route. Il aiguille désormais sur
      // la MÉTHODE, exactement comme `@tus/server`.
      const method = String(req?.method || 'POST').toUpperCase();
      // L'identifiant de session est le dernier segment du chemin ; la
      // collection n'en a pas — seule la CRÉATION y a un sens.
      const uploadId = String(req?.url || '').split('?')[0].split('/').filter(Boolean).pop() ?? '';
      try {
        if (method === 'POST') {
          await this.opts?.onUploadCreate?.({ headers: headersApi }, { metadata: {}, size: 0 });
          res.statusCode = 201;
        } else {
          await this.opts?.onIncomingRequest?.({ headers: headersApi }, uploadId);
          res.statusCode = 204;
        }
        res.end();
      } catch (err: any) {
        res.statusCode = (err && err.status_code) || 500;
        res.end(typeof err?.body === 'string' ? err.body : JSON.stringify(err ?? {}));
      }
    }
  },
}));

jest.mock('@tus/file-store', () => ({
  FileStore: class MockFileStore {
    constructor(_opts: any) {}
    // #4190 — un upload EXISTANT, appartenant à un tiers : le seul état dans
    // lequel `onIncomingRequest` exerce réellement sa comparaison d'identité
    // (401 sans justificatif, 403 pour un autre utilisateur). Sans lui, la
    // garde revient sur `if (!ownerUserId) return` et ne mesure rien.
    async getUpload(id: string) {
      return { id, offset: 0, size: 0, metadata: { userId: 'tus-upload-owner-user-id' } };
    }
  },
}));

import { registerTusRoutes } from '../../../routes/uploads/tus-handler';

const CHEMIN = '/api/v1/uploads';

/** Les cinq gestes du cycle resumable, dans l'ordre où un client les émet. */
const CYCLE = [
  { geste: 'création',       method: 'POST',    url: CHEMIN },
  { geste: 'reprise (HEAD)', method: 'HEAD',    url: `${CHEMIN}/*` },
  { geste: 'poursuite',      method: 'PATCH',   url: `${CHEMIN}/*` },
  { geste: 'abandon',        method: 'DELETE',  url: `${CHEMIN}/*` },
  { geste: 'découverte',     method: 'OPTIONS', url: `${CHEMIN}/*` },
] as const;

describe('Cycle resumable TUS — chaque geste est ROUTÉ (#4370)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.decorate('prisma', {
      messageAttachment: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    } as any);
    await registerTusRoutes(app as any, { basePath: CHEMIN });
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it.each(CYCLE)('le geste « $geste » ($method $url) est monté', ({ method, url }) => {
    expect(app.hasRoute({ method: method as any, url })).toBe(true);
  });

  it('la reprise passe par HEAD sur l\'URL du TÉLÉVERSEMENT', () => {
    // La spécification TUS pose HEAD sur l'URL d'un téléversement. C'est la
    // distinction qu'un inventaire « gateway × clients » croisé sur le VERBE ne
    // voit pas : HEAD existe aux deux adresses, une seule a un sens.
    expect(app.hasRoute({ method: 'HEAD', url: `${CHEMIN}/*` })).toBe(true);
  });

  it('le cycle est COMPLET — la liste garde les routes, ce témoin garde la liste', () => {
    // Sans lui, retirer une entrée de CYCLE ferait disparaître sa vérification
    // en silence : `it.each` sur une liste amputée passe au vert.
    expect(CYCLE).toHaveLength(5);
    expect(CYCLE.map((c) => c.method).sort()).toEqual(['DELETE', 'HEAD', 'OPTIONS', 'PATCH', 'POST']);
  });

  it('`GET` n\'est monté sur AUCUNE des deux adresses — #4190 l\'a retiré', () => {
    // Le sens INVERSE. Une garde de cycle qui ne regarde que les PRÉSENCES
    // laisse rentrer ce qui a été sorti : un lot qui « rétablirait » GET par
    // précaution rouvrirait une lecture que #4190 a fermée, sans rougir.
    expect(app.hasRoute({ method: 'GET', url: CHEMIN })).toBe(false);
    expect(app.hasRoute({ method: 'GET', url: `${CHEMIN}/*` })).toBe(false);
  });
});
