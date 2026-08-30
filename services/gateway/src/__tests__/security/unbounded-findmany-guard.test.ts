/**
 * #4165 — « Aucune liste ne rend plus une collection entière ».
 *
 * Critère 4 : une garde de SOURCE qui rougit si un `findMany` réapparaît
 * SANS `take` ni `skip` dans `services/gateway/src/routes/`. L'issue nomme
 * elle-même la subtilité : une garde NÉGATIVE meurt en silence le jour où son
 * balayage ne matche plus rien — elle s'accompagne donc d'un cas POSITIF
 * (§ « Ce que le balayage sait discriminer ») prouvant qu'elle rougit bien
 * quand on réintroduit un `findMany` nu, et d'une garde de PÉRIMÈTRE (§ « Le
 * balayage LIT bien le répertoire ») prouvant qu'elle ne s'est pas vidée en
 * cessant de trouver des fichiers.
 *
 * Patron repris de `response-schema-closure-guard.test.ts` (#4168, livré le
 * matin de ce lot) : accolades/parenthèses appariées et insensibles aux
 * commentaires (`stripComments`, importé — pas redéfini, une même fonction ne
 * se recopie pas), inventaire GELÉ des sites hors territoire de CE lot, clé
 * par FICHIER + NOMBRE — jamais par numéro de ligne. C'est une loi écrite du
 * dépôt (`services/gateway/CLAUDE.md`, § « Le balayage est OUTILLÉ ») : « une
 * clé de ligne dérive à la première édition et transforme le cliquet en
 * bruit » — commise et corrigée dans CE MÊME dépôt le jour même où ce lot
 * tourne (voir l'historique de `response-schema-closure-guard.test.ts`).
 *
 * Ce que ce témoin GARDE, et ce qu'il ne corrige pas : il balaie TOUT
 * `services/gateway/src/routes/` (comme l'issue le demande), pas seulement
 * le territoire de ce lot. Les dix routes nommées par #4165 et bornées par ce
 * lot (`conversations/messages-advanced.ts`, `communities/core.ts`,
 * `links/utils/prisma-queries.ts`, `anonymous.ts`, `admin/agent.ts`,
 * `admin/users.ts`) sortent de l'inventaire gelé avec preuve (second `it` de
 * chaque bloc ci-dessous). Les sites restants — hors territoire de ce lot
 * (fichiers-carrefour interdits, ou simplement non couverts par les dix
 * routes nommées) — sont GELÉS : geler documente qu'ils sont VUS, pas qu'ils
 * sont bons. Le détail route par route vit dans le commentaire de clôture de
 * l'issue #4165 (inventaire des 27), pas ici.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

import { stripComments } from '../../routes/__tests__/response-schema-sweep';

const ROUTES_DIR = join(__dirname, '../../routes');

// =============================================================================
// Mécanique de balayage — parenthèses appariées, insensible aux commentaires.
// Un `grep 'findMany('` seul ne sait pas dire si l'appel porte `take`/`skip`
// QUELQUE PART dans ses arguments, qui peuvent s'étendre sur des dizaines de
// lignes et contenir des objets imbriqués (`where`, `select`, `include`, eux
// -mêmes pleins de parenthèses de fonctions). Il faut apparier la parenthèse
// D'OUVERTURE de l'appel à sa FERMETURE, puis chercher `take`/`skip` dans
// exactement cette plage — ni avant (l'appel précédent), ni après (le suivant).
// =============================================================================

/** Fin (inclusive) de l'appel ouvert par la parenthèse à `openIndex`. */
function matchParen(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length - 1;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

/**
 * La profondeur d'accolades en `position`, comptée depuis `start` (exclusif).
 * Sert à distinguer une clé au premier niveau de l'objet d'argument d'une clé
 * de MÊME NOM enfouie dans une relation imbriquée — voir le commentaire de
 * `hasTopLevelKey` : c'est la distinction que ce témoin a RATÉE en première
 * version (mesuré : un `take` posé UNIQUEMENT sur `include.participants`
 * masquait l'absence de `take` sur le `findMany` lui-même).
 */
function braceDepthAt(source: string, start: number, position: number): number {
  let depth = 0;
  for (let i = start; i < position; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
  }
  return depth;
}

/**
 * `key` apparaît-il comme propriété DIRECTE de l'objet d'argument ouvert à
 * `objectStart` — jamais comme propriété d'une relation imbriquée
 * (`include: { x: { take: … } }`) ? Une clé directe est à la profondeur 1
 * juste après l'accolade ouvrante de l'objet lui-même.
 *
 * Reconnaît AUSSI la forme raccourcie (`{ take }`, propriété = variable de
 * même nom) — pas seulement `take: expr`. Mesuré en faux positif réel sur
 * `conversations/utils/delta-tombstones.ts` (#4165) : `const take = LIMIT +
 * 1; prisma.x.findMany({ where, select, take })` est BORNÉ (le `take` du
 * paramètre nommé), et la forme `\btake\s*:/` seule le manquait — le
 * signalant à tort comme un `findMany` nu. Une clé raccourcie se termine par
 * une virgule ou l'accolade fermante, jamais par autre chose.
 */
function hasTopLevelKey(args: string, objectStart: number, key: string): boolean {
  if (objectStart < 0) return false;
  const re = new RegExp(`\\b${key}\\s*(:|[,}])`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(args)) !== null) {
    if (braceDepthAt(args, objectStart, m.index) === 1) return true;
  }
  return false;
}

