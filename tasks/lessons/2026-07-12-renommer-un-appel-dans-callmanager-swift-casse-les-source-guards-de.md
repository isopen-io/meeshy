## 2026-07-12 — Renommer un appel dans CallManager.swift casse les source-guards de CallManagerTests.swift

**Contexte** : le fix reject iOS (`f67c39ac0`, `emitCallEnd` → `emitCallReject` dans
`rejectPendingCall()`) a fait tomber iOS Tests (2/3685) : `RejectPendingCallTests` sont des
source-guards qui lisent CallManager.swift en TEXTE et exigent des sous-chaînes exactes
(`emitCallEnd(callId: pending.callId)`). CI + SDK Tests verts n'ont rien vu — seul iOS Tests
exécute MeeshyTests.

**Règles** :
- Avant tout push qui renomme/déplace un appel dans CallManager.swift (ou tout fichier prod
  couvert par des guards) : `grep -n "<ancien-symbole>" apps/ios/MeeshyTests/` et adapter les
  guards DANS LE MÊME commit.
- Un source-guard cassé se répare en ré-encodant le NOUVEAU contrat (jamais en dégradant la
  prod) et en le RENFORÇANT si la substitution ouvre un trou (ex : verrou SDK
  `emitCallReject` doit émettre `call:end` AVEC `reason=rejected`, sinon le guard app
  passerait à vide).
- Ces guards se vérifient sans Xcode : répliquer l'extraction `functionBody` en Python sur
  les vraies sources (10 s au lieu d'un build de 15 min).
