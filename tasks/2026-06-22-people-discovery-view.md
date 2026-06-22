# Vue "Découverte d'utilisateurs Meeshy" + simplification tab Contacts (iOS)

## Contexte
Le hub People iOS (`ContactsHubView`) a 3 tabs primaires (Appels / Clavier / Contacts).
Le tab **Contacts** (`ContactsSection`) nichait 4 sous-tabs : Tous / Demandes / Découvrir / Bloqués.
→ Trop de sous-tabs rendent la vue inexploitable.

## Objectif
- Le sous-onglet **Contacts** ne garde que l'annuaire (filtres `ContactFilter` : Tous / En ligne / Hors ligne / Répertoire / Affiliés).
- Déplacer **Demandes / Découvrir / Bloqués** dans une nouvelle vue **Découverte d'utilisateurs Meeshy**.
- Ajouter un bouton dans le **menu flottant** (menu ladder de `RootView`) pour ouvrir cette vue.

## Plan
- [x] `ContactsShared.swift` : remplacer enum `ContactsTab` par `DiscoveryTab` (requests/discover/blocked).
- [x] `Router.swift` : `case contacts` (sans param) + `case peopleDiscovery(DiscoveryTab = .requests)`; isHub + displayTitle.
- [x] Repurposer `ContactsSection.swift` → `PeopleDiscoveryView.swift` (full-screen : CollapsibleHeader + sous-tabs + content). Renommer dans pbxproj.
- [x] `ContactsHubView.swift` : tab Contacts → `ContactsListTab` direct (annuaire), suppression du sous-tab bar.
- [x] `RootView.swift` : route `.peopleDiscovery` + nouvel item de menu flottant "Découvrir" (badge demandes).
- [x] `iPadRootView+Panels.swift` : route `.peopleDiscovery`.
- [x] `ProfileView.swift` : `.contacts(.requests)` → `.peopleDiscovery(.requests)`.
- [x] Tests : `TabNavigationTests`, `RouterTests`.

## Note environnement
Le build iOS (`./apps/ios/meeshy.sh`) nécessite macOS — non exécutable dans cet environnement Linux distant.
Les changements sont écrits avec soin + tests unitaires mis à jour ; la vérification build/test doit se faire sur macOS.

## Review
(à compléter)
