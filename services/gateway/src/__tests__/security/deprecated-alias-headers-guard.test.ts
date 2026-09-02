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
 * PARTIE 4 — SUIVABILITÉ, par BALAYAGE (#4423, reprise sur retour du
 * coordinateur). La partie 1 portait un contrôle « aucun successeur en
 * gabarit », mais SUR DEUX FICHIERS ÉCRITS À LA MAIN
 * (`admin/users-write.ts`, `users/blocking.ts`) et par un MOTIF qui ne lit
 * qu'un successeur en chaîne LITTÉRALE — sa justification étant « les
 * successeurs paramétrés se déclarent en FONCTION ». Vrai, et insuffisant :
 * une fonction peut tout aussi bien émettre un `:param` non résolu, ce
 * qu'a fait `message-read-status.ts` sans faire tomber ce fichier. La partie
 * 4 remplace ce contrôle : elle balaie TOUT `routes/`
 * (`deprecation-successor-sweep.ts`), ÉVALUE réellement chaque successeur
 * (littéral, ou appelé avec une requête FABRIQUÉE) et juge la CHAÎNE ÉMISE,
 * jamais la forme de sa déclaration. Elle a trouvé, sans qu'on la lui
 * indique, le SEUL site aujourd'hui fautif — `users/profile.ts#ANNONCE_PROFIL`
 * — et aucun autre : zéro faux positif sur les 54 sites qu'elle sait
 * évaluer.
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

/**
 * Les frères d'un site découpé (#4284) : le fichier NOMMÉ par `Site.file`,
 * plus tout `X-*.ts` du même répertoire — jamais une liste écrite à la main,
 * qui se périmerait au prochain découpage (doctrine `AppSourceGuard.unit`,
 * #4425). `users/profile.ts` a éclaté en quatre fichiers frères ; les trois
 * marqueurs qui le visent ci-dessous ne vivent plus que dans
 * `profile-lookups.ts`. Résoudre l'UNITÉ plutôt que le seul fichier nommé
 * évite deux pièges symétriques : rougir à tort parce que le nom cité a
 * changé d'adresse, ou s'aveugler parce qu'un prochain découpage déplace le
 * marqueur ailleurs dans la même famille sans que `SITES` ne soit mis à jour.
 */
function uniteDeSite(fichierRelatif: string): readonly { readonly chemin: string; readonly texte: string }[] {
  const dir = path.join(RACINE_ROUTES, path.dirname(fichierRelatif));
  const base = path.basename(fichierRelatif, '.ts');
  return fs.readdirSync(dir)
    .filter((nom) => nom === path.basename(fichierRelatif) || (nom.startsWith(`${base}-`) && nom.endsWith('.ts')))
    .sort()
    .map((nom) => {
      const chemin = path.join(dir, nom);
      return { chemin, texte: fs.readFileSync(chemin, 'utf8') };
    });
}

