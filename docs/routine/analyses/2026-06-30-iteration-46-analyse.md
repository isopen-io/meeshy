# Iteration 46 — Analyse d'optimisation (2026-06-30)

## Contexte
Suite iter 45 (lot F23 « comptes de non-lus : N requêtes → 1 requête + dichotomie », mergé dans
`main` : PR #1134 / squash `b3867b39`). Le plan iter 45 désigne **F23b** comme prochain item :
« discordance latente — la version batchée exclut `senderId` (expéditeur du message) là où
`getUnreadCount` exclut `participant.id` ; audit sémantique dédié ». Cette itération réalise cet
audit, le **confirme comme bug visible**, et le corrige.

Surfaces testables sur ce runner : **gateway jest** — `MessageReadStatusService.test.ts`
(suite `getUnreadCountsForParticipants`). Les appelants (`MessageHandler`, `MeeshySocketIOManager`)
mockent la méthode → non impactés fonctionnellement (tests verts conservés).

## Audit F23b — constat confirmé (bug visible)

### Trois fonctions de comptage, deux sémantiques divergentes
| Fonction | Prédicat expéditeur | Sémantique |
|----------|---------------------|------------|
| `getUnreadCount` (l.166) | `senderId: { not: participant.id }` | exclut **les messages du participant lui-même** ✅ |
| `getUnreadCountsForUser` (l.269) | `senderId: { not: p.id }` | exclut **les messages du participant lui-même** ✅ |
| `getUnreadCountsForParticipants` (l.207) | `senderId: { not: senderId }` (expéditeur du message) | exclut **les messages de l'expéditeur du nouveau message** ❌ |

Deux des trois sources excluent « le participant lui-même » (sémantique canonique du non-lu :
« messages que je n'ai pas envoyés et pas encore lus »). La variante batchée — utilisée sur le
**chemin de diffusion temps-réel** (`message:new` → `_updateUnreadCounts` /
`MeeshySocketIOManager`) — exclut au contraire **l'expéditeur du message**. C'est une violation
de Single Source of Truth (CLAUDE.md « Each data type has ONE source ») et un bug visible.

### Démonstration (conversation 1:1)
Bob a lu jusqu'à `T0`. Alice envoie `M1` à `T1 > T0`. `_updateUnreadCounts(message=M1, sender=Alice)`
filtre l'expéditeur → `participants = [Bob]`, appelle `getUnreadCountsForParticipants([Bob], conv, Alice)`.
- **Actuel** : compte pour Bob = messages `> T0` **dont `senderId ≠ Alice`** = **0** (M1 vient
  d'Alice, exclu) → l'event `CONVERSATION_UNREAD_UPDATED` pousse **0** au moment précis où Bob
  reçoit un nouveau message. En 1:1 **tous** les non-lus de Bob viennent d'Alice → le badge
  temps-réel pousse toujours 0.
- **Correct** (`senderId ≠ Bob`) : = messages `> T0` non envoyés par Bob = `M1` = **1**.

Le badge n'est pas durablement faux uniquement parce que le client re-synchronise via
`getUnreadCountsForUser` (liste de conversations, sémantique correcte) — mais l'event temps-réel
**diverge** de cette source autoritative (incohérence + flicker du badge).

### Pourquoi `senderId` est précisément le bug
Les deux appelants (`MessageHandler.ts:1322`, `MeeshySocketIOManager.ts:1802`) filtrent déjà
l'expéditeur hors de `participants` (`.filter(p => p.id !== senderId)`) AVANT l'appel. Le 3ᵉ
argument `senderId` ne sert donc qu'à ce prédicat erroné — il devient **mort** une fois la
sémantique corrigée.

## Décision iter 46 — lot « Unification de la sémantique du comptage non-lus (F23b) »

| Lot | Quoi | Impact |
|-----|------|--------|
| A | `getUnreadCountsForParticipants` : aligner sur `getUnreadCount`/`getUnreadCountsForUser` — exclure **les messages de chaque participant lui-même** (`senderId ≠ p.id`), pas l'expéditeur. Suppression du paramètre `senderId` devenu mort. | Correction bug visible + SSOT |
| B | Préserver l'optimisation iter 45 (1 requête) : `findMany` SANS filtre expéditeur (`select { createdAt, senderId }`), bucketing par expéditeur ; `unread(p) = countAbove(tous, F) − countAbove(messages_de_p, F)`. | Reste **2** requêtes DB sur le chemin chaud |
| C | Mettre à jour les 2 appelants (drop 3ᵉ arg) + réécrire la suite de tests pour la sémantique correcte. | Cohérence |

### Préservation de l'optimisation
Toujours **1 `cursor.findMany` + 1 `message.findMany`** (index `[conversationId, deletedAt, createdAt]`,
borné par le plus ancien plancher). Le filtre résiduel `senderId ≠ X` disparaît du `WHERE` (le
candidat inclut désormais tous les expéditeurs) ; l'exclusion « messages de p » se fait en mémoire
par soustraction du bucket de p (dichotomie `upper-bound`). Coût mémoire O(M), 1 requête.

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP multilingue) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F18d | Unifier la queue de présentation (weekday/heure/date absolue) | FAIBLE | Queues hétérogènes ; gain marginal |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | États distincts ; backfill |
| F23c | Le **cache dénormalisé** `cursor.unreadCount` reste maintenu (`updateUnreadCount`) mais ignoré en lecture (cf. commentaire l.86-94). Candidat à suppression pure (champ mort en lecture). | FAIBLE | Audit d'écritures dédiées |

## Gain estimé global
Le badge non-lu temps-réel (`CONVERSATION_UNREAD_UPDATED`) compte désormais **comme** la source
autoritative `getUnreadCountsForUser` (fin de l'incohérence/flicker, plus de poussée à 0 sur
nouveau message en 1:1). Optimisation iter 45 (1 requête) préservée. Couvert par gateway jest
(suite `getUnreadCountsForParticipants` réécrite pour la sémantique correcte + cas limites).
</content>