export type UnboundedFindManySite = {
  readonly file: string;
  readonly line: number;
};

/**
 * Les `.findMany(...)` dont l'objet d'argument ne porte, à son PREMIER
 * NIVEAU, NI `take:` NI `skip:` — la formulation exacte du critère 4 de
 * #4165. Un `findMany` qui ne porte que `skip` (sans `take`) n'est pas
 * signalé par cette garde : ce n'est pas un oubli, c'est le périmètre que
 * l'issue elle-même trace (« sans take ni skip » — la conjonction, pas chaque
 * terme séparément). Un tel appel resterait en pratique dangereux (rien ne
 * borne le nombre de lignes rendues après le décalage) mais aucun des dix
 * sites nommés par #4165 n'est dans ce cas, et l'élargir est un chantier à
 * part, pas une extension silencieuse de ce témoin.
 *
 * Le premier niveau SEUL, et c'est une correction, pas une nuance : un
 * `take` posé sur une relation imbriquée (`include: { participants: { take:
 * 100 } } }`, le patron même de `communities/core.ts` sur
 * `/communities/:id/conversations`) matchait `\btake\s*:/` sur la plage
 * ENTIÈRE des arguments dans la première version de ce témoin — masquant
 * l'absence de `take` sur le `findMany` LUI-MÊME. Mesuré en le prouvant rouge
 * puis vert avec et sans le `skip`/`take` de tête de cette route précise.
 */
export function scanUnboundedFindMany(source: string, file: string): ReadonlyArray<UnboundedFindManySite> {
  const code = stripComments(source);
  const sites: UnboundedFindManySite[] = [];
  const re = /\.findMany\s*\(/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(code)) !== null) {
    const openParen = code.indexOf('(', m.index);
    const close = matchParen(code, openParen);
    const args = code.slice(openParen, close + 1);
    const objectStart = args.indexOf('{');
    const hasTake = hasTopLevelKey(args, objectStart, 'take');
    const hasSkip = hasTopLevelKey(args, objectStart, 'skip');
    if (!hasTake && !hasSkip) {
      sites.push({ file, line: lineOf(code, m.index) });
    }
  }

  return sites;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') walk(full, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

export function sweepUnboundedFindMany(routesDir: string): ReadonlyArray<UnboundedFindManySite> {
  return walk(routesDir).flatMap((full) =>
    scanUnboundedFindMany(readFileSync(full, 'utf8'), relative(routesDir, full))
  );
}

/** Compte les sites par FICHIER — la clé stable (§ header). */
function compterParFichier(sites: ReadonlyArray<UnboundedFindManySite>): Record<string, number> {
  return sites.reduce<Record<string, number>>((acc, s) => {
    return { ...acc, [s.file]: (acc[s.file] ?? 0) + 1 };
  }, {});
}

