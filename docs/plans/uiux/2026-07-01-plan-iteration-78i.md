# Plan — Iteration 78i (2026-07-01) — iOS épuration palette sémantique lot 2

## Objectif
Consolider les couleurs sémantiques (erreur / disponible / rôle admin) codées en dur vers les
tokens `MeeshyColors`, en prolongeant la piste palette 69i/70i.

## Base de départ
`main` HEAD `000d167` (post-#1162, resync avant démarrage ; branche `claude/upbeat-euler-j4z44f`).

## Étapes
1. [x] Auditer les `Color(hex:)` sémantiques hors ladders catégoriels
   (`FF6B6B`/`4ADE80`/`3B82F6`/`34B7F1`/`3B82F6`).
2. [x] Vérifier imports `MeeshyUI` + existence des tokens `.error` (`F87171`), `.success`
   (`34D399`), `.info` (`60A5FA`) dans `MeeshyColors.swift`.
3. [x] Swaps littéral → token (`Color`) :
   - `AddParticipantSheet.swift:167` `Color(hex: "FF6B6B")` → `MeeshyColors.error`
   - `AboutView.swift:252` `Color(hex: "4ADE80")` → `MeeshyColors.success`
   - `MemberManagementSection.swift:214` `Color(hex: "3B82F6")` → `MeeshyColors.info`
     (complète le ladder dont `moderator` est déjà `.success`)
4. [x] Laisser le badge creator gold `F8B500` (aucun token « owner gold ») + ladders catégoriels.
5. [ ] Commit + push branche ; gate = CI `ios-tests.yml` (compile Xcode 26.1 + tests 18.2).
6. [ ] Merge dans `main` après CI verte ; supprimer la branche ; mettre à jour branch-tracking.

## Risques / points d'attention
- **Pur swap `Color` → `Color`** : aucune signature ni layout modifié, tokens déjà `public` et
  de type `Color`. Les 3 fichiers importent déjà `MeeshyUI`.
- **Aucune régression sémantique** : `error`/`success`/`info` correspondent exactement à l'intention
  d'origine (erreur/disponible/admin). Rendu dark/light géré par les tokens centraux.
- Pas de test neuf : swap mécanique, couverture = compile CI + smokes structurels existants.

## Vérification finale
- [x] `grep` : plus de `Color(hex: "FF6B6B"|"4ADE80"|"3B82F6")` dans les 3 fichiers.
- [ ] CI `ios-tests.yml` verte.
