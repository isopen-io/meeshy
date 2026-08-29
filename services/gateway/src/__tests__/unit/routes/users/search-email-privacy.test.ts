/**
 * La recherche d'utilisateurs ne sert plus les adresses e-mail (#4145).
 *
 * `GET /users/search` mettait `email` À LA FOIS dans la clause `OR` du `where`
 * et dans le `select` servi. Tout compte authentifié pouvait donc chercher
 * `contains: "gmail.com"` et récupérer en clair les adresses correspondantes,
 * cent par page, sans aucun limiteur sur la route.
 *
 * Deux règles, et elles sont distinctes :
 *
 *   1. On peut RETROUVER quelqu'un dont on connaît déjà l'adresse — c'est
 *      l'usage légitime que le porteur décrit (« écrire à un utilisateur … par
 *      mail, téléphone, pseudo, display name, nom, prénom »). La recherche par
 *      e-mail est donc conservée, mais EXACTE : `equals`, jamais `contains`.
 *      Une sous-chaîne transforme la porte en moissonneuse.
 *   2. On ne REÇOIT jamais l'adresse d'un tiers. Chercher par un identifiant
 *      qu'on possède déjà n'apprend rien ; se le faire servir apprend tout.
 *
 * La présence, elle, était déjà correctement gardée sur cette route
 * (`viewerFromRequest` / `resolveForTargets` / `applyPresenceVisibilityAsOffline`),
 * conformément à la directive du 2026-08-25 — ces témoins ne doivent pas la
 * défaire.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

const findMany = jest.fn<any>();
const count = jest.fn<any>();

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()),
  }),
}));

import { searchUsers } from '../../../../routes/users/preferences';

const MOI = '507f1f77bcf86cd799439011';
const AUTRE = '507f1f77bcf86cd799439022';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: MOI,
      registeredUser: { id: MOI, role: 'USER' },
    };
  });
  app.decorate('prisma', { user: { findMany, count } } as any);
  await app.register(searchUsers);
  await app.ready();
  return app;
}

/**
 * Les clauses du `OR` de RECHERCHE.
 *
 * `where.AND` porte DEUX blocs qui ont chacun un `OR` : le premier écarte les
 * comptes supprimés (`deletedAt`), le second est la recherche. Prendre le
 * premier venu attesterait le mauvais.
 */
function clausesOr(): Array<Record<string, any>> {
  const where = findMany.mock.calls[0][0].where;
  // `searchTokens` fait partie des repères depuis #4159 : c'est LUI qui porte
  // désormais la recherche par nom, et sans lui ce helper ne reconnaît plus le
  // bloc `OR` qu'il vient chercher — il rendrait alors le tableau VIDE, et
  // toutes les assertions négatives de ce fichier passeraient au vert en ne
  // mesurant plus rien.
  const CHAMPS = ['searchTokens', 'firstName', 'lastName', 'username', 'displayName', 'email', 'phoneNumber'];
  const bloc = (where.AND as Array<Record<string, unknown>>).find(
    (c) => Array.isArray(c.OR) && (c.OR as Array<Record<string, unknown>>).some(
      (clause) => CHAMPS.some((champ) => champ in clause)
    )
  );
  // LEVER, jamais rendre un vide plausible : plusieurs témoins de ce fichier
  // sont NÉGATIFS (`expect(...).toBeUndefined()`), et sur un tableau vide ils
  // sont tous vrais. Un helper de navigation qui replie sur `[]` transforme un
  // échec de localisation en succès d'assertion, et la garde de
  // confidentialité disparaîtrait en silence (leçon 308).
  if (!bloc) {
    throw new Error(
      "clausesOr : bloc `OR` introuvable dans le `where`. Les repères ont-ils changé ? " +
      `Repères cherchés : ${CHAMPS.join(', ')}.`
    );
  }
  return bloc.OR as Array<Record<string, any>>;
}