// =============================================================================
// Inventaire GELÉ — hors territoire de CE lot de #4165 (les dix routes
// nommées par l'issue, et elles seules, ont été bornées ici). Chaque famille
// est expliquée dans le commentaire de clôture de l'issue #4165 (inventaire
// des 27, route par route) plutôt que d'être répétée fichier par fichier ici.
// Geler documente que ces sites sont VUS, pas qu'ils sont bons — un prochain
// lot les instruit un par un, exactement comme #4165 vient de le faire pour
// les dix siens.
// =============================================================================
const FROZEN_UNBOUNDED_FINDMANY: Readonly<Record<string, number>> = {
  'admin/agent-topics.ts': 1,
  'admin/agent.ts': 8,
  'admin/invitations.ts': 1,
  // 3 -> 2 : #4391 a RETIRE le `findMany` de `GET /admin/messages/stats`, qui
  // ramenait `select: { createdAt, content }` sur TOUTE la fenetre — une ligne
  // par message, texte integral compris — pour n'en tirer qu'un histogramme
  // quotidien et une longueur moyenne. Les deux se calculent desormais en base,
  // en une seule passe `aggregateRaw` + `$facet` (patron de `admin/languages.ts`).
  // Les DEUX restants sont ailleurs dans le fichier : `GET /trends` (meme motif,
  // hors des six routes nommees par #4391 — voir le rapport de cloture) et la
  // relecture des participants du top-10 de `/stats`, bornee transitivement par
  // le `take: 10` du `groupBy` qui l'alimente.
  'admin/messages.ts': 2,
  'admin/posts.ts': 1,
  'admin/system-rankings.ts': 13,
  'auth/register.ts': 1,
  'communities/membership.ts': 1,
  'community-preferences.ts': 1,
  'conversations/ban.ts': 2,
  'conversations/core.ts': 8,
  'conversations/leave.ts': 1,
  // 5 -> 3 : #4177 a retire du travail MORT, pas ajoute une borne. Trois lectures
  // (currentUserReactions au niveau du message, currentUserConsumption par piece
  // jointe, et le bloc reactions brut sous include_reactions) etaient calculees
  // puis jetees a la serialisation -- aucun schema ne les declarait, donc elles
  // n'atteignaient AUCUN client. Deux d'entre elles etaient des findMany nus.
  // Un cliquet qui descend parce que le travail a disparu est la seule facon
  // agreable de le voir descendre.
  'conversations/messages.ts': 3,
  // Cinq, et non sept : deux sites ont suivi le geste de retrait d'un
  // participant dans son propre fichier (#4176). Le compte total est inchangé.
  'conversations/participants.ts': 5,
  'conversations/participant-removal.ts': 2,
  'conversations/search.ts': 1,
  'conversations/sharing.ts': 2,
  'conversations/stats.ts': 1,
  'conversations/threads.ts': 1,
  'directory/availability.ts': 1,
  'directory/blocks.ts': 1,
  'directory/presence.ts': 2,
  // DEPLACE, pas ajoute : #4169 a fait converger les deux portes de creation de
  // lien de partage vers un ecrivain unique (mintConversationShareLink), et les
  // deux sites non bornes l'ont suivi tels quels depuis links/creation.ts. Le
  // total du depot est inchange ; seule la CLE change, parce que ce cliquet est
  // indexe par FICHIER. Ne pas lire cette ligne comme une nouvelle dette.
  'links/utils/share-link-mint.ts': 2,
  'me/export.ts': 2,
  'posts/hashtag.ts': 1,
  // `posts/interactions.ts` a perdu le sien en meme temps que ses routes : il
  // vit desormais dans `posts/impressions.ts`, inchange. `postConsumptionGate`
  // en ajoute UN, et c'est un ajout assume : il remplace N `findFirst`
  // sequentiels par UNE passe. Il n'a ni take ni skip parce que sa borne est
  // AILLEURS — la clause `id: { in: distinctIds }` sur un lot que le schema de
  // `/posts/impressions/batch` plafonne a 100. Une borne transitive reste une
  // borne ; ce cliquet compte les take/skip, il ne sait pas les lire.
  'posts/impressions.ts': 1,
  'posts/postConsumptionGate.ts': 1,
  'posts/nearby.ts': 1,
  'push-tokens.ts': 1,
  'signal-protocol.ts': 1,
  'sync/membership.ts': 1,
  'user-deletions.ts': 2,
  // 1 -> 0, donc la CLE disparait : #4391 a retire le dernier `findMany` nu du
  // fichier — `GET /users/me/stats/timeline` ramenait UNE LIGNE PAR MESSAGE des
  // 90 derniers jours (`select: { createdAt }`, sans `take`) pour en faire un
  // histogramme de 90 entiers. Un COUNT par tranche, en parallele, le remplace
  // (patron de `admin/analytics.ts`). Le budget de lignes lues est garde par
  // `__tests__/security/stats-routes-row-budget.test.ts`.
};

