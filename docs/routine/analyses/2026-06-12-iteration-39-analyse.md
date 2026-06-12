# Iteration 39 — Analyse d'optimisation (2026-06-12)

## Contexte
Suite iter 38 (push admin temps réel `agent:admin-event`, mergé via PR #598). Le plan
iter 38 désigne pour iter 39 : F16 (publish config depuis agent-topics), F2 (bloqué —
validation staging), F10/F14/F15 (opportunistes). Conformément à la routine, audit des
features les plus récentes mergées dans main : #598 (push admin), #600 (précision
notifications sociales), #601 (cleanup handles), #603 (WebRTC async).

## Audit des features récentes — constats vérifiés

### 1. Précision notifications (#600, `NotificationService.ts`) — code mort trompeur
Les 4 fan-outs batch (story comment, comment mention, post mention, friend content)
se terminent par `Promise.allSettled(tasks)` + un forEach qui logge les `rejected`
avec `params.mentionedUserIds[index]`. Double problème vérifié :
1. Le tableau `tasks` est CREUX (self-mention et rate-limités sautés via `continue`)
   → l'index pointe le MAUVAIS destinataire dans les logs.
2. Surtout : la branche est INATTEIGNABLE — `createNotification` ne rejette jamais
   (catch interne l.758 qui logge déjà `Failed to create notification` avec le
   `userId` et le `type` EXACTS, puis `return null`). Aucun test ne peut l'exercer
   par l'API publique.
Fix racine : supprimer les 4 blocs morts (le logging correct existe déjà au bon
niveau), garder `await Promise.allSettled(tasks)` pour la résilience du batch.
Couverture ajoutée : 2 tests de comportement (un destinataire en échec n'avorte pas
le batch + l'échec est loggé avec le bon `userId`).

Faux positifs écartés pendant l'audit (vérifiés dans le code) :
- `imageURL` n'est PAS redondant avec `senderAvatar` : l'extension de notification iOS
  (`NotificationService.swift:134-149`) consomme exclusivement `imageURL` pour
  `INPerson.image` (Communication Notifications). À conserver.
- Le fan-out story est correctement batché : 3 requêtes parallèles plafonnées à 500,
  `Promise.allSettled` partout — aucun N+1.

### 2. Push admin iter 38 — trou de couverture : le catalogue topics (F16 étendu)
`services/gateway/src/routes/admin/agent-topics.ts` : les 3 mutations
(POST l.123, PATCH l.150, DELETE l.181) publient `agent:config-invalidated`
(cache agents) mais PAS `agent:admin-event` (dashboards). Conséquence web :
`AgentTopicsTab.tsx` ne charge qu'au mount + bouton refresh manuel — un deuxième
admin (ou le même sur un autre onglet) ne voit jamais les changements sans
recharger. C'est le dernier onglet admin agent hors du modèle temps réel.

Vérifié sans gap par ailleurs :
- Routes gateway delivery-queue DELETE/PATCH : passent par le service agent
  (`routes/delivery.ts:23,45` → `deleteById`/`editMessageById` → `notifyAdmins`)
  — la couverture existe déjà via la publication côté agent, pas de doublon à ajouter.
- `redis-delivery-queue.ts` : 7/7 points de mutation publient. `conversation-scanner.ts` :
  start + finally publient.

### 3. F14 — `lastSeen` figé au fetch (page contacts v2)
Chaîne vérifiée : `use-contacts-v2.ts:59` appelle `usersService.getLastSeenFormatted()`
dans `transformToContact()` (au fetch React Query) → string gelée dans
`ContactV2.lastSeen` → rendue statiquement dans `ContactCard.tsx:84`. Un contact
« il y a 2 min » le reste pendant toute la session tant que rien ne refetch.

L'infrastructure de fraîcheur existe depuis iter 37 : `useUserStatusTick()`
(`stores/user-store.ts:148`) re-rend sur chaque event présence ET sur le tick
périodique 60 s (`use-user-status-realtime.ts:104`, `STATUS_TICK_INTERVAL_MS=60_000`).
Fix conforme « Zero Unnecessary Re-render » : un composant FEUILLE
(`ContactLastSeenLabel`) abonné au tick, qui formate au render depuis
`contact.lastActiveAt` (déjà transporté brut dans `ContactV2`). Seule la feuille
re-rend au tick — pas la card ni la liste. `ContactCard` est l'unique consommateur de
`ContactV2.lastSeen` (vérifié) → le champ pré-formaté disparaît (single source : le
brut + formatage au render).

### 4. F15 — tick horloge 10 s du timeline admin, aveugle à la visibilité
`AgentScheduleTimeline.tsx:83` : `setInterval(() => setNow(...), 10_000)` tourne
même onglet caché (le navigateur le throttle à ~60 s mais il continue de déclencher
des renders inutiles d'un onglet invisible). Fix : ne ticker que si
`!document.hidden` + resync immédiat de `now` au retour visible (sinon l'horloge
affiche un état périmé jusqu'à 10 s après le retour).

### 5. Pureté — fichier mort de 62 KB dans l'app web
`apps/web/app/contacts/page.backup.tsx` (1 198 lignes, ancienne page v1) : zéro
import, non routé par Next (seul `page.tsx` est un segment), logique `formatLastSeen`
dupliquée dedans. Seul fichier `*.backup.*`/`*.old.*` du repo (vérifié sur apps/web,
services/, packages/shared). À supprimer.

## Décision iter 39 — lot « Fraîcheur & pureté »
Cinq corrections cohérentes, toutes au-dessus du produit existant des iters 37-38 :

| Lot | Quoi | Impact |
|-----|------|--------|
| A | Topics admin temps réel : kind `topics` + publish 3 mutations + souscription `AgentTopicsTab` | Unification — dernier onglet admin rejoint le push ; multi-admin cohérent |
| B | `ContactLastSeenLabel` feuille vivante (tick 60 s) ; suppression du pré-formatage au fetch | UX — labels relatifs jamais périmés ; même pattern que `ContversationList` (iter 37) |
| C | Tick timeline visibility-aware + resync au retour | Ressources — zéro render onglet caché |
| D | Suppression des 4 blocs morts de logging « rejected » des fan-outs + 2 tests de résilience | Observabilité — un seul chemin de log, toujours exact |
| E | Suppression `page.backup.tsx` (−62 KB, −1 198 lignes) | Pureté |

## Consignés pour itérations futures (inchangés)

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F2 | `SOCKET_LANG_FILTER` OFF par défaut (`MessageHandler.ts:580`) | HAUT (~75 % BP multilingue) | Validation staging requise |
| F10 | Dénormaliser `conversationId` scalaire + index sur `Notification` | FAIBLE | Utile seulement à fort volume |

## Gain estimé global
Dashboard admin 100 % temps réel (plus aucun onglet sans push) ; labels de présence
vivants sur la page contacts ; logs de fan-out exacts ; −62 KB de code mort ; zéro
travail UI sur onglets cachés pour le timeline admin.