describe('GET /users/search — l’adresse e-mail ne se moissonne pas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([
      {
        id: AUTRE,
        username: 'bob',
        firstName: 'Bob',
        lastName: 'Martin',
        displayName: 'Bob M.',
        email: 'bob.martin@gmail.com',
        isOnline: false,
        lastActiveAt: null,
        systemLanguage: 'fr',
      },
    ]);
    count.mockResolvedValue(1);
  });

  it('ne SERT jamais l’adresse e-mail d’un tiers', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/users/search?q=bob' });
    const corps = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(corps.data).toHaveLength(1);
    // Ni dans la charge servie…
    expect(corps.data[0].email).toBeUndefined();
    // …ni nulle part dans la réponse sérialisée.
    expect(res.payload).not.toContain('gmail.com');

    await app.close();
  });

  it('ne CHARGE pas l’adresse e-mail depuis la base', async () => {
    const app = await buildApp();

    await app.inject({ method: 'GET', url: '/users/search?q=bob' });
    const select = findMany.mock.calls[0][0].select as Record<string, boolean>;

    // Ce qui n'est pas chargé ne peut pas fuir par une omission de schéma —
    // une protection qui repose sur fast-json-stringify est un piège armé,
    // pas une garde (cf. services/gateway/CLAUDE.md, cycle 84).
    expect(select.email).toBeUndefined();

    await app.close();
  });

  it('cherche par e-mail en correspondance EXACTE, jamais par sous-chaîne', async () => {
    const app = await buildApp();

    await app.inject({ method: 'GET', url: '/users/search?q=bob.martin%40gmail.com' });
    const emailClause = clausesOr().find((c) => 'email' in c);

    expect(emailClause).toBeDefined();
    expect(emailClause!.email.contains).toBeUndefined();
    expect(emailClause!.email.equals).toBe('bob.martin@gmail.com');

    await app.close();
  });

  it('cherche aussi par NUMÉRO, en correspondance exacte', async () => {
    const app = await buildApp();

    await app.inject({ method: 'GET', url: '/users/search?q=%2B33612345678' });
    const phoneClause = clausesOr().find((c) => 'phoneNumber' in c);

    expect(phoneClause).toBeDefined();
    expect(phoneClause!.phoneNumber.equals).toBe('+33612345678');
    expect(phoneClause!.phoneNumber.contains).toBeUndefined();

    await app.close();
  });

  it('cherche les NOMS par l’INDEX de jetons, jamais par quatre `contains`', async () => {
    const app = await buildApp();

    await app.inject({ method: 'GET', url: '/users/search?q=mar' });
    const clauses = clausesOr();

    // Ce témoin exigeait auparavant quatre `contains` NON ancrés sur des
    // colonnes que rien n'indexait — chaque frappe balayait la collection
    // entière. Il gelait donc le défaut le plus coûteux du module (#4159).
    //
    // Le compromis du remplacement est assumé et écrit : on perd la
    // sous-chaîne au MILIEU d'un mot (`ar` ne trouve plus `mar`), on garde le
    // préfixe de CHAQUE mot. Rétablir la sous-chaîne médiane demanderait Atlas
    // Search — un changement d'INFRASTRUCTURE, pas de schéma.
    const parJetons = clauses.find((x) => 'searchTokens' in x);
    expect(parJetons).toBeDefined();
    expect(parJetons!.searchTokens).toEqual({ has: 'mar' });

    for (const champ of ['firstName', 'lastName', 'username', 'displayName']) {
      expect(clauses.find((x) => champ in x)).toBeUndefined();
    }
    // Un fragment qui n'est ni une adresse ni un numéro n'interroge pas ces
    // deux colonnes : inutile, et cela ferait porter le scan sur des index
    // qu'on veut réserver aux correspondances exactes.
    expect(clauses.find((x) => 'email' in x)).toBeUndefined();
    expect(clauses.find((x) => 'phoneNumber' in x)).toBeUndefined();

    await app.close();
  });
});