const SITES: readonly Site[] = [
  // `users/profile.ts` — trois alias de `GET /directory/people/:handle` (#4161, critère 9)
  { file: 'users/profile.ts', marker: "fastify.get('/u/:username'", label: 'GET /u/:username', via: 'annoncerDepreciation(' },
  { file: 'users/profile.ts', marker: "fastify.get('/users/:id'", label: 'GET /users/:id', via: 'annoncerDepreciation(' },
  { file: 'users/profile.ts', marker: "fastify.get('/users/id/:id'", label: 'GET /users/id/:id', via: 'annoncerDepreciation(' },

  // `admin/reports.ts` — un adaptateur mince de `POST /reports` (#4155)
  { file: 'admin/reports.ts', marker: "fastify.post('/', {", label: 'POST /admin/reports', via: 'depreciee(' },

  // `admin/users-write.ts` — neuf alias d'écriture de compte (#4154), tous via
  // le helper local `marquerAliasHistorique` (dont la fermeture — qu'il
  // appelle bien `applyDeprecationHeaders` — est vérifiée séparément plus bas).
  { file: 'admin/users-write.ts', marker: "fastify.patch('/admin/users/:userId/role'", label: 'PATCH .../role', via: 'depreciee(' },
  { file: 'admin/users-write.ts', marker: "fastify.patch('/admin/users/:userId/status'", label: 'PATCH .../status', via: 'depreciee(' },
  { file: 'admin/users-write.ts', marker: "fastify.post('/admin/users/:userId/unlock'", label: 'POST .../unlock', via: 'depreciee(' },
  { file: 'admin/users-write.ts', marker: "fastify.post('/admin/users/:userId/enable-2fa'", label: 'POST .../enable-2fa', via: 'depreciee(' },
  { file: 'admin/users-write.ts', marker: "fastify.post('/admin/users/:userId/disable-2fa'", label: 'POST .../disable-2fa', via: 'depreciee(' },
  { file: 'admin/users-write.ts', marker: "fastify.post('/admin/users/:userId/verify-email'", label: 'POST .../verify-email', via: 'depreciee(' },
  { file: 'admin/users-write.ts', marker: "fastify.post('/admin/users/:userId/verify-phone'", label: 'POST .../verify-phone', via: 'depreciee(' },
  { file: 'admin/users-write.ts', marker: "fastify.post('/admin/users/:userId/verify-age'", label: 'POST .../verify-age', via: 'depreciee(' },
  { file: 'admin/users-write.ts', marker: "fastify.post('/admin/users/:userId/voice-consent'", label: 'POST .../voice-consent', via: 'depreciee(' },

  // `users/blocking.ts` — les TROIS vrais alias de blocage (#4164). L'issue
  // #4274 les ancrait sur `directory/blocks.ts:250`, qui ne porte que les
  // routes CANONIQUES : suivre l'ancrage aurait marqué en sursis l'adresse
  // qui SUCCÈDE, exactement à l'envers. Deux d'entre eux se déclarent sous la
  // forme générique `fastify.post<{…}>(` — d'où l'élargissement de
  // `limiteDeBloc` ci-dessus, sans lequel leur bloc courait jusqu'à EOF et un
  // seul appel aurait satisfait les trois sites.
  { file: 'users/blocking.ts', marker: "fastify.post<{ Params: { userId: string } }>('/users/:userId/block'", label: 'POST /users/:userId/block', via: 'depreciee(' },
  { file: 'users/blocking.ts', marker: "fastify.delete<{ Params: { userId: string } }>('/users/:userId/block'", label: 'DELETE /users/:userId/block', via: 'depreciee(' },
  { file: 'users/blocking.ts', marker: "fastify.get('/users/me/blocked-users'", label: 'GET /users/me/blocked-users', via: 'depreciee(' },

  // `anonymous.ts` — les trois alias de session invitée (#4167), vers
  // `POST /links/:key/members` et `PATCH|DELETE /guest-sessions/me`.
  { file: 'anonymous.ts', marker: "fastify.post('/anonymous/join/:linkId'", label: 'POST /anonymous/join/:linkId', via: 'depreciee(' },
  { file: 'anonymous.ts', marker: "fastify.post('/anonymous/refresh'", label: 'POST /anonymous/refresh', via: 'depreciee(' },
  { file: 'anonymous.ts', marker: "fastify.post('/anonymous/leave'", label: 'POST /anonymous/leave', via: 'depreciee(' },
];

