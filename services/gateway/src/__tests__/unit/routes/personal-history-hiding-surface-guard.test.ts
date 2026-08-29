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
 * ET SURTOUT — la limite du périmètre, déclarée plutôt que subie : le balayage
 * porte sur `src/routes/`. La COUCHE SERVICE lit elle aussi des messages, et
 * `SERVICE_LAYER_UNCOVERED` ci-dessous la dénombre pour que « non couvert »
 * reste un fait écrit, jamais un angle mort. Un dénombrement qui tairait sa
 * propre frontière serait la version « garde locale sur défaut global » que
 * cette famille de gardes existe pour éviter.
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
  // `sync.ts` → `sync/messages.ts` (#4171, intégré pendant ce lot : le
  // fichier unique est devenu un répertoire). Même lecture, même raison,
  // seul le CHEMIN a changé — vérifié : `sync/messages.ts` porte encore
  // exactement les deux `prisma.message.findMany` et le même appel à
  // `loadPersonalHistoryHidingByConversation` que l'ancien `sync.ts`.
  'sync/messages.ts': {
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
  // 4 → 3 (#4161) : `GET /users/:userId/stats` recopiait `computeUserStats`
  // agrégation par agrégation, l'une d'elles lisant `Message`. Il DÉLÈGUE
  // désormais, et la lecture a suivi le calcul dans `user-stats.ts`, surface
  // déjà déclarée. Aucune lecture n'a disparu : elle a changé de fichier.
  'users/preferences.ts': { kind: 'exempt', reads: 3, why: 'Compteurs de préférences.' },
};

/**
 * Les DEUX aperçus de ligne de liste. Ce ne sont pas des `prisma.message.*` —
 * ce sont des sélections IMBRIQUÉES (`messages: { take: 1 }`) dans une requête
 * `conversation`, donc invisibles au balayage ci-dessus. C'est exactement la
 * forme qui échappe à un dénombrement naïf, d'où leur déclaration séparée.
 */
const NESTED_PREVIEW_SURFACES = ['conversations/core.ts', 'conversations/search.ts'];

const SOCKETIO_DIR = join(__dirname, '../../../socketio');

/**
 * La troisième frontière, et la seule que les deux balayages ci-dessus ne
 * pouvaient PAS voir : l'aperçu POUSSÉ.
 *
 * Les deux autres comptent des LECTURES — « ce que l'API rend quand on la
 * questionne ». Un émetteur temps réel ne répond à aucune question : il
 * recalcule le dernier message et le pousse dans la room personnelle de chaque
 * participant. Il n'est ni sous `src/routes/`, ni sous `src/services/`, si bien
 * que `GET /conversations` a longtemps résolu le masquage personnel pendant que
 * le fan-out remettait dans la ligne de liste le message que le lecteur venait
 * d'en retirer. Les deux moitiés du produit se contredisaient selon le canal.
 *
 * Le critère est la forme du défaut, pas le nom du fichier : recalculer un
 * dernier message (`findFirst` + `orderBy createdAt desc`) ET diffuser
 * `conversation:updated`. Une recherche par id (le fichier en contient) n'est
 * pas un recalcul d'aperçu et ne déclenche rien.
 */
