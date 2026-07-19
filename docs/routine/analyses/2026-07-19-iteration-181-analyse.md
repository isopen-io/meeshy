# Iteration 181 — `_notifyAgent` : le tier `User.displayName` du sender est court-circuité + fuite chaîne-vide (SSOT participant non branchée)

## Protocole (démarrage)
`main` @ `7c65395` (derniers merges : #2050 android/status ViewModel, #2048
status repository, #2046 status core, #2044 web/i18n language-code normalize —
**itération 180**). Branche `claude/brave-archimedes-xtm1k3` synchronisée sur
`origin/main` (0/0). Ce cycle prend **181**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (gateway/shared). Backlog TS des itérations 179-180 épuisé
(Finding 3 livré en 180 ; les 2 autres candidats explicitement marqués « ne pas
toucher sans analyse dédiée » / « 0 appelant »). Revue fraîche de la surface
gateway → nouveau site de divergence SSOT sur la résolution `displayName` d'un
`sender`, exactement la famille de bug traitée par #1925 (avatar) et l'itération
179 (`resolveParticipantDisplayName`).

## Current state
`MessageHandler._notifyAgent` alimente l'événement `agent:new-message`
(consommé par les agents IA via `ZmqAgentClient`) avec un `senderDisplayName`
résolu à la main sur **2 sites** :

```ts
// services/gateway/src/socketio/handlers/MessageHandler.ts:317 (handleMessageSend)
// services/gateway/src/socketio/handlers/MessageHandler.ts:513 (handleMessageSendWithAttachments)
senderDisplayName: message.sender?.displayName ?? message.sender?.user?.username,
senderUsername:    message.sender?.user?.username,
```

L'itération 179 a créé la SSOT `resolveParticipantDisplayName(participant)`
(`packages/shared/utils/participant-helpers.ts`) — ordre canonique **local
`displayName` → compte `User.displayName` → `null`**, blank-aware — et l'a
branchée sur les 7 sites de sérialisation `sender` des routes REST. Ces 2 sites
Socket.IO sont restés sur l'ancien `??`.

## Problems identified
1. **Tier compte `User.displayName` court-circuité.** La coalescence
   `sender.displayName ?? sender.user?.username` saute **entièrement** le
   `displayName` du compte utilisateur lié. Un `sender` sans `displayName` local
   (participant sans nom par-conversation) mais dont le compte porte
   `User.displayName = "Alice Martin"` était notifié à l'agent avec le
   **username brut** (`"alice_m"`) au lieu du nom d'affichage du compte — alors
   que toutes les routes REST (via `resolveParticipantDisplayName`) exposent
   `"Alice Martin"`. Incohérence de nom pour une même entité selon le canal.
2. **Fuite chaîne-vide.** `sender.displayName === ''` (chaîne vide ≠ null) fait
   que `??` retourne `''`, jamais le fallback. L'agent recevait un
   `senderDisplayName` vide au lieu du nom du compte ou du username.
3. **SSOT participant non respectée.** La règle produit « displayName local →
   compte » est réécrite à la main ici alors qu'un helper testé existe et est
   déjà la source de vérité partout ailleurs. Dette + risque de dérive.

## Root cause
L'itération 179 a rebranché les sites REST de sérialisation `sender` sur
`resolveParticipantDisplayName`, mais les 2 sites Socket.IO `_notifyAgent`
(hors du périmètre « sérialisation route ») sont restés sur l'ancienne
coalescence — et celle-ci était de surcroît **plus incorrecte** que les sites
REST d'alors, puisqu'elle sautait directement au `username` sans passer par le
`User.displayName` du compte.

## Business / Technical impact
- **UX agents IA** : les agents (auto-réponses, résumés, mentions) recevaient un
  nom d'expéditeur incohérent avec le reste de l'app — username technique ou
  chaîne vide au lieu du nom d'affichage du compte — dégradant la qualité des
  réponses générées et des notifications que l'agent produit.
- **Cohérence** : `senderDisplayName` (Socket.IO → agent) désormais résolu par la
  même SSOT blank-aware que `sender.displayName` (routes REST).
- **Dette** : 2 réécritures manuelles d'une décision produit remplacées par un
  appel au helper testé.

## Risk assessment
Très faible. Le fallback final `?? message.sender?.user?.username` est
**conservé** (intention produit : l'agent doit toujours avoir un libellé humain,
username à défaut de nom). Le changement est strictement additif : il **insère**
le tier `User.displayName` manquant entre le displayName local et le username, et
rend la résolution blank-aware. Aucun cas ne perd de nom là où il en existait un.
Type de retour inchangé (`string | undefined`). Aucune requête Prisma modifiée
(`sender.user` est déjà chargé et déjà lu par l'ancien code). Miroir exact du
pattern en production depuis #1925 / itération 179.

Tous les tests `_notifyAgent` existants restent verts :
- `displayName` local présent → inchangé (helper renvoie le local).
- `displayName` local null **sans** `user.displayName` → helper renvoie null →
  fallback username (comportement identique).
- `sender` absent → helper renvoie null → `undefined?.user?.username` = undefined.

## Proposed improvements / Correctif (TDD)
- **RED** : +1 test (`MessageHandler.core.test.ts`) — `sender` avec
  `displayName` local `null` mais `user.displayName = "Alice Account"` et
  `user.username = "alice_acct"` → `senderDisplayName` attendu `"Alice Account"`
  (le code actuel renvoie `"alice_acct"`, bug).
- **GREEN** :
  1. `MessageHandler.ts` — import de `resolveParticipantDisplayName` depuis
     `@meeshy/shared/utils/participant-helpers`.
  2. Les 2 sites `_notifyAgent` :
     `senderDisplayName: resolveParticipantDisplayName(message.sender) ?? message.sender?.user?.username`.

## Expected benefits
- Parité stricte du nom d'expéditeur entre le canal Socket.IO→agent et les routes
  REST pour tous les `sender` sans displayName local mais avec un compte nommé.
- Fuite chaîne-vide supprimée.
- Une seule source de vérité pour la règle « displayName local → compte »,
  fallback username préservé au dernier rang.

## Implementation complexity
Faible — 1 import + 2 substitutions vers un helper testé, fallback conservé.

## Validation criteria
- `services/gateway` : suites `MessageHandler` (`__tests__/unit/handlers/MessageHandler.core.test.ts`,
  `socketio/handlers/__tests__/MessageHandler.test.ts`) vertes, +1 nouveau test.
- `tsc --noEmit` : 0 nouvelle erreur.

## Backlog (candidats consignés pour une itération future)
- `MeeshySocketIOManager.ts:752` — `c.user?.username ?? c.user?.displayName ?? c.displayName`
  (sémantique « clé de présence », ordre username-first délibéré) : hors périmètre,
  à ne PAS uniformiser sans analyse dédiée.
- F69 (`sanitizeFileName` overlong sans extension) : latent, 0 appelant.
