/**
 * Un alias qui ne dit rien au client n'existe pas pour lui (#4274).
 *
 * `utils/deprecation.ts` pose le site UNIQUE des trois en-têtes RFC 8594. Ce
 * fichier garde qu'il est réellement ADOPTÉ, sur trois plans distincts — une
 * garde qui n'en couvrirait qu'un se laisserait berner par exactement le
 * défaut qu'elle prétend fermer :
 *
 * PARTIE 1 — SOURCE, stricte, par ROUTE : les treize alias de CE lot (trois
 * `users/profile.ts`, neuf `admin/users-write.ts`, un `admin/reports.ts`)
 * doivent chacun appeler le mécanisme dans leur propre bloc de handler — ni
 * avant (un alias voisin), ni après (le suivant). La fenêtre de chaque
 * bloc est calculée dynamiquement jusqu'à la PROCHAINE déclaration
 * `fastify.<verbe>(` du fichier, jamais un nombre de caractères fixe — un
 * gabarit fixe avait d'abord laissé passer `GET /users/:id` (doc-comment
 * de 700+ caractères avant le corps du handler) comme un FAUX négatif.
 *
 * PARTIE 2 — SOURCE, large, par FICHIER : un balayage lexical de TOUT
 * `routes/` cherche la formulation que ce dépôt utilise pour se déclarer
 * alias/adaptateur (`ALIAS de \`…\``, `ADAPTATEUR MINCE`, `Alias of VERB`,
 * `ALIAS rétro-compatible`). C'est le CLIQUET qui empêche le PROCHAIN alias
 * d'être muet : un fichier neuf qui parle ainsi et n'est dans AUCUNE des deux
 * listes ci-dessous fait tomber ce test.
 *
 * PARTIE 3 — COMPORTEMENT : une requête HTTP réelle, via `app.inject()`
 * contre une vraie instance Fastify montée avec `admin/reports.ts`, prouve
 * que les trois en-têtes sortent RÉELLEMENT sur le fil — une garde de source
 * seule ne prouve pas qu'un en-tête est SERVI (elle prouve qu'il est ÉCRIT).
 *
 * ## Ce que ce fichier NE VOIT PAS (à lire avant d'en déduire une couverture totale)
 *
 * - La partie 2 est LEXICALE : elle ne comprend pas le code, seulement le
 *   mot « alias »/« adaptateur » dans un commentaire ou une description
 *   Swagger. `admin/users-write.ts` déclare ses neuf alias sans jamais
 *   écrire ce mot route par route (un seul commentaire de FICHIER, à
 *   l'ouverture) — la partie 2 ne le voit donc PAS ; seule la partie 1,
 *   qui connaît le fichier par construction, le garde. Un futur fichier qui
 *   adopterait ce même style d'écriture (une déclaration architecturale,
 *   jamais un mot-clé par route) échapperait pareillement à la partie 2.
 * - La partie 2 ne sait pas ce qu'un fichier « hors territoire » DEVRAIT
 *   avoir : elle fige un INVENTAIRE (qui est dans la liste, qui n'y est pas),
 *   pas un jugement de conformité sur ces fichiers-là — ce lot n'a pas accès
 *   à `routes/friends.ts`, `routes/auth/register.ts` ni aux trois autres
 *   (territoire d'autres sessions/issues : #4149, #4150, #4151, #4175,
 *   #4178, #4181, #4182, #4184).
 * - Aucune des trois parties n'exécute un VRAI serveur réseau : la partie 3
 *   utilise `light-my-request` (le moteur de `app.inject()`), pas un socket
 *   TCP. C'est la limite standard de ce type de témoin dans ce dépôt.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import Fastify, { FastifyInstance } from 'fastify';

const RACINE_ROUTES = path.resolve(__dirname, '../../routes');

// ─────────────────────────────────────────────────────────────────────────
// PARTIE 1 — chaque route ALIAS de CE lot appelle le mécanisme, dans SON bloc
// ─────────────────────────────────────────────────────────────────────────

type Site = {
  readonly file: string;
  /** Sous-chaîne UNIQUE (vérifié ci-dessous) marquant le début de la route. */
  readonly marker: string;
  readonly label: string;
  /** Nom de l'appel qui prouve l'adoption — direct, ou via un helper local. */
  readonly via: string;
};

/**
 * Borne la fin du bloc d'un handler à la PROCHAINE déclaration
 * `fastify.<verbe>(` du fichier (ou EOF s'il n'y en a pas) — jamais un
 * nombre de caractères fixe, qui avait d'abord produit un faux négatif sur
 * `GET /users/:id` (voir doc-comment de tête).
 */