const PUSHED_PREVIEW_MARKER = /resolvePersonalPreviewOverrides\s*(<[^>]*>)?\s*\(/;

const SERVICES_DIR = join(__dirname, '../../../services');

/**
 * La couche service, désormais CLASSÉE et non plus seulement dénombrée.
 *
 * Le cycle 108 avait figé ici un inventaire « non couvert », dont le cas
 * nommé était `MessageReadStatusService` : il comptait les non-lus avec pour
 * seul plancher le curseur de lecture, si bien qu'un utilisateur effaçant un
 * historique contenant des messages NON LUS gardait un badge comptant des
 * messages que la liste ne lui montre plus — un compteur que défiler ne peut
 * pas éteindre, puisqu'il n'y a plus rien à défiler. Le cycle 109 l'a corrigé,
 * et la déclaration passe de « combien de lectures » à la même classification
 * que les routes : applique, ou exempt avec sa raison.
 */
const SERVICE_LAYER_SURFACES: Record<string, Classification> = {
  'MessageReadStatusService.ts': { kind: 'applies', reads: 7, applications: 2 },

  /**
   * G-122 — le pont ✦ de la ligne de liste. Il NOMME les auteurs des messages
   * non lus : exactement l'ensemble que le badge compte, donc exactement le
   * même masquage. Sans l'application, un auteur dont le lecteur a effacé
   * l'historique reviendrait le nommer dans la phrase du rang : la fuite que le
   * compteur, lui, ne fait plus depuis le cycle 109.
   *
   * `reads: 2` — une fenêtre agrégée par CHEMIN, jamais une lecture par
   * conversation ni par lecteur, ce qui reste l'invariant que ce compte garde :
   *   1. le chemin par lecteur (`applyPersonalHistoryHiding`, compté ci-dessous)
   *   2. le chemin BATCHÉ des viewers (REV-5/B2), qui lit UNE fenêtre commune
   *      pour N lecteurs puis la resserre par lecteur EN MÉMOIRE
   *
   * Le second n'appelle donc pas `applyPersonalHistoryHiding` — il n'aurait rien
   * à y faire, le masquage étant personnel et la requête commune — d'où
   * `applications: 1` et une déclaration dans `IN_MEMORY_HIDING_SURFACES`, seule
   * forme que le balayage puisse prouver sur ce chemin.
   */
  // Faute de cette déclaration, ce fichier passerait pour un lecteur à moitié
  // masqué : deux lectures, une seule application TEXTUELLE.
  'ConversationBridgeService.ts': { kind: 'applies', reads: 2, applications: 1 },

  'ConversationMessageStatsService.ts': {
    kind: 'exempt',
    reads: 1,
    why:
      "Statistiques agrégées d'une conversation (volumes, langues, types) " +
      'partagées par TOUS ses participants. Un masquage est personnel : ' +
      "l'appliquer rendrait une statistique différente par lecteur, pour une " +
      'valeur qui est stockée une fois et lue par tout le monde.',
  },
  'ExpiredMessagesCleanupService.ts': {
    kind: 'exempt',
    reads: 1,
    why:
      "Balayage de rétention côté serveur : il détruit les messages arrivés à " +
      "expiration, sans lecteur. Masquer une ligne à la destruction la ferait " +
      'survivre indéfiniment à la préférence d\'affichage d\'un seul utilisateur.',
  },
};

/**
 * Le troisième compteur de non-lus applique le masquage EN MÉMOIRE, pas par un
 * `where` Prisma : la poussée temps réel (`conversation:unread-updated`) fait
 * une requête pour tous les participants à la fois et découpe le résultat par
 * lecteur. Un `applyPersonalHistoryHiding` n'y a donc rien à faire, et le
 * balayage ci-dessus ne peut pas le voir — exactement la forme qui échappe à un
 * dénombrement naïf, d'où sa déclaration séparée (même raison que les aperçus
 * imbriqués plus bas).
 */
const IN_MEMORY_HIDING_SURFACES: Record<string, readonly string[]> = {
  'MessageReadStatusService.ts': ['loadPersonalHistoryHidingByUser(', 'exclusiveFloorMsFor('],

  /**
   * La passe par LECTEURS de `buildBridgeDataForViewers` (REV-5/B2) a la MÊME
   * forme : une fenêtre commune à tous les destinataires, donc un masquage qui
   * ne peut pas entrer dans la clause SQL. Il est appliqué en mémoire, lecteur
   * par lecteur. Ses deux coupes personnelles sont exigées SÉPARÉMENT parce
   * qu'elles se perdent séparément — `exclusiveFloorMsFor` fond la coupure
   * d'historique dans le plancher de lecture, `hiddenMessageIds?.has` écarte les
   * messages effacés un par un. Retirer l'un de ces trois marqueurs, c'est faire
   * fuiter dans le pont ✦ d'un lecteur des messages qu'il a effacés pour lui.
   *
   * `hiddenMessageIds?.has(` et non `hiddenMessageIds` : le nom seul est
   * satisfait par la CONSTRUCTION de l'ensemble, vingt lignes plus haut, et
   * survit donc à la suppression de son USAGE — vérifié, le marqueur large reste
   * vert quand on retire le filtre (cycle 62 bis). Un marqueur doit tomber avec
   * ce qu'il garde.
   */
  'ConversationBridgeService.ts': [
    'loadPersonalHistoryHidingByUser(',
    'exclusiveFloorMsFor(',
    'hiddenMessageIds?.has(',
  ],
};

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

  const scanServices = () =>
    walk(SERVICES_DIR)
      .map((full) => {
        const source = readFileSync(full, 'utf8');
        return {
          relative: full.slice(SERVICES_DIR.length + 1),
          source,
          reads: countMatches(source, MESSAGE_READ),
          applications: countMatches(source, APPLY_HIDING),
        };
      })
      .filter((file) => file.reads > 0)
      .sort((a, b) => a.relative.localeCompare(b.relative));

  it('classe chaque lecteur de messages de la couche service — aucun ne reste tacite', () => {
    const scanned = scanServices();

    expect(scanned.length).toBeGreaterThan(0);
    expect(scanned.map((f) => f.relative)).toEqual(Object.keys(SERVICE_LAYER_SURFACES).sort());
  });

  it('compte exactement les lectures et les applications que la couche service déclare', () => {
    const drift = scanServices()
      .filter((file) => {
        const declared = SERVICE_LAYER_SURFACES[file.relative];
        if (declared === undefined) return true;
        if (declared.reads !== file.reads) return true;
        return declared.kind === 'applies'
          ? declared.applications !== file.applications
          : file.applications > 0;
      })
      .map((file) => `${file.relative}: ${file.reads} lectures, ${file.applications} applications`);

    expect(drift).toEqual([]);
  });

  it('tient les applications EN MÉMOIRE, que le balayage ne peut pas voir', () => {
    const missing = Object.entries(IN_MEMORY_HIDING_SURFACES).flatMap(([relative, markers]) => {
      const source = readFileSync(join(SERVICES_DIR, relative), 'utf8');
      return markers.filter((marker) => !source.includes(marker)).map((marker) => `${relative}: ${marker}`);
    });

    expect(missing).toEqual([]);
  });

  it('résout le masquage sur les aperçus POUSSÉS, hors de portée des deux balayages', () => {
    const scan = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          return entry === '__tests__' ? [] : scan(full);
        }
        if (!entry.endsWith('.ts')) return [];
        const source = readFileSync(full, 'utf8');
        const recomputesPreview =
          /message\.findFirst\s*\(/.test(source) && /orderBy:\s*\{\s*createdAt:\s*'desc'\s*\}/.test(source);
        const pushesConversationUpdated = source.includes('CONVERSATION_UPDATED');
        if (!recomputesPreview || !pushesConversationUpdated) return [];
        return PUSHED_PREVIEW_MARKER.test(source) ? [] : [full.slice(SOCKETIO_DIR.length + 1)];
      });

    expect(scan(SOCKETIO_DIR)).toEqual([]);
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
