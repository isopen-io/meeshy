/**
 * Dénombrement des surfaces de lecture de messages.
 *
 * La question utile n'est jamais « le masquage personnel est-il appliqué ? » —
 * un exemple y répond toujours oui. C'est : « par combien de requêtes sur
 * combien ? ». Ce garde-fou compte, fichier par fichier, chaque lecture de
 * `Message` sous `src/routes/`, et exige de chacune une CLASSIFICATION :
 * elle applique le masquage, ou elle est déclarée exempte avec sa raison.
 *
 * Ce que le garde attrape :
 *   - une NOUVELLE route qui lit des messages sans se déclarer (fichier absent
 *     de la table) ;
 *   - une nouvelle requête ajoutée dans un fichier déjà classé « applique »
 *     sans l'accompagner de son `applyPersonalHistoryHiding` (les deux
 *     compteurs cessent de correspondre) ;
 *   - la disparition silencieuse d'un appel au masquage dans un fichier qui
 *     l'appliquait.
 *
 * Ce qu'il n'attrape pas, et qu'il ne prétend pas attraper : qu'un
 * `applyPersonalHistoryHiding` soit branché sur la BONNE requête à l'intérieur
 * d'un fichier. Les tests de comportement de `personalHistoryFilter` et de
 * `resolveVisibleLastMessage` couvrent la sémantique ; celui-ci couvre la
 * COUVERTURE.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROUTES_DIR = join(__dirname, '../../../routes');

const MESSAGE_READ = /\bprisma\.message\.(findMany|count)\s*\(/g;
const APPLY_HIDING = /\bapplyPersonalHistoryHiding\s*\(/g;

type Classification =
  | { readonly kind: 'applies'; readonly reads: number; readonly applications: number }
  | { readonly kind: 'exempt'; readonly reads: number; readonly why: string };

/**
 * Chaque fichier de `src/routes/` qui lit `Message` en LISTE (`findMany`) ou en
 * COMPTE (`count`) — les deux formes qu'un utilisateur peut voir, la seconde
 * parce qu'un compteur qui promet une page de plus est un aveu tout aussi
 * parlant que la page elle-même.
 */
const SURFACES: Record<string, Classification> = {
  // ── Applique le masquage personnel ────────────────────────────────────────
  'conversations/messages.ts': { kind: 'applies', reads: 11, applications: 10 },
  'conversations/threads.ts': { kind: 'applies', reads: 1, applications: 2 },

  // ── Exemptes, avec leur raison ────────────────────────────────────────────
  'sync.ts': {
    kind: 'exempt',
    reads: 2,
    why:
      "Le delta `/sync` filtre APRÈS le keyset, en JS, pour ne pas faire reculer " +
      'le curseur `(updatedAt, id)` — cf. `loadPersonalHistoryHidingByConversation` ' +
      'dans `syncMessages`. Le flux `deleted` (tombstones) reste non filtré à ' +
      "dessein : retirer un message déjà masqué est un no-op côté client.",
  },
  'conversations/messages-advanced.ts': {
    kind: 'exempt',
    reads: 1,
    why:
      'Agrégat de statuts de lecture (id/senderId/createdAt/statusEntries) — ne ' +
      "rend aucun contenu de message. Masquer un message de SA propre vue ne le " +
      'retire pas de la comptabilité de lecture des autres participants.',
  },
  'me/export.ts': {
    kind: 'exempt',
    reads: 1,
    why:
      "Export RGPD des messages que l'utilisateur a ÉCRITS. Le masquage est une " +
      "préférence d'affichage, pas un effacement : l'export doit rendre la donnée " +
      'telle que le responsable de traitement la détient.',
  },
  'user-deletions.ts': {
    kind: 'exempt',
    reads: 1,
    why:
      "C'est la route qui ÉCRIT le masquage (`bulk/delete-for-me`) : elle résout " +
      'les ids à masquer. Se filtrer elle-même rendrait un second masquage ' +
      'impossible.',
  },
  'user-stats.ts': {
    kind: 'exempt',
    reads: 3,
    why:
      "Statistiques d'activité sur les messages ENVOYÉS par l'utilisateur. Un " +
      'message retiré de sa vue reste un message qu\'il a envoyé.',
  },
  'links/utils/prisma-queries.ts': {
    kind: 'exempt',
    reads: 3,
    why: 'Analytics de liens de tracking — agrège des URLs, pas des messages lisibles.',
  },
  'admin/agent.ts': { kind: 'exempt', reads: 2, why: 'Surface admin/modération.' },
  'admin/content.ts': { kind: 'exempt', reads: 3, why: 'Surface admin/modération.' },
  'admin/messages.ts': { kind: 'exempt', reads: 11, why: 'Surface admin/modération.' },
  'admin/system-rankings.ts': { kind: 'exempt', reads: 3, why: 'Surface admin/modération.' },
  'admin/users.ts': { kind: 'exempt', reads: 4, why: 'Surface admin/modération.' },
  'admin/analytics.ts': { kind: 'exempt', reads: 4, why: 'Surface admin/modération.' },
  'admin/dashboard.ts': { kind: 'exempt', reads: 3, why: 'Surface admin/modération.' },
  'users/preferences.ts': { kind: 'exempt', reads: 4, why: 'Compteurs de préférences.' },
};

