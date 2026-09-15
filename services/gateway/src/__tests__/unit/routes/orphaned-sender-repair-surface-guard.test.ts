/**
 * #6516 — dénombrement des surfaces qui lisent `Message.sender`.
 *
 * `Message.sender` est une relation REQUISE : une lecture qui la charge et
 * rencontre UN SEUL message dont le `Participant` expéditeur a disparu ne
 * filtre pas la ligne, elle fait rejeter TOUTE la lecture par Prisma
 * (#6501). `withOrphanedSenderRepair` / `discoverConversationIdsByMessageIds`
 * (`services/messaging/withOrphanedSenderRepair.ts`) réparent la portée
 * touchée et rejouent une fois — mais seulement là où ils sont BRANCHÉS.
 * `messages-list.ts` (la page principale) et `ConversationBridgeService.ts`
 * (le pont ✦) l'étaient déjà (#6501) ; #6516 en dénombre chaque AUTRE
 * lecteur, sur le même patron que `personal-history-hiding-surface-guard.test.ts` :
 * la question n'est jamais « ce lecteur est-il réparé ? » — un exemple y
 * répond toujours oui — c'est « par combien de lecteurs sur combien ? ».
 *
 * Ce que le garde attrape :
 *   - un NOUVEAU fichier qui lit `Message` par `findMany`/`findFirst`/
 *     `findUnique` sans se déclarer (absent de la table) ;
 *   - une nouvelle lecture ajoutée à un fichier déjà classé sans le nombre
 *     de lectures qui bouge (les deux compteurs cessent de correspondre) ;
 *   - la disparition silencieuse d'un `withOrphanedSenderRepair(` dans un
 *     fichier qui le portait.
 *
 * Ce qu'il n'attrape pas, et qu'il ne prétend pas attraper : qu'une
 * réparation soit branchée sur la BONNE lecture à l'intérieur d'un fichier,
 * ou que sa PORTÉE (liste statique vs résolveur) soit correcte — les témoins
 * de `withOrphanedSenderRepair.test.ts` et des suites de route/socket
 * couvrent ce comportement ; celui-ci couvre la COUVERTURE.
 *
 * Un fichier peut porter des lectures qui ne sélectionnent JAMAIS `sender`
 * à côté de lectures qui la sélectionnent : `reads` compte TOUTES les
 * lectures de `Message` du fichier (comme le garde frère), `applications`
 * compte les occurrences textuelles de `withOrphanedSenderRepair(` — un seul
 * appel peut envelopper plusieurs lectures partageant une même portée
 * (`Promise.all`), d'où `applications` parfois inférieur au nombre de
 * lectures qui en avaient réellement besoin. Chaque entrée `applies` dit,
 * dans son commentaire, ce que les lectures NON enveloppées ne sélectionnent
 * pas.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROUTES_DIR = join(__dirname, '../../../routes');
const SOCKETIO_DIR = join(__dirname, '../../../socketio');
const SERVICES_DIR = join(__dirname, '../../../services');

const MESSAGE_READ = /\.message\.(findMany|findFirst|findUnique)\s*\(/g;
const APPLY_REPAIR = /\bwithOrphanedSenderRepair\s*\(/g;

type Classification =
  | { readonly kind: 'applies'; readonly reads: number; readonly applications: number }
  | { readonly kind: 'exempt'; readonly reads: number; readonly why: string };

const DOES_NOT_SELECT_SENDER =
  "Aucune de ces lectures ne sélectionne la relation `sender` (`select`/`include` vérifiés champ par " +
  "champ, constantes nommées résolues jusqu'à leur définition) : un expéditeur disparu n'entre pas dans " +
  'leur trajectoire d\'erreur — il n\'y a rien à réparer pour elles.';

/**
 * `routes/` — un fichier par entrée. Le chemin est relatif à `ROUTES_DIR`.
 */
