/**
 * TÉMOIN DU RETRAIT DES ROUTES SANS APPELANT — #4190.
 *
 * Ce qui est mesuré ici est la TABLE DE ROUTES RÉELLEMENT MONTÉE, et non le
 * texte des fichiers de montage. C'est le seul endroit où la MÉTHODE et le
 * CHEMIN se lisent ENSEMBLE : sur `/api/v1/uploads/*`, `GET` était morte
 * pendant que `HEAD`, `PATCH` et `DELETE` sont les trois gestes nominaux du
 * protocole tus.io. Un inventaire par chemin — celui qui a produit cette
 * issue — ne peut pas distinguer les deux, et c'est ce qui rendait ce
 * nettoyage dangereux : chaque couple retiré partage son URL avec un couple
 * vivant.
 *
 * DEUX MOITIÉS, et elles n'ont pas la même fragilité :
 *
 *  (a) ABSENCE — garde NÉGATIVE, donc une garde qui meurt en silence : elle
 *      passe au vert le jour où elle ne mesure plus rien (module renommé,
 *      montage déplacé, harnais qui n'énumère plus). Elle a été PROUVÉE en
 *      remontant temporairement chaque couple retiré et en vérifiant qu'elle
 *      rougit. Le garde-fou `expect(routes.length).toBeGreaterThan(...)`
 *      ci-dessous la protège du cas « plus aucune route énumérée ».
 *
 *  (b) PRÉSENCE — c'est elle qui empêche ce chantier d'emporter une route
 *      VIVANTE. `HEAD /api/v1/uploads/*` est la méthode nominale de reprise
 *      d'un téléversement, consommée par les trois clients ;
 *      `DELETE /api/v1/uploads/*` est émise par `tus-js-client` à chaque
 *      `abort()`. Les deux vivent sur des chemins dont un autre couple part.
 *
 * PIÈGE DE DOUBLE, traité explicitement. `@tus/server` est publié en ESM pur
 * et doit être mocké pour que Jest charge `tus-handler.ts`. Le double employé
 * ailleurs dans le dépôt rend 201/401 POUR TOUTE MÉTHODE, parce qu'il
 * n'invoque que `onUploadCreate` — le point d'accroche du POST. Un témoin
 * écrit contre ce double mesure le double, jamais la route. Celui d'ici
 * AIGUILLE sur la méthode comme le fait `@tus/server` : `POST` passe par
 * `onUploadCreate`, tout le reste par `onIncomingRequest` — et le magasin rend
 * un upload EXISTANT appartenant à quelqu'un d'autre, seul état où la garde de
 * propriété a quelque chose à dire (`if (!ownerUserId) return`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';

// ─── Doubles de la plomberie TUS (ESM pur, non transformable par Jest) ───────

// Préfixe `mock` obligatoire : seule forme qu'une fabrique `jest.mock`
// (hissée avant les déclarations du module) a le droit de refermer.
const mockTusUploadOwner = 'tus-upload-owner-user-id';

type TusServerOptions = {
  onIncomingRequest?: (req: { headers: unknown }, uploadId: string) => Promise<void>;
  onUploadCreate?: (
    req: { headers: unknown },
    upload: { metadata: Record<string, string>; size: number }
  ) => Promise<unknown>;
};

jest.mock('@tus/server', () => ({
  Server: class MockTusServer {
    private readonly opts: TusServerOptions;
    constructor(opts: TusServerOptions) {
      this.opts = opts;
    }
    async handle(req: { method?: string; url?: string; headers?: Record<string, string> }, res: {
      statusCode: number;
      end: (body?: string) => void;
    }) {
      const headers = req?.headers ?? {};
      const headersApi = { get: (k: string) => headers[k.toLowerCase()] };
      const method = String(req?.method ?? 'POST').toUpperCase();
      // L'identifiant de session est le dernier segment du chemin ; sur la
      // collection il n'y en a pas — seule la CRÉATION y a un sens.
      const uploadId = String(req?.url ?? '').split('?')[0].split('/').filter(Boolean).pop() ?? '';
      try {
        if (method === 'POST') {
          await this.opts.onUploadCreate?.({ headers: headersApi }, { metadata: {}, size: 0 });
          res.statusCode = 201;
        } else {
          await this.opts.onIncomingRequest?.({ headers: headersApi }, uploadId);
          res.statusCode = 204;
        }
        res.end();
      } catch (err) {
        const e = err as { status_code?: number; body?: string };
        res.statusCode = e?.status_code ?? 500;
        res.end(typeof e?.body === 'string' ? e.body : JSON.stringify(e ?? {}));
      }
    }
  },
}));

jest.mock('@tus/file-store', () => ({
  FileStore: class MockFileStore {
    constructor(_opts: unknown) {}
    async getUpload(id: string) {
      return { id, offset: 0, size: 0, metadata: { userId: mockTusUploadOwner } };
    }
  },
}));

jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => ({
    extractMetadata: jest.fn(),
    generateThumbnail: jest.fn(),
    generateVideoThumbnail: jest.fn(),
  })),
}));

jest.mock('../../../services/attachments/ThumbHashGenerator', () => ({
  ThumbHashGenerator: { generate: jest.fn() },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ─── Harnais ─────────────────────────────────────────────────────────────────

type RegisterTusRoutes = (fastify: FastifyInstance) => Promise<void>;
type RegisterVoiceRoutes = (
  fastify: FastifyInstance,
  audioTranslateService: unknown,
  translationService?: unknown
) => void;
type RegisterStoryAudioRoutes = (
  fastify: FastifyInstance,
  prisma: unknown,
  requiredAuth: unknown
) => void;

/**
 * `tus-handler.ts` lit `UPLOAD_PATH` au CHARGEMENT du module et y crée son
 * répertoire temporaire : on pose l'environnement AVANT l'import, puis on
 * importe via `require` après `jest.resetModules()` — même patron que
 * `routes/uploads/__tests__/tus-handler.test.ts`.
 */
