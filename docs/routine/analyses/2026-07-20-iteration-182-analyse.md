# Iteration 182 — Résolution `displayName` des participants d'appel : chaîne `||` brute non alignée sur le SSOT blank-aware

## Protocole (démarrage)
`main` @ `115b2627` (derniers merges : #2073/#2070/#2068 android/status,
#2065/#2063/#2061 android/status, ios/sdk timeline). Branche
`claude/brave-archimedes-58u2mr` synchronisée sur `origin/main` (0 ahead / 0
behind). Ce cycle prend **182**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (gateway/shared). Les PR android/ios sont pilotées par d'autres
sessions et hors périmètre. Point de départ : **revue Priorité 1**
(fonctionnalités récentes). L'audit « caches de process non bornés » du backlog
181 a été mené (StatusHandler, CaptchaService, StatusService, NotificationService,
ZmqMessageHandler, ZmqRequestSender, CallEventsHandler) → **tous bornés** (cap de
taille + purge périodique/amortie ; les `pendingRequests` ZMQ sont tous armés
d'un timeout via `_registerRequestTimeout`). Aucune fuite résiduelle : le hunt
mémoire gateway est clos.

Pivot vers la fonctionnalité serveur **récente et testable** la plus proche :
le SSOT blank-aware `resolveParticipantAvatar` / `resolveParticipantDisplayName`
(#1925 / #2025), et sa **couverture incomplète**.

## Current state
`packages/shared/utils/participant-helpers.ts` fournit deux sources uniques
blank-aware pour résoudre le nom/avatar à afficher d'un participant :
`resolveParticipantDisplayName` (local → compte, chaîne vide **ou blanche**
traitée comme absente → `null`). #2025 a câblé les **7 sites** de sérialisation
`sender.displayName` des routes conversation/message dessus.

Mais **trois sites de la couche Socket.IO d'appel** (`CallEventsHandler.ts`)
sérialisent le `displayName` d'un participant avec une chaîne `||` brute,
**jamais migrée** :

```ts
displayName: p.participant?.displayName || p.participant?.user?.displayName,
```

Sites :
1. `~1551` — replay `call:initiated` à la (re)connexion (résilience appel).
2. `~1678` — ACK/broadcast `call:initiate`.
3. `~2030` — payload `call:participant-joined`.

Les trois construisent un DTO `CallParticipant` **strictement identique**
champ-pour-champ (triplication pure).

## Problems identified
1. **Fuite de nom blanc/whitespace vers les clients natifs.** `||` ne traite
   comme falsy que la chaîne **vide** — un `displayName` local **whitespace-only**
   (`'   '`, truthy) est renvoyé tel quel. De même, si le nom local est absent et
   le nom **du compte** est vide/blanc, `||` renvoie cette chaîne vide. Le gateway
   (SSOT API) fuit alors `displayName: ''`/`'   '` vers iOS/Android, qui ne
   partagent pas le trim web `getUserDisplayName`. C'est **exactement** la classe
   de bug corrigée par #2025 pour les routes conversation/message — les appels ont
   été oubliés.
2. **Incohérence de contrat de sérialisation.** Le reste de l'API renvoie
   désormais `displayName: null`/omis (via le SSOT) quand aucun nom n'est
   disponible ; les appels renvoient `undefined`/`''` selon le chemin `||`. Le
   Prisme exige un contrat homogène « pas de nom → absent ».
3. **Triplication (dette / maintenabilité).** Le même mapping participant→DTO est
   copié sur 3 sites ; toute évolution (nouveau champ, correctif) doit être
   répétée 3× avec risque de divergence (déjà survenue sur le `displayName`).

## Root cause
#2025 a migré les sites **conversation/message** identifiés par un `grep` sur les
routes, mais la couche **Socket.IO d'appel** (`CallEventsHandler`) construit ses
DTO participants inline, hors du périmètre du grep initial. La règle produit
(local → compte, blank = absent) n'y a donc jamais été appliquée, et la
triplication a masqué l'écart.

## Business / Technical impact
- **UX / cohérence produit (clients natifs)** : un participant d'appel au nom
  local blanc voyait son nom de compte masqué (ou une chaîne vide affichée) dans
  l'UI d'appel iOS/Android — friction directement visible pendant un appel.
- **Cohérence d'API** : convergence du contrat de sérialisation `displayName`
  sur une seule règle, sur *toute* la surface (messages, conversations, appels).
- **Maintenabilité** : suppression d'une triplication ; un seul point d'évolution
  pour le DTO participant d'appel.
- **Correctness** : `username`/`avatar` **inchangés** (fallback username compte →
  displayName local ; ordre avatar compte-first) — refactor pur pour ces champs.

## Risk assessment
Très faible. `username`/`avatar`/identité/flags/quality reproduits à l'octet près
depuis les sites d'origine ; seul `displayName` change, dans le sens strictement
plus correct (SSOT déjà testé en shared). Différence de wire résiduelle :
`displayName` passe de `undefined`/`''` à `undefined` (omis) quand absent —
alignement sur le contrat #2025, pas une régression. Aucune signature publique
modifiée. Helper pur, testé en isolation.

## Proposed improvements / Correctif (TDD)
- **RED** : nouveau `callParticipantView.test.ts` (9 tests) — priorité
  local>compte ; fallback sur `''` local ; **whitespace-only local traité comme
  absent** ; `undefined` (omis) quand tout est blanc ou sans participant lié ;
  préservation ordre avatar compte-first ; préservation fallback username ;
  pass-through identité/role/flags/quality ; fallback `userId → participantId`.
- **GREEN** : `src/socketio/callParticipantView.ts` — `toCallParticipantView(row)`
  pur, `displayName: resolveParticipantDisplayName(row.participant) ?? undefined`,
  reste identique. Câbler les 3 sites via `.map(toCallParticipantView)` /
  `toCallParticipantView(participant)`. Retirer l'import `ConnectionQuality`
  devenu inutilisé dans `CallEventsHandler`.
- **REFACTOR** : docstrings ; triplication supprimée.

## Expected benefits
- Contrat `displayName` homogène blank-aware sur toute la surface API (le Prisme).
- Fin de la fuite de nom blanc/whitespace vers les clients d'appel natifs.
- Un seul point de vérité pour le DTO participant d'appel (−~35 lignes dupliquées).

## Implementation complexity
Faible — 1 helper pur (~40 lignes) + 3 sites câblés + 1 import retiré, dans un
domaine déjà couvert par une large suite de tests `CallEventsHandler-*`.

## Validation criteria
- `callParticipantView.test.ts` : **9/9** verts.
- Suites `CallEventsHandler-*` préexistantes : **inchangées / vertes** (aucune
  régression sur les payloads d'appel).
- `tsc --noEmit` gateway : 0 nouvelle erreur sur les lignes touchées.

## Backlog (candidats consignés pour une itération future)
- **Ordre avatar appels vs SSOT** : les 3 sites utilisent `user.avatar || avatar`
  (**compte → local**), l'inverse du SSOT `resolveParticipantAvatar`
  (**local → compte**). C'est une divergence réelle, mais **basculer l'ordre est
  un changement de comportement produit** (un avatar par-conversation cesserait
  d'être masqué par l'avatar de compte) → nécessite confirmation produit avant
  migration. Volontairement **hors périmètre** de cette itération (préservation
  stricte). Câbler `resolveParticipantAvatar` une fois l'ordre confirmé.
- `MeeshySocketIOManager.ts:752` — ordre de résolution `username ?? displayName`
  (sémantique « présence key ») : hors périmètre, ne pas uniformiser sans analyse.
- F69 (`sanitizeFileName` overlong sans extension) : latent, 0 appelant.
