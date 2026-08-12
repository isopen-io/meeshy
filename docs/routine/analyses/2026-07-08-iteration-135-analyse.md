# Iteration 135 — Analyse d'optimisation (2026-07-08)

## Protocole (démarrage)
`main` @ `1b28c39` (dernier merge PR #1647). Branche `claude/brave-archimedes-o37o0o` recréée depuis
`origin/main`. Numérotation : l'itération **134** est déjà prise par la PR humaine #1648 (jcnm —
`reaction:add` idempotent, encore en CI). Ce cycle prend donc **135** et **évite strictement toute la
zone "reactions" gateway** (`ReactionService.ts`, `routes/reactions.ts`, `routes/conversations/messages-advanced.ts`
côté réactions, `MeeshySocketIOManager.ts` réactions, `ReactionHandler.ts`, `tasks/lessons.md`) pour ne
pas entrer en conflit avec #1648.

PR ouvertes au démarrage : #1648 (humaine, laissée intacte) + dependabot (#1549/#1542/#1539/#1536/#1532).

## Écartés cette session (revue, non retenus)
Revue d'ingénierie fan-out (Priorité 1) sur les fonctions pures gateway/shared/web. Candidats instruits
puis **écartés ou différés** :

- **`ConversationMessageStatsService.isTextMessageStat` — clause `hasTextContent` divergente** : le
  commentaire (l.32-36) affirme « mirrors the authoritative recompute() (`msgType === 'text' &&
  attachments.length === 0`) » mais le code ajoute une exigence `content.trim().length > 0` absente de
  `recompute`. Divergence réelle du contrat, MAIS impact production quasi-nul : le chemin incrémental
  reçoit `validated.content` = **plaintext non-vide** même pour un message chiffré (le serveur chiffre
  après coup, cf. `MessageProcessor.ts:427` `content: isEncrypted ? '' : …`), donc les deux chemins
  comptent le message ; la seule divergence effective concerne un message texte **whitespace-only** (passe
  `min(1)` mais `trim()` vide) → cas dégénéré rarissime. Non retenu ce cycle (queué **F100**, décision de
  sémantique produit : « un message texte vide compte-t-il comme texte ? »).
- **`TrackingLinkService.getTrackingLinkStats` — `clicksByHour` en heure locale serveur** (`getHours()`)
  alors que `clicksByDate` est en UTC (`toISOString()`) : incohérence latente entre deux histogrammes
  dérivés du même jeu de clics, MAIS masquée en prod (`node:22-slim` tourne `TZ=UTC` → `getHours()` ===
  `getUTCHours()`). Bug latent sans impact tant que le déploiement reste UTC. Queué **F101**.