describe('Aucun findMany sans take ni skip hors inventaire figé (#4165 critère 4)', () => {
  it("n'introduit aucun site neuf sous services/gateway/src/routes/", () => {
    expect(compterParFichier(sweepUnboundedFindMany(ROUTES_DIR)))
      .toEqual(FROZEN_UNBOUNDED_FINDMANY);
  });

  it('les dix routes nommées par #4165, bornées par CE lot, ne portent plus un seul findMany nu dans leur handler', () => {
    // `admin/agent.ts` garde HUIT findMany nus ailleurs dans le fichier (voir
    // l'inventaire gelé ci-dessus) : ce sont des routes AUTRES que les deux
    // que ce lot borne (`/configs`, `/configs/:conversationId/roles`) — le
    // témoin ci-dessous isole chaque route par SLICE de fonction, jamais par
    // fichier entier, pour ne prouver que ce que CE lot a réellement corrigé.
    // Les cinq autres fichiers touchés par ce lot (`messages-advanced.ts`,
    // `communities/core.ts`, `links/utils/prisma-queries.ts`, `anonymous.ts`,
    // `admin/users.ts`) sont désormais ENTIÈREMENT propres — absents de
    // l'inventaire gelé — et le sont donc DEUX fois : ici, route par route, et
    // dans le compte GLOBAL du premier `it` ci-dessus.
    const messagesAdvanced = readFileSync(join(ROUTES_DIR, 'conversations/messages-advanced.ts'), 'utf8');
    const reactionsHandler = messagesAdvanced.slice(
      messagesAdvanced.indexOf("'/conversations/:id/reactions'"),
      messagesAdvanced.indexOf("'/conversations/:id/status'")
    );
    expect(scanUnboundedFindMany(reactionsHandler, 'conversations/messages-advanced.ts#reactions')).toEqual([]);

    const communitiesCore = readFileSync(join(ROUTES_DIR, 'communities/core.ts'), 'utf8');
    const conversationsHandler = communitiesCore.slice(
      communitiesCore.indexOf("'/communities/:id/conversations'"),
      communitiesCore.indexOf("post('/communities/:id/conversations/:conversationId'")
    );
    expect(scanUnboundedFindMany(conversationsHandler, 'communities/core.ts#conversations')).toEqual([]);

    const linkQueries = readFileSync(join(ROUTES_DIR, 'links/utils/prisma-queries.ts'), 'utf8');
    expect(scanUnboundedFindMany(linkQueries, 'links/utils/prisma-queries.ts')).toEqual([]);

    const anonymous = readFileSync(join(ROUTES_DIR, 'anonymous.ts'), 'utf8');
    const linkPreviewHandler = anonymous.slice(anonymous.indexOf("'/anonymous/link/:identifier'"));
    expect(scanUnboundedFindMany(linkPreviewHandler, 'anonymous.ts#link-preview')).toEqual([]);

    const agent = readFileSync(join(ROUTES_DIR, 'admin/agent.ts'), 'utf8');
    const configsHandler = agent.slice(agent.indexOf("'/configs'"), agent.indexOf("'/configs/:conversationId'"));
    const rolesHandler = agent.slice(agent.indexOf("'/configs/:conversationId/roles'"), agent.indexOf("'/roles/:conversationId/:userId/assign'"));
    expect(scanUnboundedFindMany(configsHandler, 'admin/agent.ts#configs')).toEqual([]);
    expect(scanUnboundedFindMany(rolesHandler, 'admin/agent.ts#roles')).toEqual([]);

    const users = readFileSync(join(ROUTES_DIR, 'admin/users.ts'), 'utf8');
    const reportedMessagesHandler = users.slice(
      users.indexOf("'/admin/users/:userId/reported-messages'"),
      users.indexOf("'/admin/conversations/:conversationId/participants'")
    );
    expect(scanUnboundedFindMany(reportedMessagesHandler, 'admin/users.ts#reported-messages')).toEqual([]);
  });
});

