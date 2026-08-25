# Plan — Iteration-243i · atteignabilité de la surface conversation

**Date** : 2026-08-25 · **Piste** : iOS (`i`) · **Base** : `main` `e91b3d19`
**Branche** : `claude/intelligent-noether-oulsyj`
**Analyse** : `docs/analyses/uiux/2026-08-25-iteration-243i-unreachable-conversation-helpers.md`

## Point de départ

Report (d) de 242i : `conversation.view.reply.count.{one,many}` — « l'arabe y est
lésé, six formes pour deux branches Swift ». Ligne recopiée depuis 240i par 241i,
242i et 243i.

## Décision qui a changé le lot

Avant d'écrire l'entrée `variations.plural` attendue, poser la question que le
report ne pose pas : **qui affiche ces clés ?**

Réponse mesurée : personne. `replyCountPill` n'a **aucun site d'appel dans toute
l'histoire du dépôt**, et `.many` n'est dans **aucun** des quatre catalogues.

⇒ Le lot bascule de « traduire » à « retirer », et s'élargit à la question
généralisée : *quelles autres fonctions de cette surface n'ont pas de site
d'appel ?*

## Tâches

- [x] Prouver l'absence de site d'appel sur toute l'histoire (`git log -S` + `git grep` par commit)
- [x] Prouver que `.many` est absente des 4 catalogues
- [x] Établir que le fil de réponses reste atteignable (`MessageMoreSheet` → `onThread` → `ThreadView`)
- [x] Balayer les 6 fichiers `ConversationView*` : 5 fonctions sans site d'appel
- [x] Pour chacune, établir le mécanisme VIVANT qui la remplace avant de retirer
- [x] Retirer les 5 fonctions, avec épitaphes au style du dépôt
- [x] Retirer `ConversationViewModel.replyCountMap` + son invalidation
- [x] Retirer `scrollState.highlightedMessageId` (écrivain unique retiré, aucun lecteur)
- [x] Excision **textuelle** des 3 clés orphelines (leçon 242i : jamais par re-sérialisation)
- [x] Bannir les 2 clés plates dans `EngagementCountConsolidationGuardTests` + solder son « N'ATTRAPE PAS »
- [x] Écrire `ConversationSurfaceReachabilityGuardTests` (5 tests, dont 3 d'auto-garde)
- [x] **Mesurer les faux positifs** de la garde → `frameworkInvoked` (conformances de protocole)
- [x] Prouver RED sur `origin/main` (5 signalées) et GREEN sur la branche (0)
- [x] Rejouer `check_localization.py`, orphelines, JSON, équilibre de parenthèses
- [x] Analyse + plan + tracking

## Hors périmètre, et pourquoi

| écarté | raison |
|---|---|
| Monter une pastille de réponses | **question produit**, pas dette i18n. Simulateur + arbitrage (leçon 238i) |
| `buildNativeMessageMenu` | code mort tenu vert par une garde de source ; « menu natif iOS 26 » peut être un chemin à venir |
| Les 7 `String(format: "%d:%02d", …)` | contextes différents (appel / compte à rebours / média) |
| Toute clé i18n neuve | le lot n'en ajoute aucune — il en retire 3 |

## Gate

Aucune toolchain Swift sous Linux ⇒ gate réel = CI **`iOS Tests`** (opt-in
` — run test`). Tous les contrôles ci-dessus rejoués déterministement hors Swift ;
tableau complet dans l'analyse.