function limiteDeBloc(texte: string, depart: number): number {
  const RE_ROUTE = /fastify\.(get|post|put|patch|delete)(<[^()]*?>)?\(/g;
  RE_ROUTE.lastIndex = depart + 1; // ne matche pas le marqueur qu'on vient de trouver
  const suite = RE_ROUTE.exec(texte);
  return suite ? suite.index : texte.length;
}

const SITES: readonly Site[] = [
  // `users/profile.ts` — trois alias de `GET /directory/people/:handle` (#4161, critère 9)
  { file: 'users/profile.ts', marker: "fastify.get('/u/:username'", label: 'GET /u/:username', via: 'applyDeprecationHeaders(' },
  { file: 'users/profile.ts', marker: "fastify.get('/users/:id'", label: 'GET /users/:id', via: 'applyDeprecationHeaders(' },
  { file: 'users/profile.ts', marker: "fastify.get('/users/id/:id'", label: 'GET /users/id/:id', via: 'applyDeprecationHeaders(' },

  // `admin/reports.ts` — un adaptateur mince de `POST /reports` (#4155)
  { file: 'admin/reports.ts', marker: "fastify.post('/', {", label: 'POST /admin/reports', via: 'applyDeprecationHeaders(' },

  // `admin/users-write.ts` — neuf alias d'écriture de compte (#4154), tous via
  // le helper local `marquerAliasHistorique` (dont la fermeture — qu'il
  // appelle bien `applyDeprecationHeaders` — est vérifiée séparément plus bas).
  { file: 'admin/users-write.ts', marker: "fastify.patch('/admin/users/:userId/role'", label: 'PATCH .../role', via: 'marquerAliasHistorique(' },
  { file: 'admin/users-write.ts', marker: "fastify.patch('/admin/users/:userId/status'", label: 'PATCH .../status', via: 'marquerAliasHistorique(' },
  { file: 'admin/users-write.ts', marker: "fastify.post('/admin/users/:userId/unlock'", label: 'POST .../unlock', via: 'marquerAliasHistorique(' },
  { file: 'admin/users-write.ts', marker: "fastify.post('/admin/users/:userId/enable-2fa'", label: 'POST .../enable-2fa', via: 'marquerAliasHistorique(' },
  { file: 'admin/users-write.ts', marker: "fastify.post('/admin/users/:userId/disable-2fa'", label: 'POST .../disable-2fa', via: 'marquerAliasHistorique(' },
  { file: 'admin/users-write.ts', marker: "fastify.post('/admin/users/:userId/verify-email'", label: 'POST .../verify-email', via: 'marquerAliasHistorique(' },
  { file: 'admin/users-write.ts', marker: "fastify.post('/admin/users/:userId/verify-phone'", label: 'POST .../verify-phone', via: 'marquerAliasHistorique(' },
  { file: 'admin/users-write.ts', marker: "fastify.post('/admin/users/:userId/verify-age'", label: 'POST .../verify-age', via: 'marquerAliasHistorique(' },
  { file: 'admin/users-write.ts', marker: "fastify.post('/admin/users/:userId/voice-consent'", label: 'POST .../voice-consent', via: 'marquerAliasHistorique(' },

  // `users/blocking.ts` — les TROIS vrais alias de blocage (#4164). L'issue
  // #4274 les ancrait sur `directory/blocks.ts:250`, qui ne porte que les
  // routes CANONIQUES : suivre l'ancrage aurait marqué en sursis l'adresse
  // qui SUCCÈDE, exactement à l'envers. Deux d'entre eux se déclarent sous la
  // forme générique `fastify.post<{…}>(` — d'où l'élargissement de
  // `limiteDeBloc` ci-dessus, sans lequel leur bloc courait jusqu'à EOF et un
  // seul appel aurait satisfait les trois sites.
  { file: 'users/blocking.ts', marker: "fastify.post<{ Params: { userId: string } }>('/users/:userId/block'", label: 'POST /users/:userId/block', via: 'applyDeprecationHeaders(' },
  { file: 'users/blocking.ts', marker: "fastify.delete<{ Params: { userId: string } }>('/users/:userId/block'", label: 'DELETE /users/:userId/block', via: 'applyDeprecationHeaders(' },
  { file: 'users/blocking.ts', marker: "fastify.get('/users/me/blocked-users'", label: 'GET /users/me/blocked-users', via: 'applyDeprecationHeaders(' },
];

describe('Partie 1 — chaque route ALIAS de ce lot marque son sursis dans SON bloc', () => {
  it.each(SITES.map((s) => [s.label, s] as const))('%s appelle %s', (_label, site) => {
    const chemin = path.join(RACINE_ROUTES, site.file);
    const texte = fs.readFileSync(chemin, 'utf8');

    const debut = texte.indexOf(site.marker);
    // Le marqueur doit exister — sinon la route a bougé (renommée, retirée) et
    // ce témoin serait vert SANS RIEN GARDER (piège nommé par la consigne 6).
    expect(debut).toBeGreaterThanOrEqual(0);
    expect(texte.indexOf(site.marker, debut + 1)).toBe(-1); // marqueur UNIQUE dans le fichier

    const fin = limiteDeBloc(texte, debut);
    const bloc = texte.slice(debut, fin);
    expect(bloc).toContain(site.via);
  });

  it('le helper local `marquerAliasHistorique` (admin/users-write.ts) appelle bien applyDeprecationHeaders — ferme l’indirection que les neuf sites ci-dessus utilisent', () => {
    const texte = fs.readFileSync(path.join(RACINE_ROUTES, 'admin/users-write.ts'), 'utf8');
    const marker = 'const marquerAliasHistorique = ';
    const debut = texte.indexOf(marker);
    expect(debut).toBeGreaterThanOrEqual(0);
    const fin = limiteDeBloc(texte, debut);
    expect(texte.slice(debut, fin)).toContain('applyDeprecationHeaders(');
  });

  it('directory/blocks.ts expose BLOCKS_SUCCESSOR_PATH — la plomberie que `users/blocking.ts` doit consommer (hors territoire de ce lot, voir edits_hors_territoire)', async () => {
    const { BLOCKS_SUCCESSOR_PATH } = await import('../../routes/directory/blocks');
    expect(BLOCKS_SUCCESSOR_PATH.item('u1')).toBe('/api/v1/directory/blocks/u1');
    expect(BLOCKS_SUCCESSOR_PATH.list).toBe('/api/v1/directory/blocks');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// PARTIE 2 — cliquet repo-wide : le PROCHAIN alias muet ne peut pas se cacher
// ─────────────────────────────────────────────────────────────────────────

function fichiersTs(racine: string): string[] {
  const sortie: string[] = [];
  for (const entree of fs.readdirSync(racine, { withFileTypes: true })) {
    const complet = path.join(racine, entree.name);
    if (entree.isDirectory()) {
      if (entree.name !== '__tests__' && entree.name !== 'node_modules') sortie.push(...fichiersTs(complet));
    } else if (entree.name.endsWith('.ts')) {
      sortie.push(complet);
    }
  }
  return sortie;
}

/**
 * Une ligne qui SE DÉCLARE alias/adaptateur — au sens où ce dépôt écrit déjà
 * cette phrase à plusieurs endroits, jamais une simple MENTION du mot.
 *
 * Volontairement plus étroit qu'un `/\balias\b/i` nu : ce dernier, essayé en
 * premier, remontait SEPT fichiers qui ne déclarent RIEN — `l'adaptateur` d'un
 * event socket.io (`conversations/participants.ts`), le « groupement des
 * alias » d'onglets UI (`notifications.ts`), ou le mot « alias » dans la
 * description de la route CANONIQUE qui EST la cible d'un alias
 * (`directory/person.ts`, `directory/presence.ts`, `directory/contacts-sync.ts`,
 * `reports/index.ts`, `users/public-profile.ts`) — sept faux positifs pour un
 * balayage censé pointer des routes MUETTES. Un balayage trop large mesure sa
 * propre imprécision, pas une propriété du dépôt (leçon du cycle 107 :
 * « un balayage qui cherche un idiome mesure sa popularité, pas une
 * propriété »).
 */
const RE_AUTO_DECLARATION =
  /ALIAS de `|ADAPTATEUR MINCE|Alias of (GET|POST|PUT|PATCH|DELETE)|ALIAS r[ée]tro-compatible/;

function declareUnAlias(ligne: string): boolean {
  const t = ligne.trim();
  const estCommentaire = t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
  const estDescriptionSwagger = t.includes('description:'); // ex. users/blocking.ts, hors commentaire JS
  if (!estCommentaire && !estDescriptionSwagger) return false;
  return RE_AUTO_DECLARATION.test(t);
}

function fichiersAvecAutoDeclaration(): string[] {
  return fichiersTs(RACINE_ROUTES)
    .filter((f) => fs.readFileSync(f, 'utf8').split('\n').some(declareUnAlias))
    .map((f) => path.relative(RACINE_ROUTES, f).split(path.sep).join('/'))
    .sort();
}

describe('Partie 2 — cliquet repo-wide sur QUI se déclare alias/adaptateur', () => {
  // Fichiers de CE lot (#4274) : auto-déclarés ET tenus de porter le mécanisme.
  const MON_TERRITOIRE = ['admin/reports.ts', 'users/profile.ts', 'users/blocking.ts'].sort();

  // Fichiers HORS territoire (autres sessions/issues du même lot). Cliquet :
  // une entrée EN TROP = un fichier nouvellement muet à router vers ce
  // module ; une entrée EN MOINS = un fichier réparé — retirer sa ligne fait
  // partie du correctif qui l'a réparé (patron `FROZEN_INVENTORY` du dépôt).
  const HORS_TERRITOIRE = [
    'auth/register.ts', // #4158/#4149 — vérification de pseudo/e-mail/téléphone
    'friends.ts', // #4162/#4150 — demandes d'amitié
    'users/contacts-directory.ts', // #4163
    'users/preferences.ts', // #4159
    'users/presence.ts', // #4164
  ].sort();

  it('le balayage LIT bien l’arbre — sinon il serait vert à vide', () => {
    expect(fichiersTs(RACINE_ROUTES).length).toBeGreaterThan(100);
  });

  it('l’ensemble EXACT des fichiers auto-déclarés est celui-ci — ni plus, ni moins', () => {
    expect(fichiersAvecAutoDeclaration()).toEqual([...MON_TERRITOIRE, ...HORS_TERRITOIRE].sort());
  });

  it.each(MON_TERRITOIRE)('%s (mon territoire) importe et appelle réellement le site unique', (relatif) => {
    const texte = fs.readFileSync(path.join(RACINE_ROUTES, relatif), 'utf8');
    expect(texte).toContain("from '../../utils/deprecation'");
    const nbDeclarations = texte.split('\n').filter(declareUnAlias).length;
    const nbAppels = texte.split('applyDeprecationHeaders(').length - 1;
    // Autant d'appels que de routes qui se déclarent alias — pas moins :
    // une régression partielle (huit sur neuf) ferait toujours passer un
    // simple test de présence, jamais un test de COMPTE.
    expect(nbAppels).toBeGreaterThanOrEqual(nbDeclarations);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// PARTIE 3 — COMPORTEMENT : les en-têtes sortent RÉELLEMENT sur le fil
// ─────────────────────────────────────────────────────────────────────────

jest.mock('../../utils/logger', () => ({ logError: jest.fn() }));

const mockCreateReport = jest.fn<any>().mockResolvedValue({ id: 'rpt-1', status: 'pending' });
jest.mock('../../services/admin/report.service', () => ({
  getReportService: jest.fn().mockReturnValue({
    createReport: (...a: unknown[]) => mockCreateReport(...a),
  }),
}));

import { reportRoutes } from '../../routes/admin/reports';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      userId: '507f1f77bcf86cd799439011',
      registeredUser: { id: '507f1f77bcf86cd799439011', role: 'USER' },
    };
  });

  // La cible d'un signalement est vérifiée avant écriture (#4155) : un double
  // `prisma` vide ferait lever `verifierCible` et masquerait tout — patron
  // repris tel quel de `__tests__/unit/routes/admin-reports.test.ts`.
  app.decorate('prisma', {
    message: { findUnique: async () => ({ conversationId: '507f1f77bcf86cd799439077' }) },
    participant: { findFirst: async () => ({ id: 'p1' }) },
  } as any);

  await app.register(reportRoutes);
  await app.ready();
  return app;
}

describe('Partie 3 — POST /admin/reports (adaptateur mince, #4155) sert les trois en-têtes sur le fil', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('une réponse RÉUSSIE (201) porte Deprecation, Sunset et Link avec les bonnes valeurs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        reportedType: 'message',
        reportedEntityId: '507f1f77bcf86cd799439012',
        reportType: 'spam',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.headers['deprecation']).toBe('true');
    expect(res.headers['link']).toBe('</api/v1/reports>; rel="successor-version"');

    const sunset = res.headers['sunset'];
    expect(typeof sunset).toBe('string');
    // RFC 7231 IMF-fixdate — celui que RFC 8594 exige pour `Sunset`, jamais l'ISO 8601.
    expect(sunset).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/);
    expect(new Date(sunset as string).getTime()).toBeGreaterThan(Date.now());
  });

  it('une réponse d’ERREUR (400, cible malformée) porte les en-têtes AUSSI — l’adresse est dépréciée, pas seulement sa branche de succès', async () => {
    const res = await app.inject({ method: 'POST', url: '/', payload: {} });

    expect(res.statusCode).toBe(400);
    expect(res.headers['deprecation']).toBe('true');
    expect(res.headers['link']).toBe('</api/v1/reports>; rel="successor-version"');
  });
});