async function loadTusRegistrar(uploadPath: string): Promise<RegisterTusRoutes> {
  process.env.UPLOAD_PATH = uploadPath;
  jest.resetModules();
  const mod = require('../../../routes/uploads/tus-handler') as { registerTusRoutes: RegisterTusRoutes };
  return mod.registerTusRoutes;
}

function collectRoutes(app: FastifyInstance, into: string[]): void {
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    // `HEAD` et `OPTIONS` NE SONT PAS filtrés ici, contrairement au harnais du
    // test de couverture d'authentification : `HEAD /api/v1/uploads/*` est
    // précisément la route vivante que ce lot ne doit pas emporter, et un
    // filtre la rendrait invisible au témoin censé la protéger.
    for (const method of methods) into.push(`${method} ${route.url}`);
  });
}

const JWT_SECRET = 'secret-de-test-orphan-route-removal';

const UPLOADS = '/api/v1/uploads';
const VOICE = '/api/v1/voice';

describe('#4190 — les routes sans appelant ne sont plus montées', () => {
  let tmpDir: string;
  let uploadRoutes: string[] = [];
  let uploadApp: FastifyInstance;

  const jwtSecretOrigine = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'meeshy-tus-routetable-'));
    const registerTusRoutes = await loadTusRegistrar(tmpDir);

    uploadApp = Fastify({ logger: false });
    uploadApp.decorate('prisma', {} as never);
    collectRoutes(uploadApp, uploadRoutes);
    await registerTusRoutes(uploadApp);
    await uploadApp.ready();
  });

  afterAll(async () => {
    await uploadApp?.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
    process.env.JWT_SECRET = jwtSecretOrigine;
  });

  // ─── (a) ABSENCE — garde négative ─────────────────────────────────────────

  it('ne monte plus les quatre couples TUS sans appelant', () => {
    // Garde-fou du harnais : si le montage cessait d'énumérer, (a) passerait
    // au vert en ne mesurant plus rien.
    expect(uploadRoutes.length).toBeGreaterThanOrEqual(6);

    expect(uploadRoutes).not.toContain(`GET ${UPLOADS}`);
    expect(uploadRoutes).not.toContain(`PATCH ${UPLOADS}`);
    expect(uploadRoutes).not.toContain(`DELETE ${UPLOADS}`);
    expect(uploadRoutes).not.toContain(`GET ${UPLOADS}/*`);
  });

  it('rend 404 sur chacun des quatre couples retirés', async () => {
    const retires: ReadonlyArray<{ method: 'GET' | 'PATCH' | 'DELETE'; url: string }> = [
      { method: 'GET', url: UPLOADS },
      { method: 'PATCH', url: UPLOADS },
      { method: 'DELETE', url: UPLOADS },
      { method: 'GET', url: `${UPLOADS}/some-upload-id` },
    ];

    for (const { method, url } of retires) {
      const res = await uploadApp.inject({ method, url });
      expect(`${method} ${url} → ${res.statusCode}`).toBe(`${method} ${url} → 404`);
    }
  });

  // ─── (b) PRÉSENCE — ce qui empêche d'emporter une route vivante ───────────

  it('monte toujours les quatre couples TUS vivants', () => {
    expect(uploadRoutes).toContain(`POST ${UPLOADS}`);
    expect(uploadRoutes).toContain(`HEAD ${UPLOADS}/*`);
    expect(uploadRoutes).toContain(`PATCH ${UPLOADS}/*`);
    expect(uploadRoutes).toContain(`DELETE ${UPLOADS}/*`);
  });

  /**
   * Ce témoin-ci est ce qui distingue « la route existe » de « la route fait
   * encore ce qu'elle faisait ». Il traverse le VRAI `onUploadCreate` et le
   * VRAI `onIncomingRequest` — les deux points d'accroche que la production
   * installe — et exige de chacun le refus qu'il prononce réellement. Un
   * double qui rendrait le même code pour toute méthode le laisserait passer
   * sans rien prouver : c'est pourquoi le double d'ici aiguille sur la méthode.
   */
  it('fait encore traverser aux couples vivants la garde qui leur est propre', async () => {
    const creation = await uploadApp.inject({ method: 'POST', url: UPLOADS });
    expect(creation.statusCode).toBe(401); // onUploadCreate : aucun justificatif

    const reprise = await uploadApp.inject({ method: 'HEAD', url: `${UPLOADS}/existing-upload-id` });
    expect(reprise.statusCode).toBe(401); // onIncomingRequest : upload d'autrui

    const poursuite = await uploadApp.inject({
      method: 'PATCH',
      url: `${UPLOADS}/existing-upload-id`,
      headers: { 'content-type': 'application/offset+octet-stream' },
    });
    expect(poursuite.statusCode).toBe(401);

    const terminaison = await uploadApp.inject({ method: 'DELETE', url: `${UPLOADS}/existing-upload-id` });
    expect(terminaison.statusCode).toBe(401);
  });

  it('sert un 401 de GARDE, pas un 401 de double', async () => {
    // Un double qui rendrait 401 pour tout rendrait chacun des `expect(401)`
    // ci-dessus VRAI sur une route non gardée — c'est exactement le piège que
    // ce lot avait pour consigne de refermer. Deux preuves que le code observé
    // vient bien du montage et des hooks :
    //  - `PUT` n'est monté sur aucune des deux URL ⇒ 404, jamais 401 ;
    //  - l'appelant PROPRIÉTAIRE de la session traverse `onIncomingRequest`
    //    sans être refusé ⇒ le 401 précédent venait de la comparaison
    //    d'identité, pas d'un `throw` inconditionnel.
    const inconnue = await uploadApp.inject({ method: 'PUT', url: `${UPLOADS}/existing-upload-id` });
    expect(inconnue.statusCode).toBe(404);

    const jetonDuProprietaire = jwt.sign({ userId: mockTusUploadOwner }, JWT_SECRET);
    const proprietaire = await uploadApp.inject({
      method: 'HEAD',
      url: `${UPLOADS}/existing-upload-id`,
      headers: { authorization: `Bearer ${jetonDuProprietaire}` },
    });
    expect(proprietaire.statusCode).toBe(204);

    // Et l'appelant qui n'est PAS le propriétaire est refusé 403, pas 401 :
    // deux refus DISTINCTS produits par la même garde, qu'un double uniforme
    // ne pourrait pas rendre.
    const tiers = await uploadApp.inject({
      method: 'HEAD',
      url: `${UPLOADS}/existing-upload-id`,
      headers: { authorization: `Bearer ${jwt.sign({ userId: 'quelqu-un-d-autre' }, JWT_SECRET)}` },
    });
    expect(tiers.statusCode).toBe(403);
  });
});

