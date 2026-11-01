/**
 * Garde de source — « qui est lié à qui, à quel niveau » se lit en UN seul site
 * (#13927, cercles de proximité). Modèle : `presence-visibility-viewer-aware-guard.test.ts`.
 *
 * Six copies de « amis acceptés » (feed, temps réel social, duo, retour d'un
 * contact, arrivée d'un contact, découvrabilité) avaient chacune leur requête
 * `friendRequest.find*` sur `status: 'accepted'` : celle qui bougeait ne faisait
 * rougir aucune des cinq autres. Avec des niveaux (Connaissance, Ami, Proche,
 * Sang), la divergence devient une fuite : une copie qui lit encore « accepté »
 * sert Proche à un simple Ami.
 *
 * ## Les trois clauses
 *
 * 1. **Aucune lecture `friendRequest` sur `status: 'accepted'` hors de
 *    `services/friendship.ts`**, sauf la liste NOMINATIVE ci-dessous. C'est un
 *    CLIQUET : la liste ne peut que BAISSER. Un nouveau site rougit (il lit le
 *    niveau par `niveauEffectif` / `niveauxParmi` / `amisAcceptes`), et un site
 *    de la liste qui a convergé rougit aussi — il faut l'en RETIRER, ce qui
 *    verrouille le gain. Y AJOUTER un site est interdit sans issue.
 * 2. **Aucune comparaison de niveaux hors de la loi** (`relation-access.ts`,
 *    `types/relation.ts`), de l'écrivain (`userRelationWriter.ts`) et de
 *    `friendship.ts` : `compareRelationLevel`, `minRelationLevel`,
 *    `maxRelationLevel`, `parseRelationLevel`.
 * 3. **Aucune lecture `userRelation` hors de `friendship.ts` et de
 *    `services/relations/`** (l'écrivain et le rattrapage).
 *
 * Une garde NÉGATIVE meurt en silence si son balayage rend `[]` : les témoins
 * positifs prouvent que le balayage atteint les fichiers visés et que les motifs
 * attrapent ce qu'ils interdisent.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const GATEWAY_SRC = join(__dirname, '../..');
const REPO_ROOT = join(GATEWAY_SRC, '../../..');
const SHARED_ROOT = join(REPO_ROOT, 'packages/shared');
const SCANNED_ROOTS: readonly string[] = [GATEWAY_SRC, join(SHARED_ROOT, 'utils'), join(SHARED_ROOT, 'types')];
const SKIPPED_DIRS = new Set(['__tests__', 'node_modules', 'dist']);

const FRIENDSHIP = 'services/gateway/src/services/friendship.ts';

/**
 * Les sites TOLÉRÉS : ils lisent encore « accepté » faute d'avoir convergé. Chacun
 * appartient à un lot nommé ou à une dette ouverte ; la liste ne fait que baisser.
 */
const TOLERATED: readonly string[] = [
  // la rupture d'une demande acceptée (extraite de friend-requests-core.ts, #13933) : propriétaire de FriendRequest
  'services/gateway/src/routes/directory/friend-request-withdraw.ts',
  // le rattrapage : lit les demandes acceptées pour écrire les lignes UserRelation
  'services/gateway/src/services/relations/userRelationBackfill.ts',
  // lot audiences-publications
  'services/gateway/src/services/posts/postAudience.ts',
  'services/gateway/src/services/posts/viewerAudience.ts',
  // dette de convergence, hors du périmètre du lot rel-loi-acces
  'services/gateway/src/services/posts/StoryTextObjectTranslationService.ts',
  'services/gateway/src/services/game/commentGameFacts.ts',
  'services/gateway/src/services/game/LeagueService.ts',
  'services/gateway/src/services/game/MissionHabits.ts',
  'services/gateway/src/services/onboarding/OnboardingService.ts',
  'services/gateway/src/routes/admin/invitations.ts',
  'services/gateway/src/routes/admin/system-rankings.ts',
  'services/gateway/src/routes/admin/user-member-stats.ts',
];

const LEVEL_LOOP_OWNERS: readonly string[] = [
  FRIENDSHIP,
  'services/gateway/src/services/relations/userRelationWriter.ts',
  'packages/shared/utils/relation-access.ts',
  'packages/shared/types/relation.ts',
];

const FRIEND_REQUEST_READ = /\bfriendRequest\s*\.\s*(?:findMany|findFirst|findUnique|count|aggregate|groupBy)\s*\(/g;
const ACCEPTED_STATUS = /\bstatus\s*:\s*['"]accepted['"]/;
const LEVEL_LOOP = /\b(?:compareRelationLevel|minRelationLevel|maxRelationLevel|parseRelationLevel)\b/;
const USER_RELATION_READ = /\buserRelation\s*\.\s*(?:findMany|findFirst|findUnique|count|aggregate|groupBy)\s*\(/;
const RAW_FRIENDSHIP_BOOLEAN = /\bareConnected\b/;

/** Le texte de l'appel qui commence à `openParen`, jusqu'à la parenthèse qui le ferme. */
function callText(source: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    if (source[i] === ')') depth -= 1;
    if (depth === 0) return source.slice(openParen, i + 1);
  }
  return source.slice(openParen);
}

const readsAcceptedFriendRequests = (source: string): boolean =>
  [...source.matchAll(FRIEND_REQUEST_READ)].some((match) => {
    const open = (match.index ?? 0) + match[0].length - 1;
    return ACCEPTED_STATUS.test(callText(source, open));
  });

function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIPPED_DIRS.has(entry)) return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return entry.endsWith('.ts') && !entry.endsWith('.d.ts') ? [full] : [];
  });
}