const ROUTE_SURFACES: Record<string, Classification> = {
  // ── Répare (au moins une lecture de ce fichier sélectionne `sender`) ──────
  'admin/agent-configs.ts': { kind: 'applies', reads: 1, applications: 1 },
  // La 2e lecture (`trouves`, filtre de recherche) ne charge que les colonnes
  // de protection — jamais `sender` ; la 3e (`translationsWhere`) est la
  // jumelle de la 1re sur `GET /admin/translations`, même portée découverte.
  'admin/content.ts': { kind: 'applies', reads: 5, applications: 2 },
  'admin/conversation-messages-sovereign.ts': { kind: 'applies', reads: 1, applications: 1 },
  // `rankMessages` (la seule des trois à charger `sender`) est enveloppée ;
  // les deux lectures de `rankConversations` ne chargent qu'identifiant/titre.
  'admin/system-rankings.ts': { kind: 'applies', reads: 3, applications: 1 },
  'conversations/messages-advanced-delete.ts': { kind: 'applies', reads: 1, applications: 1 },
  'conversations/messages-advanced-edit.ts': { kind: 'applies', reads: 2, applications: 2 },
  // Seule lecture du fichier : les messages SOURCE d'un transfert, dont les
  // ids peuvent appartenir à PLUSIEURS conversations dans une même page — la
  // portée se DÉCOUVRE (`discoverConversationIdsByMessageIds`), jamais connue
  // d'avance.
  'conversations/messages-list-query.ts': { kind: 'applies', reads: 1, applications: 1 },
  // Les 4 lectures cursor/`around` (probes `{ select: { createdAt: true } }`
  // ou `{ select: { id: true } }`) ne chargent jamais `sender` ; seule la
  // page principale (déjà réparée depuis #6501) la charge.
  'conversations/messages-list.ts': { kind: 'applies', reads: 5, applications: 1 },
  // Les 2 lectures d'existence (`pinnedAt`/dé-épinglage) ne chargent que des
  // identifiants ; seule la page des épingles charge `sender`.
  'conversations/messages-pin.ts': { kind: 'applies', reads: 3, applications: 1 },
  // Les deux `findMany` de contenu/traductions partagent la MÊME portée
  // (`conversationId` de la route) et un seul `withOrphanedSenderRepair`
  // les enveloppe tous les deux via `Promise.all`. La 3e lecture (`before`,
  // curseur) ne charge que `createdAt`.
  'conversations/messages-search.ts': { kind: 'applies', reads: 3, applications: 1 },
  'conversations/threads.ts': { kind: 'applies', reads: 2, applications: 2 },
  'links/utils/prisma-queries.ts': { kind: 'applies', reads: 2, applications: 2 },
  // Les 2 autres lectures (`/translations`, `/status-details`) vérifient
  // l'existence du message sans jamais charger `sender`.
  'messages-reads.ts': { kind: 'applies', reads: 3, applications: 1 },
  'messages-writes.ts': { kind: 'applies', reads: 2, applications: 2 },
  // `changedRows` (portée = l'appartenance déjà résolue) charge `sender` par
  // défaut ; `deletedRows` (tombstones) ne charge que
  // `{id, conversationId, deletedAt}`.
  'sync/messages.ts': { kind: 'applies', reads: 2, applications: 1 },

  // ── Exemptes, avec leur raison ────────────────────────────────────────────
  'admin/user-reports.ts': { kind: 'exempt', reads: 2, why: DOES_NOT_SELECT_SENDER },
  'attachments/metadata.ts': { kind: 'exempt', reads: 2, why: DOES_NOT_SELECT_SENDER },
  'conversations/messages-advanced-reads.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
  'conversations/messages-list-views.ts': { kind: 'exempt', reads: 2, why: DOES_NOT_SELECT_SENDER },
  'conversations/messages-read-status.ts': { kind: 'exempt', reads: 2, why: DOES_NOT_SELECT_SENDER },
  'conversations/messages-view-once.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
  'conversations/receipts.ts': { kind: 'exempt', reads: 5, why: DOES_NOT_SELECT_SENDER },
  'me/export.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
  'mentions.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
  'reactions.ts': { kind: 'exempt', reads: 5, why: DOES_NOT_SELECT_SENDER },
  'reports/target.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
  'translation-non-blocking.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
  'translation.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
  'user-deletions.ts': { kind: 'exempt', reads: 2, why: DOES_NOT_SELECT_SENDER },
};

/** `socketio/` — même règle, racine différente. */
const SOCKETIO_SURFACES: Record<string, Classification> = {
  // Les deux `findFirst` d'édition/suppression (admission) chargent `sender`
  // et sont réparés. Les deux restants ne le sont pas, pour deux raisons
  // DISTINCTES :
  //  - le lookup du message TRANSFÉRÉ (forward, best-effort) est déjà
  //    enveloppé dans un `.catch(() => [null, null])` : une erreur — celle-ci
  //    y compris — omet simplement l'aperçu de transfert, jamais la
  //    diffusion du message lui-même. L'envelopper de plus réparerait la
  //    conversation source, mais rien ne le SERT ici : le bénéfice
  //    reviendrait à un AUTRE lecteur (#6516 le couvre déjà sur ses propres
  //    surfaces).
  //  - le dernier `findUnique` ne sélectionne pas `sender`.
  'handlers/MessageHandler.ts': { kind: 'applies', reads: 4, applications: 2 },
  'emitConversationPreviewUpdate.ts': { kind: 'applies', reads: 1, applications: 1 },

  'handlers/ReactionHandler.ts': { kind: 'exempt', reads: 3, why: DOES_NOT_SELECT_SENDER },
  'MeeshySocketIOManager.ts': { kind: 'exempt', reads: 7, why: DOES_NOT_SELECT_SENDER },
  'utils/participant-resolver.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
  'utils/personalPreviewOverride.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
};