describe('Ce que le balayage sait discriminer', () => {
  it('signale un findMany sans take ni skip', () => {
    const source = `
      const rows = await prisma.reaction.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' }
      });`;

    expect(scanUnboundedFindMany(source, 'x.ts')).toMatchObject([{ file: 'x.ts' }]);
  });

  it("signale un findMany dont le SEUL take vit sur une relation imbriquée (include.x.take) — pas au premier niveau", () => {
    // Le patron exact de `communities/core.ts` AVANT que `skip`/`take` ne
    // soient posés sur `conversation.findMany` lui-même : la relation
    // `participants` porte son propre plafond d'affichage, ce qui a fait
    // passer la première version de ce témoin au VERT sur une liste de
    // conversations pourtant totalement non bornée.
    const source = `
      const rows = await prisma.conversation.findMany({
        where: { communityId: id },
        include: {
          participants: {
            take: 100,
            include: { user: { select: { id: true } } }
          }
        },
        orderBy: { updatedAt: 'desc' }
      });`;

    expect(scanUnboundedFindMany(source, 'x.ts')).toMatchObject([{ file: 'x.ts' }]);
  });

  it('ne signale RIEN quand le findMany porte SON PROPRE take, même en présence du même patron imbriqué', () => {
    const source = `
      const rows = await prisma.conversation.findMany({
        where: { communityId: id },
        include: {
          participants: {
            take: 100,
            include: { user: { select: { id: true } } }
          }
        },
        orderBy: { updatedAt: 'desc' },
        skip: offsetNum,
        take: limitNum
      });`;

    expect(scanUnboundedFindMany(source, 'x.ts')).toEqual([]);
  });

  it("ne signale RIEN pour un findMany dont `take` est une propriété RACCOURCIE ({ take }, pas { take: take })", () => {
    // Patron réel de `conversations/utils/delta-tombstones.ts` — faux
    // positif mesuré de la première version de ce témoin.
    const source = `
      const take = LIMIT + 1;
      const rows = await prisma.conversation.findMany({
        where: { closedAt: { gt: since } },
        select: { id: true },
        take,
      });`;

    expect(scanUnboundedFindMany(source, 'x.ts')).toEqual([]);
  });

  it('ne signale RIEN pour un findMany avec take', () => {
    const source = `
      const rows = await prisma.reaction.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: 100
      });`;

    expect(scanUnboundedFindMany(source, 'x.ts')).toEqual([]);
  });

  it('ne signale RIEN pour un findMany avec skip + take, même avec des parenthèses imbriquées dans where', () => {
    const source = `
      const rows = await prisma.message.findMany({
        where: { conversationId, createdAt: { lt: new Date(Date.now() - 1000) } },
        skip: offset,
        take: limit
      });`;

    expect(scanUnboundedFindMany(source, 'x.ts')).toEqual([]);
  });

  it("ne rapporte pas un findMany cité en commentaire", () => {
    const source = `
      // ancien code : const rows = await prisma.reaction.findMany({ where: { conversationId } });
      const rows = await prisma.reaction.findMany({ where: { conversationId }, take: 50 });`;

    expect(scanUnboundedFindMany(source, 'x.ts')).toEqual([]);
  });

  it('distingue deux findMany voisins : un nu, un borné — sans confondre leurs arguments', () => {
    const source = `
      const a = await prisma.participant.findMany({ where: { conversationId } });
      const b = await prisma.message.findMany({ where: { conversationId }, take: 20 });`;

    const sites = scanUnboundedFindMany(source, 'x.ts');
    expect(sites).toHaveLength(1);
    expect(sites[0].line).toBe(2);
  });
});

describe('Le balayage LIT bien le répertoire — sans quoi il passerait au vert à vide', () => {
  it('trouve des fichiers de routes, et les six fichiers que ce lot a bornés existent toujours', () => {
    // Une garde négative meurt en silence quand son terrain disparaît (même
    // leçon que `response-schema-closure-guard.test.ts`) : un répertoire
    // renommé rendrait `[]` des deux côtés et ce témoin serait vert en ne
    // mesurant plus rien.
    expect(walk(ROUTES_DIR).length).toBeGreaterThan(50);

    for (const rel of [
      'conversations/messages-advanced.ts',
      'communities/core.ts',
      'links/utils/prisma-queries.ts',
      'anonymous.ts',
      'admin/agent.ts',
      'admin/users.ts',
    ]) {
      expect(readFileSync(join(ROUTES_DIR, rel), 'utf8').length).toBeGreaterThan(500);
    }
  });
});