describe('Partie 1 — chaque route ALIAS de ce lot marque son sursis dans SON bloc', () => {
  it.each(SITES.map((s) => [s.label, s] as const))('%s appelle %s', (_label, site) => {
    const fichiers = uniteDeSite(site.file);
    // BORNE : un glob qui ne résout aucun fichier passerait au vert pour la
    // pire des raisons (répertoire ou base de nom mal calculés).
    expect(fichiers.length).toBeGreaterThan(0);

    // Le marqueur doit exister — DANS L'UNITÉ, et dans un fichier UNIQUE de
    // cette unité. Sinon la route a bougé (renommée, retirée) et ce témoin
    // serait vert SANS RIEN GARDER (piège nommé par la consigne 6) — ou elle
    // s'est dupliquée dans deux frères, ce qui rendrait `limiteDeBloc` ambigu
    // sur lequel des deux blocs borner.
    const porteurs = fichiers.filter(({ texte }) => texte.includes(site.marker));
    expect(porteurs.map((p) => path.relative(RACINE_ROUTES, p.chemin))).toHaveLength(1);

    const { texte } = porteurs[0];
    const debut = texte.indexOf(site.marker);
    expect(texte.indexOf(site.marker, debut + 1)).toBe(-1); // marqueur UNIQUE dans SON fichier

    const fin = limiteDeBloc(texte, debut);
    const bloc = texte.slice(debut, fin);
    expect(bloc).toContain(site.via);
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
  const MON_TERRITOIRE = [
    'admin/reports.ts',
    // Les neuf alias d'écriture de compte (#4154) se déclarent désormais un par
    // un, chacun dans ses options de route : l'indirection par un helper local
    // les rendait invisibles à ce balayage — un fichier portant neuf alias n'y
    // apparaissait pas du tout.
    'admin/users-write.ts',
    // `users/profile.ts` (#4284, budget de taille) a éclaté en quatre
    // fichiers frères ; les trois commentaires « ALIAS de `…` » qui font
    // ENTRER ce territoire dans le balayage LEXICAL (fichier par fichier, par
    // construction — voir `fichiersAvecAutoDeclaration`) vivent désormais
    // dans `profile-lookups.ts` seul. `profile.ts` n'est plus qu'une façade
    // de ré-export de 40 lignes, sans aucun commentaire de ce vocabulaire.
    // Cette entrée nomme le fichier où le balayage TROUVE réellement le
    // motif ; Partie 1 ci-dessus, elle, résout l'UNITÉ par glob et reste
    // robuste à un prochain découpage sans qu'on ait à y retoucher.
    'users/profile-lookups.ts',
    'users/blocking.ts',
    // `anonymous.ts` (#4167) — trois alias de session invitée par lien de
    // partage, vers `POST /links/:key/members` et `PATCH|DELETE
    // /guest-sessions/me`. Le mot « ADAPTATEUR MINCE » qui l'a fait ENTRER
    // ici cite l'énoncé même de l'issue #4167 (« restent montées en
    // adaptateurs minces vers ce handler ») — coïncidence lexicale avec la
    // convention de #4274, pas une intention empruntée ; la garde ne
    // regarde que le TEXTE, elle a donc raison de la traiter pareil.
    'anonymous.ts',
    // `conversations/sharing.ts` (#4353) — `POST /conversations/join/:linkId`
    // devient à son tour un ADAPTATEUR MINCE vers `performLinkJoin()`
    // (`./link-admission`, le cœur partagé de #4167), exactement comme les
    // trois routes-sœurs de `anonymous.ts` ci-dessus. Même coïncidence
    // lexicale, même traitement : elle annonce désormais son successeur
    // (`/api/v1/links/:key/members`) via `depreciee(...)`.
    'conversations/sharing.ts',
  ].sort();

  // Fichiers HORS territoire (autres sessions/issues du même lot). Cliquet :
  // une entrée EN TROP = un fichier nouvellement muet à router vers ce
  // module ; une entrée EN MOINS = un fichier réparé — retirer sa ligne fait
  // partie du correctif qui l'a réparé (patron `FROZEN_INVENTORY` du dépôt).
  const HORS_TERRITOIRE = [
    // #4349 a fait de `POST /conversations/:id/mark-read` un ADAPTATEUR MINCE
    // vers la collection unique d'accusés ; #4284 a ensuite sorti cette route de
    // `conversations/messages.ts` (2945 lignes) vers ce fichier-ci. Son ANNONCE
    // est le lot #4423, comme pour les cinq autres portes d'accusés — c'est
    // pourquoi il est ici et non dans MON_TERRITOIRE.
    'conversations/messages-read-status.ts',
    'auth/register.ts', // #4158/#4149 — vérification de pseudo/e-mail/téléphone
    'friends.ts', // #4162/#4150 — demandes d'amitié
    'users/contacts-directory.ts', // #4163
    'users/preferences.ts', // #4159
    'users/presence.ts', // #4164
  ].sort();

  it('le balayage LIT bien l’arbre — sinon il serait vert à vide', () => {
    expect(fichiersTs(RACINE_ROUTES).length).toBeGreaterThan(100);
  });

  /**
   * Fichiers d'AUTRES lots qui se déclarent alias ET portent le mécanisme.
   *
   * Troisième liste, et pas une extension de `MON_TERRITOIRE` : celle-là nomme
   * les fichiers de #4274, et y verser un fichier d'un autre lot ferait mentir
   * son intitulé. Ils subissent en revanche la MÊME vérification que lui — un
   * fichier qui se déclare alias sans importer ni appeler le site unique tombe,
   * quel que soit le lot qui l'a écrit.
   */
  const AUTRES_LOTS_CONFORMES = [
    // #4150 — les six portes de télémétrie de lecture (`view`, `impression`,
    // `impressions/batch`, `engagement/batch`, `downloads`, `anonymous-view`)
    // deviennent des alias délégant à `POST /social/events`. Leur sursis est
    // DÉCLARÉ dans `routes/social/deprecation.ts`, un module pur que la Partie 4
    // ÉVALUE réellement — les six sites y sont donc mesurés, pas gelés.
    'posts/impressions.ts',
    'posts/interactions.ts',
  ].sort();

  it('l’ensemble EXACT des fichiers auto-déclarés est celui-ci — ni plus, ni moins', () => {
    expect(fichiersAvecAutoDeclaration())
      .toEqual([...MON_TERRITOIRE, ...AUTRES_LOTS_CONFORMES, ...HORS_TERRITOIRE].sort());
  });

  it.each([...MON_TERRITOIRE, ...AUTRES_LOTS_CONFORMES])('%s importe et appelle réellement le site unique', (relatif) => {
    const texte = fs.readFileSync(path.join(RACINE_ROUTES, relatif), 'utf8');
    // Chemin relatif variable selon la PROFONDEUR du fichier sous `routes/` —
    // `admin/reports.ts` (un niveau) importe par `../../utils/deprecation`,
    // `anonymous.ts` (directement sous `routes/`, #4167) par
    // `../utils/deprecation`. La forme, jamais un nombre de `..` fixe.
    //
    // #4150 importe `depreciee` du site unique ET son ADRESSE d'un module de
    // déclaration partagé (`social/deprecation`) : les six alias annoncent le
    // même sursis, et le recopier six fois serait six dates à corriger le jour
    // où l'échéance bouge. Les deux formes sont acceptées ; ce qui est exigé
    // reste identique — importer le mécanisme, et l'appeler autant de fois
    // qu'on se déclare alias.
    expect(texte).toMatch(/from '(?:\.\.\/)+utils\/deprecation'|from '\.\.\/social\/deprecation'/);
    const nbDeclarations = texte.split('\n').filter(declareUnAlias).length;
    const nbAppels =
      texte.split('depreciee(').length - 1 + (texte.split('annoncerDepreciation(').length - 1);
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
    expect(res.headers['deprecation']).toMatch(/^@\d+$/);
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
    expect(res.headers['deprecation']).toMatch(/^@\d+$/);
    expect(res.headers['link']).toBe('</api/v1/reports>; rel="successor-version"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// PARTIE 4 — SUIVABILITÉ : la chaîne ÉMISE, par BALAYAGE (#4423)
// ─────────────────────────────────────────────────────────────────────────
//
// Remplace le contrôle de la partie 1 qui n'en couvrait que deux fichiers
// (`admin/users-write.ts`, `users/blocking.ts`, écrits à la main) et
// n'attrapait qu'un successeur en CHAÎNE littérale — jamais une FONCTION qui
// émet elle-même un `:param` non résolu, exactement le cas manqué sur
// `message-read-status.ts`.

import {
  balayerSuccesseurs,
  sitesDuFichier,
  evaluerSuccesseur,
  RACINE_ROUTES as SUCCESSOR_RACINE_ROUTES,
} from './deprecation-successor-sweep';

const BALAYAGE_SUCCESSEURS = balayerSuccesseurs();

describe('PARTIE 4 — le balayage de suivabilité balaie bien ce qu’il prétend balayer', () => {
  it('ouvre tout `routes/`, pas un seul répertoire', () => {
    expect(BALAYAGE_SUCCESSEURS.fichiersVisites).toBeGreaterThan(100);
  });

  it('trouve des sites de dépréciation dans PLUSIEURS fichiers DISTINCTS — jamais une paire écrite à la main', () => {
    const fichiers = new Set(BALAYAGE_SUCCESSEURS.findings.map((f) => f.fichier));
    // Les quatre étaient hors de portée du contrôle qu'il remplace : deux
    // n'y figuraient pas du tout (`friends.ts`, `posts/feed.ts`), un y
    // figurait mais son motif ne lisait que les chaînes littérales
    // (`users/profile.ts`), un est le sixième territoire de #4423
    // (`message-read-status.ts`).
    // `users/profile.ts` -> `users/profile-lookups.ts` (#4284) : c'est là que
    // vivent désormais les trois portes de profil.
    for (const attendu of ['friends.ts', 'posts/feed.ts', 'users/profile-lookups.ts', 'message-read-status.ts']) {
      expect(fichiers.has(attendu)).toBe(true);
    }
    expect(fichiers.size).toBeGreaterThan(15);
  });

  /**
   * Les QUATRE formes de déclaration que ce dépôt emploie pour un
   * `AdresseDepreciee` — un détecteur qui n'en reconnaîtrait qu'une mesurerait
   * la popularité d'un style d'écriture, pas une propriété (cycle 107, leçon
   * du dépôt sur les balayages lexicaux).
   */
  it.each([
    // #4284 — les fichiers REPRÉSENTATIFS de deux de ces quatre formes ont
    // changé d'adresse : l'inline vit dans `conversations/messages-read-status.ts`
    // et l'indirection dans `users/profile-lookups.ts`. Ce qui est gardé est la
    // FORME, jamais le fichier ; seule l'adresse de l'exemplaire bouge.
    ['conversations/messages-read-status.ts', /^conversations\/messages-read-status\.ts#<inline:POST/, 'littéral INLINE au site d’appel'],
    ['message-read-status.ts', 'message-read-status.ts#ANNONCE_RECEIPTS_ECRITURE', 'const de même fichier, référencée par son NOM'],
    ['friends.ts', 'friends.ts#ANNONCE_ALIAS_FRIENDS.agir', 'const GROUPÉE, référencée par PROPRIÉTÉ'],
    ['users/profile-lookups.ts', /^users\/profile-lookups\.ts#annonceProfil\(/, 'INDIRECTION : appel d’une fonction de même fichier qui RETOURNE une AdresseDepreciee'],
  ])('reconnaît %s — %s', (_fichier, cleOuMotif) => {
    const cles = BALAYAGE_SUCCESSEURS.findings.map((f) => f.cle);
    if (typeof cleOuMotif === 'string') {
      expect(cles).toContain(cleOuMotif);
    } else {
      expect(cles.some((c) => (cleOuMotif as RegExp).test(c))).toBe(true);
    }
  });

  // ── La preuve qui vaille : il ROUGIT sur une source fabriquée fautive, ──
  // ── et se TAIT sur la même source corrigée ───────────────────────────────
  const SOURCE_FONCTION_FAUTIVE = `
    import { depreciee } from '../utils/deprecation';
    export async function routesFictives(fastify) {
      fastify.get('/x/:id/y', {
        onRequest: depreciee({
          depuis: '2026-08-30',
          successeur: (request) => \`/api/v1/x/:id/y\`,
        }),
      }, handler);
    }
  `;

  it('ROUGIT (chaîne en gabarit) sur un successeur FONCTION fabriqué pour être fautif', () => {
    const sites = sitesDuFichier('/x/routes/fictif.ts', SOURCE_FONCTION_FAUTIVE);
    expect(sites).toHaveLength(1);

    const resultat = evaluerSuccesseur(sites[0], SOURCE_FONCTION_FAUTIVE);
    expect(resultat.ok).toBe(true);
    expect(resultat.ok && resultat.chaineEmise).toBe('/api/v1/x/:id/y');
  });

  it('se TAIT sur la MÊME source une fois le paramètre réellement interpolé', () => {
    const corrigee = SOURCE_FONCTION_FAUTIVE.replace(
      '`/api/v1/x/:id/y`',
      '`/api/v1/x/${(request.params as { id: string }).id}/y`'
    );
    const sites = sitesDuFichier('/x/routes/fictif.ts', corrigee);
    const resultat = evaluerSuccesseur(sites[0], corrigee);
    expect(resultat.ok).toBe(true);
    expect(resultat.ok && resultat.chaineEmise).toBe('/api/v1/x/FAKE_PARAM_507f1f77bcf86cd799439aa/y');
  });

  it('ROUGIT aussi sur un successeur CHAÎNE littérale fabriqué pour être fautif (la forme du contrôle remplacé)', () => {
    // `const ANNONCE` DOIT rester en COLONNE 0 : c'est ce qui distingue une
    // déclaration de MODULE (que le résolveur doit suivre) d'une variable
    // LOCALE à un handler (qu'il ne doit surtout pas confondre avec elle —
    // voir le doc-comment de `corpsDeLaDeclaration`).
    const source = [
      "import { depreciee } from '../utils/deprecation';",
      "const ANNONCE = { depuis: '2026-08-30', successeur: '/api/v1/x/:id' };",
      'export async function r(fastify) {',
      "  fastify.get('/x/:id', { onRequest: depreciee(ANNONCE) }, handler);",
      '}',
    ].join('\n');
    const sites = sitesDuFichier('/x/routes/fictif2.ts', source);
    const resultat = evaluerSuccesseur(sites[0], source);
    expect(resultat.ok).toBe(true);
    expect(resultat.ok && resultat.chaineEmise).toBe('/api/v1/x/:id');
  });
});

/**
 * DETTE_HORS_TERRITOIRE — le SEUL site que le balayage élargi trouve fautif,
 * et il est hors du territoire de #4423 (`services/gateway/src/routes/users/profile.ts`
 * n'est ni `messages.ts` ni `message-read-status.ts`). Nommé plutôt
 * qu'ignoré, comme `routes/admin/agent-topics.ts` pour le cliquet voisin
 * (`account-keyed-rate-limit-sweep.test.ts`) : une entrée EN TROP signale un
 * nouveau site fautif ; une entrée EN MOINS signale un site réparé — la
 * retirer fait partie du correctif qui l'a réparé.
 *
 * `ANNONCE_PROFIL.successeur = '/api/v1/directory/people/:handle'` part
 * INCONDITIONNELLEMENT sur `onRequest`, y compris sur les branches 401/403
 * qui précèdent la résolution du handle — le client n'a alors AUCUN moyen de
 * le suivre. Le même fichier porte pourtant `annonceProfil(handle)`, qui
 * résout le VRAI handle et s'ajoute (le `Link` est cumulatif) une fois le
 * handler atteint — mais seulement sur les branches qui l'atteignent.
 */
const DETTE_HORS_TERRITOIRE: ReadonlyArray<readonly [string, string]> = [];

describe('PARTIE 4 — le successeur ANNONCÉ émet une chaîne SUIVABLE, partout sauf la dette nommée', () => {
  it('aucun site, hors DETTE_HORS_TERRITOIRE, n’émet un successeur en gabarit', () => {
    const attendues = DETTE_HORS_TERRITOIRE.map(([cle]) => cle).sort();
    const fautifs = BALAYAGE_SUCCESSEURS.findings
      .filter((f) => !f.suivable)
      .map((f) => f.cle)
      .sort();

    expect(fautifs).toEqual(attendues);
  });

  // `it.each` sur un tableau VIDE lève (Jest 30) plutôt que de ne produire
  // aucun cas — la garde protège l'état visé par `DETTE_HORS_TERRITOIRE` lui-
  // même : une liste vide, aucune dette hors territoire à confirmer fautive.
  if (DETTE_HORS_TERRITOIRE.length > 0) {
    it.each(DETTE_HORS_TERRITOIRE)('%s reste fautif (%s) — sinon retirer sa ligne', (cle) => {
      const trouve = BALAYAGE_SUCCESSEURS.findings.find((f) => f.cle === cle);
      expect(trouve).toBeDefined();
      expect(trouve?.suivable).toBe(false);
    });
  }

  /**
   * Une garde négative dont le balayage rend `[]` reste verte pour rien
   * (doctrine du cliquet voisin, `account-keyed-rate-limit-sweep.test.ts`).
   * Ici l'équivalent est une ÉVALUATION qui échoue silencieusement : un site
   * que le résolveur ne sait pas évaluer disparaît de `suivable`/`!suivable`
   * sans qu'aucun test ne le remarque. Zéro échec d'évaluation mesuré sur les
   * 54 sites vivants du dépôt au moment de #4423.
   */
  it('chaque site s’évalue SANS erreur — une évaluation manquée masquerait un défaut réel', () => {
    const echecs = BALAYAGE_SUCCESSEURS.findings
      .filter((f) => f.evaluation.ok === false)
      .map((f) => `${f.cle}: ${f.evaluation.ok === false ? f.evaluation.raison : ''}`);

    expect(echecs).toEqual([]);
  });

  it('`RACINE_ROUTES` du balayage pointe bien `routes/`, jamais un autre sous-arbre', () => {
    expect(SUCCESSOR_RACINE_ROUTES.endsWith(`${require('path').sep}routes`)).toBe(true);
  });
});
