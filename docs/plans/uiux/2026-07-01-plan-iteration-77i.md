# Plan — Iteration 77i (2026-07-01) — iOS i18n `SharePickerView`

## Objectif
Localiser toutes les chaînes visibles français-en-dur de `SharePickerView.swift`, en
réutilisant les clés SSOT existantes quand elles existent, et compléter le catalogue.

## Base de départ
`main` HEAD `5f95e77` (resync avant démarrage ; branche `claude/upbeat-euler-79v8sr`).

## Étapes
1. [x] Repérer tous les littéraux visibles (titre, bouton fermer, labels contenu, preview,
   placeholder recherche, empty state, labels de type, toasts, payload story).
2. [x] Vérifier le SSOT : `conversation.type.*` (existant, utilisé par `GlobalSearchView`),
   `common.close` (existant). Repérer la clé manquante `conversation.type.broadcast`.
3. [x] Ajouter 14 clés à `Localizable.xcstrings` ×5 langues (de/en/es/fr/pt-BR) :
   `conversation.type.broadcast` + 13 `share.*`. Format Xcode préservé
   (`json.dumps(..., separators=(',',' : '))`, sans `extractionState` = clés extraites du code).
4. [x] Migrer `SharePickerView.swift` :
   - `navigationTitle` → `share.picker.title`
   - `Button("Fermer")` → `common.close`
   - `contentLabel` → `share.content.*`
   - `contentPreview` → `share.preview.*` (interpolation `%@` pour story)
   - `TextField` placeholder → `share.search.placeholder`
   - `EmptyStateView.title` → `share.empty`
   - `conversationTypeLabel` → `conversation.type.*` (SSOT `GlobalSearchView`)
   - 2× toast → `share.error`
   - payload story → `share.story.shareText` (interpolation `%1$@`/`%2$@`)
5. [x] Vérifier absence de résidu français hors `String(localized:)` (grep).
6. [ ] Commit + push branche + PR ; gate = CI `ios-tests.yml` (compile Xcode 26.1 + tests 18.2).
7. [ ] Merge dans `main` après CI verte ; supprimer la branche ; mettre à jour branch-tracking.

## Risques / points d'attention
- **SSOT** : réutiliser exactement les clés `conversation.type.*` de `GlobalSearchView` évite la
  divergence. L'ajout de `conversation.type.broadcast` change le rendu EN/ES/DE/pt-BR de
  `GlobalSearchView` (avant : `defaultValue` fr "Communication") → **amélioration**, pas régression.
- **Interpolation** : pattern `String(format: String(localized:defaultValue:bundle:), args)` déjà
  éprouvé dans le codebase (positional `%1$@`/`%2$@` pour 2 args).
- Pas de test neuf : swap mécanique, helpers `private` couplés à la View, couverture = compile CI.

## Vérification finale
- [x] `grep` : 0 littéral français visible hors `defaultValue` d'un `String(localized:)`.
- [x] JSON `Localizable.xcstrings` valide (roundtrip Python).
- [ ] CI `ios-tests.yml` verte.