describe('#4190 — la voix ne monte plus /health ni /stats', () => {
  let voiceRoutes: string[] = [];

  beforeAll(async () => {
    jest.resetModules();
    const { registerVoiceRoutes } = require('../../../routes/voice/index') as {
      registerVoiceRoutes: RegisterVoiceRoutes;
    };

    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('authenticate', async () => {});
    collectRoutes(app, voiceRoutes);
    // Les handlers seuls consomment le service : la TABLE de routes ne dépend
    // que du montage, d'où un service vide plutôt qu'un faux complet.
    registerVoiceRoutes(app, {}, undefined);
    await app.ready();
    await app.close();
  });

  it('ne monte plus GET /api/v1/voice/health ni GET /api/v1/voice/stats', () => {
    expect(voiceRoutes.length).toBeGreaterThanOrEqual(8);
    expect(voiceRoutes).not.toContain(`GET ${VOICE}/health`);
    expect(voiceRoutes).not.toContain(`GET ${VOICE}/stats`);
  });

  it('monte toujours les routes de voix vivantes', () => {
    expect(voiceRoutes).toContain(`POST ${VOICE}/translate`);
    expect(voiceRoutes).toContain(`POST ${VOICE}/transcribe`);
    expect(voiceRoutes).toContain(`POST ${VOICE}/analyze`);
    expect(voiceRoutes).toContain(`GET ${VOICE}/history`);
    expect(voiceRoutes).toContain(`GET ${VOICE}/languages`);
  });
});