const scanned = (): ReadonlyArray<{ readonly path: string; readonly source: string }> =>
  SCANNED_ROOTS.flatMap(sourceFiles).map((file) => ({
    path: relative(REPO_ROOT, file),
    source: readFileSync(file, 'utf8'),
  }));

describe('garde — le niveau effectif se lit en un seul site', () => {
  it('balaie bien les sources qu\'il prétend garder', () => {
    const paths = scanned().map((f) => f.path);

    expect(paths.length).toBeGreaterThan(200);
    expect(paths).toContain(FRIENDSHIP);
    expect(paths).toContain('services/gateway/src/services/PostFeedService.ts');
    expect(paths).toContain('packages/shared/utils/relation-access.ts');
    expect(paths).toContain('packages/shared/types/relation.ts');
  });

  it('reconnaît bien une lecture des demandes acceptées, sur une ou plusieurs lignes, et pas une autre', () => {
    expect(readsAcceptedFriendRequests("await prisma.friendRequest.findMany({ where: { status: 'accepted' } })")).toBe(true);
    expect(
      readsAcceptedFriendRequests(`prisma.friendRequest.findFirst({
        where: { OR: [{ senderId: a }], status: "accepted" },
        select: { id: true },
      })`),
    ).toBe(true);
    expect(readsAcceptedFriendRequests("prisma.friendRequest.count({ where: { status: 'pending' } })")).toBe(false);
    expect(
      readsAcceptedFriendRequests(
        "prisma.friendRequest.findFirst({ where: { id } }); const status = { status: 'accepted' };",
      ),
    ).toBe(false);
  });

  it('aucun site hors friendship.ts ne lit les demandes acceptées, hors la liste nominative qui ne peut que baisser', () => {
    const offenders = scanned()
      .filter(({ path, source }) => path !== FRIENDSHIP && readsAcceptedFriendRequests(source))
      .map(({ path }) => path)
      .sort();

    expect(offenders).toEqual([...TOLERATED].sort());
  });

  it('friendship.ts est bien LE site : il lit les demandes acceptées et les lignes de niveau', () => {
    const friendship = scanned().find(({ path }) => path === FRIENDSHIP);

    expect(friendship).toBeDefined();
    expect(readsAcceptedFriendRequests(friendship?.source ?? '')).toBe(true);
    expect(USER_RELATION_READ.test(friendship?.source ?? '')).toBe(true);
  });

  it('les six copies convergées ne relisent plus les demandes acceptées', () => {
    const converged = [
      'services/gateway/src/services/PostFeedService.ts',
      'services/gateway/src/socketio/handlers/SocialEventsHandler.ts',
      'services/gateway/src/services/game/DuoService.ts',
      'services/gateway/src/services/notifications/contact-recently-active.ts',
      'services/gateway/src/services/notifications/contact-joined.ts',
      'services/gateway/src/services/profile-discoverability.ts',
    ];
    const files = scanned();

    converged.forEach((path) => {
      const file = files.find((f) => f.path === path);
      expect(file).toBeDefined();
      expect(readsAcceptedFriendRequests(file?.source ?? '')).toBe(false);
    });
  });

  it('aucune comparaison de niveaux hors de la loi, de l\'écrivain et de friendship.ts', () => {
    const offenders = scanned()
      .filter(({ path, source }) => !LEVEL_LOOP_OWNERS.includes(path) && LEVEL_LOOP.test(source))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('interdit bien les comparateurs de niveaux, et seulement eux', () => {
    expect(LEVEL_LOOP.test('compareRelationLevel(a, b) >= 0')).toBe(true);
    expect(LEVEL_LOOP.test('const level = minRelationLevel(a, b)')).toBe(true);
    expect(LEVEL_LOOP.test('resolveRelationAccess({ feature })')).toBe(false);
    expect(LEVEL_LOOP.test('niveauEffectif(prisma, a, b)')).toBe(false);
  });

  it('aucune lecture userRelation hors de friendship.ts et de services/relations/', () => {
    const offenders = scanned()
      .filter(
        ({ path, source }) =>
          path !== FRIENDSHIP &&
          !path.startsWith('services/gateway/src/services/relations/') &&
          USER_RELATION_READ.test(source),
      )
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('plus aucun booléen d\'amitié brut (`areConnected`) : le niveau effectif le remplace', () => {
    const offenders = scanned()
      .filter(({ source }) => RAW_FRIENDSHIP_BOOLEAN.test(source))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
    expect(RAW_FRIENDSHIP_BOOLEAN.test('areConnected: friends.has(id)')).toBe(true);
  });
});