- **`MessageValidator.checkPermissions` — `conversationId` non-résolu passé aux sous-checks** : défaut de
  logique réel mais **non atteignable en production** (`MessagingService` n'appelle que `validateRequest` ;
  `checkPermissions` n'est référencé que par son fichier de test). Écarté (non-reachable).

## Cible : F99b — `ConversationMessageStatsService` : `locationCount` jamais incrémenté sur le chemin incrémental (drift vs `recompute`)

### Current state
`services/gateway/src/services/ConversationMessageStatsService.ts`. Deux chemins écrivent la ligne
dénormalisée `conversationMessageStats` :

1. **`recompute(prisma, conversationId)`** — source de vérité : relit **tous** les messages non supprimés
   et recalcule chaque compteur. Il compte `locationCount` **par `messageType`** (l.414) :
   ```ts
   const msgType = msg.messageType || 'text';
   …
   if (msgType === 'location') { locationCount += 1; }
   ```
2. **`onNewMessage` / `onMessageDeleted`** — chemin incrémental (atomic `{ increment }`/`{ decrement }`),
   appelé sur chaque envoi/suppression. Il dérive **tous** ses compteurs de type de contenu depuis
   l'argument `attachmentTypes: string[]`, via la table :
   ```ts
   const ATTACHMENT_TYPE_FIELDS = {
     image: 'imageCount', audio: 'audioCount', video: 'videoCount',
     file: 'fileCount', location: 'locationCount',   // ← attend un token 'location'
   };
   ```

Chemin de production confirmé : `MessageHandler.ts:326-329` (texte) et `:530-533` (avec pièces jointes)
appellent `onNewMessage`. **Les deux** construisent `attachmentTypes` uniquement à partir du MIME
(`image/`→'image', `audio/`→'audio', `video/`→'video', défaut→'file') — **jamais `'location'`**. Le
`messageType` (`message.messageType || 'text'`) EST transmis en 7e argument.

### Problems identified
La localisation est un **`messageType`** (`'location'`), pas un token de pièce jointe. Aucun appelant ne
place donc jamais `'location'` dans `attachmentTypes` ⇒ la branche `location → locationCount` de
`ATTACHMENT_TYPE_FIELDS` est **morte** et `locationCount` n'est **jamais** incrémenté sur le chemin
incrémental. Pendant ce temps `recompute` **le compte** (par `messageType`). Les deux chemins censés
maintenir la même ligne divergent : l'un compte les localisations, l'autre les ignore silencieusement.

`recompute` n'est appelé qu'en fallback **quand la ligne est absente** (les 3 sites d'appel sont tous
`if (!existing)` / `if (!row)`) — aucun job de recompute périodique n'existe. Donc une fois la ligne
créée, `locationCount` reste figé à la valeur du seed initial : chaque message de localisation envoyé
ensuite est perdu pour la stat, **définitivement**.

### Root cause
Confusion de dimension : `locationCount` a été rangé dans une table indexée par token de **pièce jointe**
alors que la localisation est une dimension de **`messageType`** (comme le texte, qui lui EST correctement
géré via `isTextMessageStat(…, messageType)`). Le compteur `fileCount` de la même table fonctionne car
`'file'` EST un vrai token d'attachment produit par les appelants ; `location` ne l'est pas.

### Business / Technical impact
- **Sous-comptage permanent des localisations** : l'endpoint admin de stats de conversation
  (`contentTypes.location` dans `shapeResponse`) sous-reporte les messages de localisation — figé au seed,
  jamais rafraîchi (pas de recompute périodique).
- **Incohérence inter-chemins** : la même ligne donne deux valeurs selon qu'elle vient d'être recalculée
  (`recompute`, correct) ou maintenue incrémentalement (`onNewMessage`, faux). Contredit le commentaire de
  classe qui affirme que le drift « is corrected by periodic recompute() » — il n'y a pas de recompute
  périodique.
- **Code mort trompeur** : l'entrée `location: 'locationCount'` suggère à tort que la localisation est
  gérée, masquant le trou (sibling-drift, cf. Leçon 72/74).

### Risk assessment
Faible. Changement confiné à une seule fonction pure de comptage + son symétrique de suppression ; aucune
API ni forme de réponse modifiée (`contentTypes.location` existe déjà). Le comptage des pièces jointes
réelles (image/audio/video/file) et du texte est **inchangé**. Add/delete restent symétriques (même
prédicat `messageType === 'location'` des deux côtés → jamais négatif).

### Proposed improvement
Compter `locationCount` **par `messageType`** sur le chemin incrémental, exactement comme `recompute` :
- `onNewMessage` : `locationCount: messageType === 'location' ? { increment: 1 } : undefined`.
- `onMessageDeleted` : `updateData.locationCount = { decrement: 1 }` quand `messageType === 'location'`.
- Retirer l'entrée morte `location: 'locationCount'` de `ATTACHMENT_TYPE_FIELDS` (jamais déclenchée,
  trompeuse) et documenter que la localisation est comptée par `messageType`.

### Expected benefits
- `locationCount` reflète fidèlement les messages de localisation en temps réel → parité incrémental ↔
  `recompute`.
- Suppression du code mort trompeur → intention explicite (dimension `messageType` ≠ dimension attachment).
- Symétrie add/delete garantie, cohérente avec le traitement du texte déjà en place.

### Implementation complexity
Très faible — 1 fichier de production (2 fonctions + suppression 1 entrée de table), 2 tests de
régression (incrément sur `onNewMessage` type `location` ; décrément sur `onMessageDeleted` type
`location`).

### Validation criteria
- **RED prouvé** : avant le fix, `onNewMessage(…, [], 'en', 'location')` ne pose **aucun**
  `locationCount` dans `update.data` (`toBeUndefined()`), alors que `recompute` compterait 1.
- Après : `onNewMessage` type `location` → `update.data.locationCount === { increment: 1 }` ;
  `onMessageDeleted` type `location` → `update.data.locationCount === { decrement: 1 }`.
- Tous les tests existants (image/audio/video/file, texte, non-texte-avec-caption) restent verts.
- Zéro changement de la forme de la réponse (`shapeResponse.contentTypes.location` inchangée).

## Backlog mis à jour
- **F100** (nouveau) : `isTextMessageStat` — aligner exactement sur `recompute` (retirer `hasTextContent`)
  ou l'inverse (décision sémantique produit : un message texte vide compte-t-il ?).
- **F101** (nouveau) : `TrackingLinkService.getTrackingLinkStats` — `clicksByHour` en UTC (`getUTCHours()`)
  pour cohérence avec `clicksByDate` (latent tant que `TZ=UTC`).
- **F97** (report) : `use-message-translations.ts` — dedup alias `t.model` (pas de consommateur prod ;
  `processMessageWithTranslations` non destructuré dans `bubble-stream-page.tsx`).
- **F98** (report) : `NotificationService.isDNDActive` — sémantique jour d'une fenêtre DND nocturne.
- **F90** (report) : message-search — recall des traductions.
