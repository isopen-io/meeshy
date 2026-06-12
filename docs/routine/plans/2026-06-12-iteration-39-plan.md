# Iteration 39 — Plan d'implémentation (2026-06-12)

## Objectif
Lot « Fraîcheur & pureté » : compléter la couverture temps réel du dashboard admin
(topics — F16 étendu), rendre vivant le label lastSeen de la page contacts (F14),
rendre le tick horloge du timeline admin visibility-aware (F15), corriger le décalage
d'index dans le logging des fan-outs de mentions (#600), supprimer le fichier mort
`page.backup.tsx`.

## Étapes (TDD : RED → GREEN)

### Phase A — Topics admin temps réel
- [x] Shared : ajouter `'topics'` à `AGENT_ADMIN_EVENT_KINDS`
      (`packages/shared/types/socketio-events.ts:1002`) — le type
      `AgentAdminEventKind` en dérive.
- [x] RED : test routes agent-topics — publish `{kind:'topics'}` sur
      `AGENT_ADMIN_EVENT_CHANNEL` après POST/PATCH/DELETE ; test relay — payload
      `{kind:'topics'}` accepté.
- [x] GREEN : `agent-topics.ts` — publish fire-and-forget (même pattern que
      `notifyAdminDashboards` d'agent.ts) dans les 3 mutations, à côté de
      `broadcastTopicsInvalidation`.
- [x] Web : `AgentTopicsTab.tsx` — `useAgentAdminEvents({ kinds: ['topics'],
      onChange: reload })` ; `reload` existant inchangé.

### Phase B — lastSeen vivant (contacts v2)
- [x] RED : test `ContactLastSeenLabel` — affiche le label relatif depuis
      `lastActiveAt`, se recalcule quand `triggerStatusTick()` est déclenché.
- [x] GREEN : `components/v2/ContactLastSeenLabel.tsx` — feuille mémoïsée,
      `useUserStatusTick()` + formatage au render (réutilise
      `usersService.getLastSeenFormatted` via helper pur acceptant
      `{ lastActiveAt, t, locale }`).
- [x] `ContactCard.tsx` — remplace le `<p>{contact.lastSeen}</p>` statique par la
      feuille ; `use-contacts-v2.ts` — retire le pré-formatage au fetch et le champ
      `ContactV2.lastSeen` (unique consommateur = ContactCard, vérifié).

### Phase C — Tick timeline visibility-aware
- [x] `AgentScheduleTimeline.tsx:83` — le tick 10 s ne setNow que si
      `!document.hidden` ; listener `visibilitychange` → resync `setNow(Date.now())`
      au retour visible ; cleanup symétrique.

### Phase D — Logging des fan-outs exact (révisé pendant l'implémentation)
- [x] Constat : la branche `rejected` est INATTEIGNABLE (`createNotification` catch
      tout et logge déjà le bon `userId`) — fix racine = suppression du code mort,
      pas réparation d'index.
- [x] Tests de comportement d'abord : un destinataire en échec n'avorte pas le batch
      ET l'échec est loggé `Failed to create notification` avec le bon `userId`
      (comment + post mention) — verts AVANT la suppression (verrou).
- [x] Suppression des 4 blocs morts (story comment, comment mention, post mention,
      friend content) ; `await Promise.allSettled(tasks)` conservé.

### Phase E — Pureté
- [x] Supprimer `apps/web/app/contacts/page.backup.tsx` (zéro import, non routé).

### Phase F — Vérification & livraison
- [x] Suites Jest gateway (agent-topics, relay, notifications) + web (hook admin,
      contacts v2, nouveau label) vertes ; baseline identique à main sur les suites
      touchées.
- [ ] Commit + push `claude/inspiring-euler-opy4p1`, PR vers `main`, CI verte, merge.

## Hors périmètre (consigné dans l'analyse)
- F2 : flip `SOCKET_LANG_FILTER` (validation staging — dernier gros levier BP)
- F10 : scalaire `conversationId` sur Notification (volumétrie)

## Continuité
Iter 40+ : F2 si un créneau staging existe ; sinon nouvel audit des features
fraîchement mergées (le spectre récent → ancien de la routine) ; F10 opportuniste.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — topics temps réel
- [x] Phase B — lastSeen vivant
- [x] Phase C — tick visibility-aware
- [x] Phase D — logging fan-outs exact (code mort supprimé)
- [x] Phase E — fichier mort supprimé
- [ ] Phase F — CI verte, mergé dans main
