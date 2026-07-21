# Plan Iteration-205i — ContactsListTab: native `EmptyStateView` dedup

## Objectif
Remplacer l'état vide fait-main de `ContactsListTab` par le composant réutilisable
`EmptyStateView` (`MeeshyUI/Primitives`), pour l'aligner sur ses onglets frères
`CallsTab` (`EmptyStateView` l. 75) et `BlockedTab` (`EmptyStateView` l. 114).

## Fichier
- `apps/ios/Meeshy/Features/Contacts/ContactsListTab.swift` (1 fichier)

## Étapes
1. [x] Sync `main`, brancher `claude/laughing-thompson-y9a66z` depuis `origin/main`.
2. [x] Vérifier collision essaim (`list_pull_requests`) → 0 sur `ContactsListTab`.
3. [x] Remplacer `emptyState` `VStack` → `EmptyStateView(icon: "person.2.slash", title: <ternaire existant>, subtitle: "")`.
4. [x] Réutiliser clés i18n existantes `contacts.list.empty` / `contacts.list.no-results` (0 clé neuve).
5. [x] `import MeeshyUI` déjà présent — rien à ajouter.
6. [x] Rédiger analyse + plan.
7. [ ] Commit + push + PR.

## Contraintes
- 0 logique, 0 réseau, 0 clé i18n neuve, 0 test neuf.
- Contenu visible préservé (icône + titre), `subtitle: ""` ⇒ pas de sous-titre rendu.
- Changement cosmétique assumé : icône teintée accent indigo + animation spring, en
  parité stricte avec `CallsTab` / `BlockedTab`.

## Gate
- CI `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2, run simu iOS 18.2). Pas de
  toolchain Swift en local → vérification par inspection + parité API.