describe('#4190 — la bibliothèque de sons garde sa moitié vivante', () => {
  let audioRoutes: string[] = [];

  beforeAll(async () => {
    jest.resetModules();
    const { registerStoryAudioRoutes } = require('../../../routes/posts/audio') as {
      registerStoryAudioRoutes: RegisterStoryAudioRoutes;
    };

    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    collectRoutes(app, audioRoutes);
    registerStoryAudioRoutes(app, {}, async () => {});
    await app.ready();
    await app.close();
  });

  /**
   * `GET /stories/audio` est consommée par iOS (`SoundLibraryService`). Elle
   * partage son chemin avec `POST /stories/audio`, orpheline et tamponnant
   * 100 Mo en mémoire, dont le retrait appartient au territoire
   * `routes/posts/` — hors de ce lot. Cette assertion-ci est la moitié (b) de
   * ce couple homonyme : elle interdit qu'un futur retrait du POST emporte le
   * GET au passage, ce qui est exactement la façon dont ce nettoyage peut mal
   * tourner. Les deux moitiés sont désormais posées.
   */
  it('monte toujours GET /stories/audio', () => {
    expect(audioRoutes).toContain('GET /stories/audio');
  });

  it('ne monte plus POST /stories/audio', () => {
    expect(audioRoutes.length).toBeGreaterThanOrEqual(2);
    expect(audioRoutes).not.toContain('POST /stories/audio');
  });
});

describe('#4190 — le partage d\'un post garde sa moitié vivante', () => {
  let interactionRoutes: string[] = [];

  beforeAll(async () => {
    jest.resetModules();
    const { registerInteractionRoutes } = require('../../../routes/posts/interactions') as {
      registerInteractionRoutes: (
        app: FastifyInstance,
        prisma: unknown,
        requiredAuth: unknown,
        orphanCleanup?: unknown
      ) => void;
    };

    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('authenticate', async () => {});
    collectRoutes(app, interactionRoutes);
    // Seuls les handlers consomment prisma : la TABLE de routes ne dépend que
    // du montage, d'où un double vide plutôt qu'un faux complet.
    registerInteractionRoutes(app, {} as never, async () => {});
    await app.ready();
    await app.close();
  });

  /**
   * C'EST LE COUPLE HOMONYME LE PLUS DANGEREUX DU LOT, et il était le seul
   * des trois à n'avoir AUCUNE garde — le retrait ne reposait que sur un
   * commentaire dans `routes/posts/interactions.ts`.
   *
   * `GET /posts/:postId/share` était morte ; `POST /posts/:postId/share` est
   * le geste de partage lui-même, vivant et consommé. Les deux partagent leur
   * URL, et un inventaire PAR CHEMIN — celui qui a produit #4190 — ne peut
   * pas les distinguer. C'est exactement la façon dont ce nettoyage peut mal
   * tourner : emporter la moitié vivante en croyant retirer la morte.
   *
   * La moitié (a) est une garde NÉGATIVE, donc une garde qui meurt en
   * silence : `routes.length` la protège du cas « plus aucune route
   * énumérée », où l'absence serait vraie sans rien mesurer.
   */
  it('ne monte plus GET /posts/:postId/share', () => {
    expect(interactionRoutes.length).toBeGreaterThanOrEqual(5);
    expect(interactionRoutes).not.toContain('GET /posts/:postId/share');
  });

  it('monte toujours POST /posts/:postId/share — la moitié vivante du couple', () => {
    expect(interactionRoutes).toContain('POST /posts/:postId/share');
  });
});
