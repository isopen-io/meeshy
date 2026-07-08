# Iteration 141 — Analyse d'optimisation (2026-07-08)

## Protocole (démarrage)
`main` @ `5946ece` (dernier merge PR #1658, revue iter 140 ; les iters 139/140 ont été prises en parallèle —
web/audio `snapToScale` F105 et revue helpers). Branche `claude/loving-fermat-we83q3` rebasée sur
`origin/main`. Ce cycle prend **141**. Revue fan-out distribuée (Priorité 1/2) sur le pipeline temps réel
`services/gateway/socketio` — idempotence & filtrage des événements dupliqués (Phase 2 de la mission).

## Cible : R-AR1 — `attachment:reaction` re-broadcast sur un add/remove no-op : la garde d'idempotence d'iter 134 (réactions message) n'avait jamais été appliquée au miroir pièce-jointe

### Current state
`AttachmentReactionHandler` est explicitement le « Miroir de ReactionHandler » (en-tête, l.2-3). Le chemin
message-level a été durci en iter 134 (`a28d540`) : sur un re-react identique (`unchanged`) ou un remove
déjà-absent (`count === 0`), on répond `success` **sans** re-broadcaster. Le miroir pièce-jointe ne le
faisait pas.

`services/gateway/src/services/AttachmentReactionService.ts` (avant fix) :
```ts
async addAttachmentReaction(o): Promise<void> { /* upsert, retour void */ }
async removeAttachmentReaction(o): Promise<void> { /* deleteMany, { count } jeté, retour void */ }
```
`services/gateway/src/socketio/handlers/AttachmentReactionHandler.ts:108-132` (avant fix) : après l'appel
service, le handler émet **inconditionnellement** `ATTACHMENT_REACTION_ADDED` / `ATTACHMENT_REACTION_REMOVED`
à toute la room `conversation:<id>`.

### Problems identified
Le service retournait `void` — il jetait l'information « quelque chose a-t-il changé ? ». Le handler
re-broadcastait donc même quand l'état DB n'avait pas bougé.

- **Remove no-op** : le participant P n'a pas (ou plus) la réaction 👍 sur la PJ A (déjà retirée, retry après
  un ACK perdu, ou 2e device qui rejoue le tap). Le client émet `attachment:reaction:remove`. `deleteMany`
  matche 0 ligne, mais le handler émet quand même `ATTACHMENT_REACTION_REMOVED {action:'remove', emoji:'👍'}`
  à toute la room. Le chemin canonique message n'émet rien ici.
- **Add no-op** : P a déjà réagi 👍 sur A ; un double-fire ré-émet `attachment:reaction:add`. Rien ne change
  en DB (l'upsert `update:{ emoji }` est un no-op), mais `ATTACHMENT_REACTION_ADDED` est re-broadcast — le
  spam exact qu'iter 134 avait supprimé pour les messages.

### Root causes
Divergence de contrat entre deux implémentations sœurs : `ReactionService` retourne `{ unchanged }` /
`count > 0` et `ReactionHandler` early-return dessus ; `AttachmentReactionService` retournait `void` et
`AttachmentReactionHandler` broadcastait toujours. Le durcissement iter 134 n'a été porté que sur le chemin
message.

### Business impact
Deux régressions UX visibles côté client, atteignables en prod (optimistic UI + multi-device = double-fire
courant) :
1. **Remove déjà-absent** → le client qui vient d'ôter sa réaction reçoit un echo `remove` d'un état déjà
   atteint ; pire, un `success:false` (comportement d'erreur ailleurs) aurait fait *rollback* de
   l'optimistic un-react et ré-affiché une réaction pourtant partie.
2. **Add identique** → tous les participants de la conversation reçoivent un `ATTACHMENT_REACTION_ADDED`
   redondant, retraité par chaque client, pour une réaction qui n'a pas changé d'état.

### Technical impact
Trafic Socket.IO inutile (fan-out room entière) + retraitement client sur des no-op. Défaut de correctness
d'idempotence sur un chemin temps réel. Non masqué : aucun test ne couvrait le no-op avant ce cycle.

### Risk assessment
Faible. 2 fichiers, ~40 lignes. Aucun autre appelant des deux méthodes service (grep : seul le handler les
appelle). Les chemins nominaux (add frais, swap d'emoji, remove effectif) restent inchangés — seuls les
no-op cessent de broadcaster.

### Proposed improvements
Aligner le miroir sur le contrat message :
- `addAttachmentReaction` lit l'emoji précédent via `findUnique` sur la clé `(attachmentId, participantId)` ;
  si identique → retourne `{ changed: false }` sans upsert. Sinon upsert + `{ changed: true }`.
- `removeAttachmentReaction` retourne `deleteMany(...).count > 0`.
- Le handler early-return (`callback?.({ success: true })`) sur `!changed` / `!removed`, avant `getReactionSummary`
  et l'emit — miroir de `ReactionHandler.ts:117-127` (add unchanged) et `236-245` (remove absent).

### Expected benefits
- Plus aucun re-broadcast `ATTACHMENT_REACTION_ADDED/REMOVED` sur un no-op (parité stricte avec le message).
- Plus de rollback optimistic possible sur un un-react déjà appliqué.
- Couverture nette : no-op add/remove au niveau service **et** handler (10 tests ajoutés).

### Implementation complexity
Faible. Le contrat cible existe déjà (ReactionService/ReactionHandler) et sert de spécification exacte.

### Validation criteria
- **RED prouvé** : service `void` → `{ changed }` indéfini → handler broadcaste toujours ; 10 nouveaux tests
  échouent (emit non attendu / retour non conforme).
- **GREEN** : 72/72 sur les 4 suites AttachmentReaction. Suite gateway complète 510/510 verte.
  `tsc --noEmit` exit 0.
- Non-régression : les 41 tests nominaux préexistants restent verts (add/remove effectifs broadcastent
  toujours).

## Backlog mis à jour
- **F104** (report d'iter 138) : `NotificationService.formatFileSize` — pas de tier « Go » (≥ 1 Gio →
  `"1024.0 Mo"`). Reachable : `server.ts:744` autorise `maxFileSize: '4 GB'`. Candidat prioritaire pour un
  prochain cycle ciblé (fonction pure, test adjacent `NotificationService.i18n.test.ts`).
- **F106 / F107** (report d'iter 139) : `getUserStatus` sémantique away/offline ; daily-timeline off-by-one/TZ.
- **F102** (report) : `packages/shared/types/attachment.ts:formatFileSize` — fenêtre `1024.00 KB`.
- **F100 / F98 / F90** (report).