/**
 * Les DEUX aperçus de ligne de liste. Ce ne sont pas des `prisma.message.*` —
 * ce sont des sélections IMBRIQUÉES (`messages: { take: 1 }`) dans une requête
 * `conversation`, donc invisibles au balayage ci-dessus. C'est exactement la
 * forme qui échappe à un dénombrement naïf, d'où leur déclaration séparée.
 */
const NESTED_PREVIEW_SURFACES = ['conversations/core.ts', 'conversations/search.ts'];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.ts') ? [full] : [];
  });

const countMatches = (source: string, pattern: RegExp): number =>
  (source.match(new RegExp(pattern.source, 'g')) ?? []).length;

const scan = () => {
  const files = walk(ROUTES_DIR);
  return files
    .map((full) => ({
      relative: full.slice(ROUTES_DIR.length + 1),
      source: readFileSync(full, 'utf8'),
    }))
    .map((file) => ({
      ...file,
      reads: countMatches(file.source, MESSAGE_READ),
      applications: countMatches(file.source, APPLY_HIDING),
    }))
    .filter((file) => file.reads > 0);
};

describe('personal history hiding — dénombrement des surfaces de lecture', () => {
  it('refuses to pass on an empty scan', () => {
    expect(scan().length).toBeGreaterThan(5);
  });

  it('declares every route file that reads messages — no undeclared surface', () => {
    const undeclared = scan()
      .filter((file) => SURFACES[file.relative] === undefined)
      .map((file) => file.relative);

    expect(undeclared).toEqual([]);
  });

  it('declares no surface that has stopped reading messages', () => {
    const scanned = new Set(scan().map((file) => file.relative));
    const stale = Object.keys(SURFACES).filter((relative) => !scanned.has(relative));

    expect(stale).toEqual([]);
  });

  it('counts exactly the reads each surface declares', () => {
    const drift = scan()
      .filter((file) => SURFACES[file.relative]?.reads !== file.reads)
      .map((file) => `${file.relative}: declared ${SURFACES[file.relative]?.reads}, found ${file.reads}`);

    expect(drift).toEqual([]);
  });

  it('counts exactly the hiding applications each filtered surface declares', () => {
    const drift = scan()
      .filter((file) => SURFACES[file.relative]?.kind === 'applies')
      .filter((file) => {
        const declared = SURFACES[file.relative] as Extract<Classification, { kind: 'applies' }>;
        return declared.applications !== file.applications;
      })
      .map((file) => `${file.relative}: found ${file.applications}`);

    expect(drift).toEqual([]);
  });

  it('leaves no hiding application in a surface declared exempt', () => {
    const contradictions = scan()
      .filter((file) => SURFACES[file.relative]?.kind === 'exempt' && file.applications > 0)
      .map((file) => file.relative);

    expect(contradictions).toEqual([]);
  });

  it('gives every exemption a stated reason', () => {
    const unexplained = Object.entries(SURFACES)
      .filter(([, classification]) => classification.kind === 'exempt')
      .filter(([, classification]) => (classification as { why: string }).why.trim().length < 20)
      .map(([relative]) => relative);

    expect(unexplained).toEqual([]);
  });

  it('resolves the nested list previews, which no prisma.message scan can see', () => {
    const unresolved = NESTED_PREVIEW_SURFACES.filter((relative) => {
      const source = readFileSync(join(ROUTES_DIR, relative), 'utf8');
      const hasNestedPreview = /messages:\s*\{[\s\S]{0,400}?take:\s*1/.test(source);
      const resolves = source.includes('resolveVisibleLastMessages(');
      return hasNestedPreview && !resolves;
    });

    expect(unresolved).toEqual([]);
  });
});
