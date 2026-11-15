# Plan — Itération 274 : témoin de parité couleur de présence

## Objectifs

Fermer le trou « N miroirs, zéro témoin » sur la COULEUR de présence (la moitié
palette de la règle 1/3/5), jumeau du témoin de barème temporel livré en
itération 270. Aucune modification de production.

## Modules affectés

- **Ajout** : `packages/shared/__tests__/presence-color-mirror-parity.test.ts`.
- **Lecture seule** (jamais modifiés) : `utils/user-presence.ts` (SSOT),
  `MeeshyColors.swift`, `PresenceStyle.swift`, `MeeshyPalette.kt`,
  `MeeshyAvatar.kt`, `apps/web/lib/user-status.ts`.

## Phases d'implémentation

1. **RED prouvé** — écrire le témoin, puis injecter cinq dérives (teinte iOS,
   teinte Android, nuance web, câblage iOS, câblage Android) et vérifier que
   chacune rougit ; revert.
2. **GREEN** — état d'origine : 12/12 verts.
3. **Non-régression** — suite `packages/shared` complète.

## Dépendances

`PRESENCE_HEX` (déjà exporté par `utils/user-presence.ts`). Aucune nouvelle
dépendance ; la palette Tailwind par défaut (emerald-400/amber-400/gray-400) est
encodée dans le test comme table stable, déjà affirmée par le doc-comment de
`user-status.ts`.

## Risques estimés

Nul côté production. Le témoin lit les sources comme texte via des regex ancrées
sur la forme de chaque déclaration ; un refactor de forme (renommage, extraction
de constante) lève un message d'erreur explicite (« la déclaration a-t-elle
changé de forme ? ») plutôt qu'un faux positif silencieux.

## Stratégie de rollback

Suppression du fichier de test — aucun impact runtime.

## Critères de validation

- 12/12 verts sur l'état d'origine.
- Cinq contre-épreuves rougissent (prouvé).
- `packages/shared` : 111 fichiers / 2662 tests verts.
- CI verte après push.

## Statut de complétion

- [x] Phase 1 (RED prouvé sur les cinq dérives)
- [x] Phase 2 (GREEN — 12/12)
- [x] Phase 3 (suite complète verte, 2662)
- [ ] Merge dans `main`

## Suivi de progression

Livré sur `claude/brave-archimedes-tgh73l`.

## Améliorations futures

- Recensement des règles à N miroirs de CLAUDE.md encore sans témoin de parité :
  `resolveLastMessagePreview` (en cours — PR #3619), familles AUDIO et
  POSTS/COMMENTAIRES du Prisme.
- Étendre le témoin couleur au `PRESENCE_BADGE_CLASS` web (mêmes nuances, forme
  `bg-…/hover:bg-…`) si un badge de présence natif iOS/Android apparaît un jour
  avec sa propre couleur — aujourd'hui seul le dot est cross-plateforme.
