## Leçon 21 — `MessageReadStatusService` : le curseur delivered/read pouvait régresser sous course (TOCTOU read-then-write) (2026-07-04, itération 93)

Audit expert (agent Explore, 56 tool-uses) sur la synchronisation temps réel du gateway : parmi 7
findings, celui retenu (isolé, testable, faible risque — cf. finding #1 sur `AuthHandler`, plus sévère
mais touchant tout le cycle de vie de connexion, différé). `markMessagesAsReceived`/`markMessagesAsRead`
(`MessageReadStatusService.ts`) lisaient le curseur (`findUnique`), décidaient "stale ou non" via
`isStaleCursorMessageId` sur ce snapshot, puis écrivaient sans condition via `upsert` — classique
check-then-act. Deux appels concurrents pour des messages différents (ex. burst `message:new`
déclenchant `_autoDeliverToOnlineRecipients` pour chaque message, ou deux devices qui livrent/lisent en
parallèle) pouvaient tous deux lire le même curseur "pas encore avancé" ; celui dont l'écriture atteint
Mongo EN DERNIER gagne, même si son message est plus ANCIEN — régression silencieuse du curseur
delivered/read, resurrection de messages déjà livrés/lus comme non livrés/non lus.

Fix : `upsert` ne peut pas porter de condition de garde au-delà de la clé unique — impossible de rendre
la décision atomique en gardant `upsert`. Remplacé par un `updateMany` gardé (`WHERE lastDeliveredMessageId
IS NULL OR lastDeliveredMessageId < messageId`, exactement le motif déjà utilisé par
`MessageHandler.handleMessageDelete` pour `lastMessageAt`) — la fraîcheur est évaluée par MongoDB AU
MOMENT de l'écriture, jamais sur un snapshot antérieur. Si `updateMany` ne matche rien : soit aucun
curseur n'existe encore (`create`), soit le curseur existant est déjà à jour (stale, `false`). Le
"existe déjà" est déduit du `findUnique` best-effort déjà fait par l'appelant pour borner la fenêtre de
gel (`prevDeliveredAt`/`prevReadAt`) — zéro requête supplémentaire dans le cas commun. Un `create` qui
échoue en P2002 (row créée entre-temps par un appel concurrent) retente le `updateMany` gardé une fois —
auto-guérison sans jamais faire confiance au hint d'existence pour la décision finale. Un helper privé
partagé `_advanceCursor` (idField/atField/resetUnreadCount paramétrés) sert les deux méthodes
symétriquement — `markMessagesAsReceived` ne remet PAS `unreadCount` à 0 sur l'`update` (contrairement à
`markMessagesAsRead`), seule divergence intentionnelle entre les deux sinon jumelles.

**Piège relevé pendant l'implémentation** : `cursorExists = prevCursor !== null` est FAUX quand le mock
Jest de `findUnique` n'est pas configuré (retourne `undefined`, pas une Promise résolue à `null`) —
`undefined !== null` vaut `true`, donc un curseur inexistant serait à tort traité comme existant. Fix :
`!= null` (égalité faible, capture `undefined` ET `null`). Prouvé nécessaire par un test préexistant qui
ne mockait pas `findUnique` du tout.

**Piège de suppression** : `isStaleCursorMessageId` (+ son test associé) devient mort dans
`MessageReadStatusService.ts` une fois les deux call sites retirés — supprimé. Une COPIE quasi-identique
existe dans `routes/conversations/messages.ts` (endpoint `mark-unread`, commentaire explicite « mirrors
the isStaleCursorMessageId guard ») mais avec une sémantique différente (déplace le curseur EN ARRIÈRE
intentionnellement) — PAS touchée, hors scope, TOCTOU résiduel noté mais non corrigé cette itération
(risque plus faible : action manuelle utilisateur, fenêtre de course étroite).

**Piège de test** : changer `upsert` → `updateMany`/`create` casse ~35 assertions dispersées dans TOUT
`MessageReadStatusService.test.ts` (pas seulement les describe blocks `markMessagesAsReceived`/
`markMessagesAsRead` — aussi Idempotency, Concurrency, Bulk Operations, dedup cache, error paths) PLUS
2 fichiers de tests de routes (`delivery-receipt.test.ts`, `mark-conversation-status.test.ts`) qui
montent le vrai service derrière `app.inject()`. Toujours `grep -rn "conversationReadCursor.upsert"`
au-delà du seul fichier de test unitaire avant de considérer un refactor de ce type terminé. Un test de
non-régression stateful (fake `updateMany`/`create` simulant le WHERE-guard réel de Mongo) prouve le fix
end-to-end : RED confirmé par `git stash` du fichier service seul (row reste `undefined`, l'ancien code
n'appelle jamais le fake), GREEN après restauration.

Suite `MessageReadStatusService.test.ts` : 148/148 (147 existants adaptés + 1 nouveau). Suites
adjacentes vérifiées non régressées : `MessageHandler.core/autoDeliver`, routes messages/conversations,
`delivery-receipt`, `mark-conversation-status` — 786/786 tous confondus. `MessagingService.test.ts`
échoue isolément sur le TS2305 baseline documenté Leçon 20 (confirmé identique via le workaround
`client_default` transitoire, restauré immédiatement) — non lié au diff.