/** `services/` — même règle, troisième racine. */
const SERVICE_SURFACES: Record<string, Classification> = {
  'ConversationBridgeService.ts': { kind: 'applies', reads: 2, applications: 2 },
  'ConversationMessageStatsService.ts': { kind: 'applies', reads: 1, applications: 1 },
  'messaging/copyAttachments.ts': { kind: 'applies', reads: 1, applications: 1 },
  'messaging/MessageProcessor.ts': { kind: 'applies', reads: 1, applications: 1 },
  'messaging/MessagingService.ts': { kind: 'applies', reads: 1, applications: 1 },

  'AttachmentReactionService.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
  'attachments/attachmentReadVerdict.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
  // Deux `create`/`update` (jamais `find*`) pour le message-résumé d'appel :
  // hors du périmètre `.message.find*` de ce garde, mais nommé ici pour la
  // même raison que #6501 l'a nommé dans l'issue — `sender` y est
  // TOUJOURS l'initiateur fraîchement résolu de l'appel en cours, jamais une
  // ligne relue depuis le passé, donc jamais orpheline en pratique.
  // (Aucune entrée n'est nécessaire pour un fichier sans `find*` — nommé ici
  // par exhaustivité avec #6516, qui l'énumérait explicitement.)
  'message-translation/EncryptionHelper.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
  'message-translation/MessageTranslationService.ts': { kind: 'exempt', reads: 8, why: DOES_NOT_SELECT_SENDER },
  'MessageReadStatusService.ts': { kind: 'exempt', reads: 12, why: DOES_NOT_SELECT_SENDER },
  'messaging/anonymizeDeletedAccountMessages.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
  'messaging/conversationWriteAdmission.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
  'messaging/forwardAdmission.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
  'messaging/messageMentions.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
  'messaging/messageNotificationFanOut.ts': { kind: 'exempt', reads: 2, why: DOES_NOT_SELECT_SENDER },
  'messaging/messageRemovalEffects.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
  'messaging/reproduceEditedMessageNotifications.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
  'notifications/NotificationService.ts': { kind: 'exempt', reads: 3, why: DOES_NOT_SELECT_SENDER },
  'notifications/reactionNotify.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },
  'ReactionService.ts': { kind: 'exempt', reads: 2, why: DOES_NOT_SELECT_SENDER },
  'resolveVisibleLastMessage.ts': { kind: 'exempt', reads: 1, why: DOES_NOT_SELECT_SENDER },

  // #6501 — balayage de rétention SANS lecteur, portée GLOBALE par
  // construction (`expiresAt` à travers toute la base, jamais une seule
  // conversation) : il n'y a pas de `conversationIds` bornable à donner à la
  // réparation sans une lecture aussi large que celle qu'on protégerait. Un
  // orphelin qui bloque cette passe reste couvert par le balayage nocturne de
  // maintenance (`MaintenanceService.cleanupExpiredData`), qui répare AVANT
  // de nettoyer.
  'ExpiredMessagesCleanupService.ts': {
    kind: 'exempt',
    reads: 1,
    why:
      "Balayage de rétention côté serveur, sans lecteur et de portée GLOBALE (toute la base, " +
      "filtrée par `expiresAt` — jamais une conversation) : aucune liste de `conversationIds` " +
      "bornable ne peut être donnée à la réparation sans lire aussi large que la passe " +
      'elle-même. Le balayage nocturne de maintenance répare les orphelins AVANT ce nettoyage.',
  },
  'CallService.ts': {
    kind: 'exempt',
    reads: 1,
    why:
      "`prisma.message.findFirst` — l'unique lecture, hors périmètre `find*` sur `sender` : elle " +
      "charge `metadata`/`content` du message-résumé d'appel, jamais `sender`. Le message lui-même " +
      "n'est écrit QUE par `create`/`update` (`CALL_SUMMARY_MESSAGE_INCLUDE`), où `senderId` est " +
      "toujours l'initiateur de l'appel EN COURS — une ligne fraîchement résolue, jamais relue " +
      'depuis le passé, donc jamais orpheline en pratique.',
  },

  // Le résolveur PARTAGÉ lui-même (#6516) : sa seule lecture est la
  // découverte de portée — `{ select: { conversationId: true } }`, jamais
  // `sender`. C'est la garantie qu'il offre à ses appelants, pas un lecteur
  // de plus à couvrir.
  'messaging/withOrphanedSenderRepair.ts': {
    kind: 'exempt',
    reads: 1,
    why:
      'Le résolveur de portée `discoverConversationIdsByMessageIds` lit `{ select: ' +
      '{ conversationId: true } }` — jamais `sender`, par construction : le redemander ' +
      "reproduirait l'erreur qu'il diagnostique.",
  },
};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' ? [] : walk(full);
    }
    return full.endsWith('.ts') ? [full] : [];
  });

