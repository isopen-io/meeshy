# Plan — Iteration-231i : `forward.members-count`, pluriel au catalogue

**Analyse** : `docs/analyses/uiux/2026-08-20-iteration-231i-forward-members-count-plural.md`
**Base** : `main` HEAD `65af14d5` · **Branche** : `claude/intelligent-noether-kana7q` (re-lancée fraîche)

## Objectif

Sortir la règle plurielle de la chaîne du catalogue et remonter la
correction au bon endroit — un helper pur, testable et locale-conscient.

## Étapes

- [x] Resync sur `origin/main` HEAD `65af14d5` (post-merge 230i + follow-up `65af14d5`) ; numéro 231i choisi strictement au-dessus du plus haut mergé (230i) ; collision essaim vérifiée (`list_pull_requests` = 0 PR iOS ouverte).
- [x] Confirmer que le défaut survit à la restructuration du picker (Volet A.8 / `dcfb4ec3`) : `ForwardPickerRow.memberCount` toujours là, site d'appel toujours au même endroit, clé catalogue inchangée.
- [x] Catalogue : convertir `forward.members-count` de `stringUnit` (7 locales flat) à `variations.plural` (2 formes en de/en/es/fr/it/pt-BR, 6 formes en ar). Idiome ratifié par `message-detail.views.not-seen.count` et 11 autres entrées.
- [x] Extraire helper pur statique `ForwardPickerRow.membersCountLabel(_:bundle:locale:)` (idiome `PostStatAccessibility`). Bundle / locale par PAIRE, `String(format:locale:_:)` pour que la locale du test choisisse la règle plurielle.
- [x] Mettre à jour le site d'appel unique (`ForwardPickerSheet.swift:457`).
- [x] Ajouter `ForwardPickerMembersCountLabelTests` — 11 tests : singulier + pluriel dans les 6 locales latines/germanique, régression explicite du défaut FR, garde globale « singulier ≠ pluriel ».
- [x] Ajouter les 4 entrées `pbxproj` pour le fichier neuf (PBXBuildFile, PBXFileReference, group children Components/, MeeshyTests sources phase) — leçon apprise de 230i où `65af14d5` a dû patcher la main manuellement.
- [x] Documenter analyse + plan + pointeur de tracking.
- [ ] Gate réel : CI iOS Tests.

## Non-fait, et pourquoi

- **Autres compteurs de personnes graveurs de pluriel** — `ParticipantsView`
  (utilise déjà `_singular` / `_plural` séparés, fonctionnel mais moins
  idéal), `ConversationListHelpers`, `GlobalSearchView` (concaténation de
  l'unité). Même famille de défaut mais dispersée — mérite son itération
  avec une portée définie.
- **Tap de ligne VoiceOver du picker** — carry-over de 230i, demande
  simulateur.

## Empreinte

| | |
|---|---|
| Fichier production | 1 (`ForwardPickerSheet.swift`) |
| Fichier test | 1 neuf |
| Catalogue | 1 clé convertie flat → `variations.plural` (7 locales) |
| Clés i18n neuves | 0 |
| Fichiers pbxproj | 1 (4 entrées ajoutées) |
| Changement visuel | +1 caractère supprimé pour N=1 dans FR/ES/IT/DE, 4 formes AR correctes atteignables |
| Logique / réseau / SDK | 0 |
