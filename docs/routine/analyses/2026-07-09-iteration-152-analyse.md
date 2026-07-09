# Iteration 152 — Analyse d'optimisation (2026-07-09)

## Protocole (démarrage)
`main` @ `ab919cd7` (dernier merge : PR #1746 iter — memory-fallback slice
`size()`/`peek()` Redis-parity). Branche `claude/brave-archimedes-itvak7`
synchronisée sur `origin/main` (0/0). Ce cycle prend **152**.

Fan-out : deux agents Explore parallèles — (a) `services/gateway/src` (delivery
queue, post/story views, présence, reactions, call-transcription, stats), (b)
`apps/web` + `packages/shared` (mentions, présence, prisme, typing, reactions,
story/canvas, translation display). Consigne : **un** défaut de logique
quasi-pure, haute confiance, **actuellement en production**, non couvert par les
tests. Priorité 1 = features récemment développées (la présence a été
massivement retravaillée : PR #1729, #1735, #1727, iter 146, centralisation
palette + source de vérité).

---

## Cible retenue : F118 — `formatPresenceLabel` accepte `isOnline` mais ne le lit jamais → le libellé contredit sa propre couleur

### Current state
`apps/web/utils/presence-format.ts`. Deux fonctions sœurs, dans le **même
fichier**, décident de l'état de présence à partir des mêmes entrées
(`lastActiveAt`, `isOnline`) — et **divergent** :

- **`presenceColorClass`** (ligne 48) délègue correctement à la source de vérité
  partagée :
  ```ts
  const status = getUserPresenceStatus({ isOnline, lastActiveAt }, now ?? Date.now());
  return PRESENCE_TEXT_CLASS[presenceTone(status)];
  ```
- **`formatPresenceLabel`** (ligne 22) dérive « en ligne » d'un **seuil local**
  et **ignore silencieusement** le paramètre `isOnline` qu'elle reçoit :
  ```ts
  const minutesAgo = (nowMs - lastMs) / 60_000;
  if (minutesAgo < 1) return o.t('status.online');   // isOnline jamais lu
  ```

La règle canonique (`packages/shared/utils/user-presence.ts`,
`getUserPresenceStatus`) traite `isOnline === true` comme **autoritatif** :
online pendant 30 min après `lastActiveAt` (gardé contre les données périmées via
la fenêtre away). `presenceColorClass` l'honore ; `formatPresenceLabel` non.

### Problems identified
Utilisateur avec `isOnline = true`, dernier heartbeat il y a 10 min (état normal
d'un socket actif — les heartbeats sont throttlés) :
- `presenceColorClass(lastActiveAt, true)` → `getUserPresenceStatus` → `'online'`
  → texte **vert** (emerald).
- `formatPresenceLabel({ lastActiveAt, isOnline: true })` → `minutesAgo = 10` →
  **`"Vu il y a 10 minutes"`**.

Les deux sont rendus dans le **même `<span>`** (`apps/web/app/u/[id]/page.tsx:382-389`,
le `user.isOnline` alimente couleur ET libellé). L'en-tête de profil affiche donc
un libellé « vu il y a 10 min » **en couleur verte « en ligne »** — une
contradiction visible pour tout utilisateur backend-online dont le dernier
heartbeat a ≥ 1 min (le régime permanent d'une session active).

### Root causes
Deux sources de vérité pour un même état. `presenceColorClass` a été centralisé
sur `getUserPresenceStatus` (effort palette/SSOT présence — PR #1729) mais
`formatPresenceLabel`, dans le même fichier, a conservé son seuil local
`minutesAgo < 1` et n'a jamais propagé l'autorité `isOnline`. Le paramètre
`isOnline?` a été ajouté à la signature (`FormatPresenceLabelOptions`) mais son
corps ne le référence nulle part → paramètre mort.

### Business impact
Contradiction perçue dans l'en-tête de profil : un contact réellement connecté
apparaît « vu il y a X minutes » alors que la pastille/couleur dit « en ligne ».
Friction de confiance sur un signal social central (présence). WhatsApp-grade :
« en ligne » doit vouloir dire en ligne.

### Technical impact
Feature morte (`isOnline` inatteignable dans `formatPresenceLabel`). Divergence
de règle non testée entre libellé et couleur pour le même utilisateur.

### Risk assessment
Très faible. On aligne le libellé sur la règle canonique déjà en production pour
la couleur — aucune sémantique produit nouvelle. Les cas non-online (recent/away
`isOnline=false` → « vu il y a X ») restent **inchangés** : `getUserPresenceStatus`
ne renvoie `'online'` que pour `isOnline===true` (fenêtre away) OU activité < 60 s
— exactement le comportement WhatsApp-style voulu. La décroissance au-delà de
30 min (isOnline stale-true) retombe correctement sur « vu il y a X ».

### Proposed improvements
Gater le libellé « en ligne » sur la règle partagée, avant l'échelle relative :
```ts
if (getUserPresenceStatus({ isOnline: o.isOnline, lastActiveAt: o.lastActiveAt }, nowMs) === 'online') {
  return o.t('status.online');
}
```

### Expected benefits
- Libellé et couleur s'accordent toujours (une seule règle : `getUserPresenceStatus`).
- Un utilisateur backend-online affiche « En ligne », plus « vu il y a 10 min ».
- Le paramètre `isOnline` de `formatPresenceLabel` cesse d'être mort.
- Parité avec `presenceColorClass` (même fichier), iOS `UserPresence.state`,
  Android `UserPresence.state`.

### Implementation complexity
Triviale : 1 branche de production (remplace `minutesAgo < 1`) + 2 tests de
comportement (RED→GREEN). Toutes les branches relatives (< 60 min, < 24 h,
hier/avant-hier/date) restent inchangées.

### Validation criteria
- Nouveau test « online despite stale heartbeat » (`isOnline=true`, 10 min →
  `status.online`). RED avant fix, GREEN après.
- Nouveau test « decays past away window » (`isOnline=true`, 45 min →
  `status.lastSeenMinutes`) — garde la décroissance.
- Suite `presence-format.test.ts` verte (14/14, +2), aucune régression sur les
  branches minutes/heures/jours/date ni sur `presenceColorClass`.

---

## Candidat gateway retenu pour un cycle futur (non pris ce cycle) : clé de bucket stats erronée sur la suppression d'un message anonyme

L'agent gateway a trouvé un vrai défaut, gardé en réserve pour ne pas re-fan-outer :
`DELETE` message (`services/gateway/src/routes/conversations/messages-advanced.ts:620`)
appelle `onMessageDeleted(..., existingMessage.sender?.userId ?? '', ...)`. Or
`onNewMessage` incrémente `participantStats` sous `userId || participantId`
(`MessageHandler.ts:327,531`) et `recompute` sous `msg.sender?.userId || msg.senderId`
(`ConversationMessageStatsService.ts:394`). Pour un **expéditeur anonyme**
(`sender.userId === null`), le delete passe **`''`** au lieu de `senderId` → le
garde `if (entry)` (`:298`) saute → le bucket par-participant n'est jamais
décrémenté (les totaux le sont), dérive à la hausse jusqu'au prochain
`recompute()`. Fix ciblé : `existingMessage.sender?.userId ?? existingMessage.senderId`
(aligne la clé du delete sur `recompute`). Non couvert (tous les tests
`onMessageDeleted` utilisent un `USER_A` enregistré). Réservé : le fix vit au site
d'appel (route), donc requiert soit un test d'intégration route, soit un
refactor du contrat — à trancher au prochain cycle.