const countMatches = (source: string, pattern: RegExp): number =>
  (source.match(new RegExp(pattern.source, 'g')) ?? []).length;

const scan = (root: string) =>
  walk(root)
    .map((full) => ({
      relative: full.slice(root.length + 1),
      source: readFileSync(full, 'utf8'),
    }))
    .map((file) => ({
      ...file,
      reads: countMatches(file.source, MESSAGE_READ),
      applications: countMatches(file.source, APPLY_REPAIR),
    }))
    .filter((file) => file.reads > 0);

describe('orphaned sender repair — dénombrement des surfaces de lecture (#6516)', () => {
  const roots: ReadonlyArray<{ readonly name: string; readonly dir: string; readonly surfaces: Record<string, Classification> }> = [
    { name: 'routes', dir: ROUTES_DIR, surfaces: ROUTE_SURFACES },
    { name: 'socketio', dir: SOCKETIO_DIR, surfaces: SOCKETIO_SURFACES },
    { name: 'services', dir: SERVICES_DIR, surfaces: SERVICE_SURFACES },
  ];

  it('refuse de passer sur un balayage vide', () => {
    expect(scan(ROUTES_DIR).length).toBeGreaterThan(5);
    expect(scan(SERVICES_DIR).length).toBeGreaterThan(5);
  });

  for (const { name, dir, surfaces } of roots) {
    describe(`racine « ${name} »`, () => {
      it('déclare chaque fichier qui lit Message — aucune surface non déclarée', () => {
        const undeclared = scan(dir)
          .filter((file) => surfaces[file.relative] === undefined)
          .map((file) => file.relative);

        expect(undeclared).toEqual([]);
      });

      it("ne déclare aucune surface qui a cessé de lire Message", () => {
        const scanned = new Set(scan(dir).map((file) => file.relative));
        const stale = Object.keys(surfaces).filter((relative) => !scanned.has(relative));

        expect(stale).toEqual([]);
      });

      it('compte exactement les lectures que chaque surface déclare', () => {
        const drift = scan(dir)
          .filter((file) => surfaces[file.relative]?.reads !== file.reads)
          .map((file) => `${file.relative}: déclaré ${surfaces[file.relative]?.reads}, trouvé ${file.reads}`);

        expect(drift).toEqual([]);
      });

      it('compte exactement les réparations que chaque surface « applies » déclare', () => {
        const drift = scan(dir)
          .filter((file) => surfaces[file.relative]?.kind === 'applies')
          .filter((file) => {
            const declared = surfaces[file.relative] as Extract<Classification, { kind: 'applies' }>;
            return declared.applications !== file.applications;
          })
          .map((file) => `${file.relative}: trouvé ${file.applications}`);

        expect(drift).toEqual([]);
      });

      it("n'attend aucune réparation d'une surface déclarée exempte", () => {
        const contradictions = scan(dir)
          .filter((file) => surfaces[file.relative]?.kind === 'exempt' && file.applications > 0)
          .map((file) => file.relative);

        expect(contradictions).toEqual([]);
      });

      it('donne à chaque exemption une raison énoncée', () => {
        const unexplained = Object.entries(surfaces)
          .filter(([, classification]) => classification.kind === 'exempt')
          .filter(([, classification]) => (classification as { why: string }).why.trim().length < 20)
          .map(([relative]) => relative);

        expect(unexplained).toEqual([]);
      });

      it("attend au moins une réparation d'une surface déclarée « applies »", () => {
        const empty = Object.entries(surfaces)
          .filter(([, classification]) => classification.kind === 'applies')
          .filter(([, classification]) => (classification as { applications: number }).applications < 1)
          .map(([relative]) => relative);

        expect(empty).toEqual([]);
      });
    });
  }
});
