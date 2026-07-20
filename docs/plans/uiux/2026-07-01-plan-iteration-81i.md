# Plan — Iteration 81i (2026-07-01)

## Objectif
Rendre `ConversationLockSheet` production-grade : **i18n complète** (fin du gel français),
**a11y** (bouton supprimer nommé), **Dynamic Type** (titre/sous-titre scalables). Borné à
1 fichier de production + le catalogue.

## Base
- Branche de travail : `claude/upbeat-euler-q0vhy6`
- Base = `main` HEAD `d627b28b` (post web iter 57 #1181). Resync effectué avant démarrage.
- Gate = CI `ios-tests.yml` (compile Xcode 26.1.x + tests simu 18.2).

## Étapes
1. [x] Scan surfaces iOS non prises (via `list_pull_requests` + Explore agent) → choix
   `ConversationLockSheet` (cluster i18n + a11y + Dynamic Type, app-side, aucune PR en vol).
2. [x] Ajouter 28 clés `conversation.lock.*` ×5 langues (de/en/es/fr/pt-BR) dans
   `apps/ios/Meeshy/Localizable.xcstrings` — insertion chirurgicale (séparateurs Xcode `" : "`,
   ordre préservé, 980 insertions / 0 suppression).
3. [x] `titleText` / `subtitleText` → `String(localized:defaultValue:bundle:)` ;
   variantes interpolées → `String(format:…, conversationName)` (placeholder `%@`).
4. [x] Erreurs → 4 propriétés calculées `err*` localisées, remplaçant les 9 littéraux
   `shakeAndReset("…")`.
5. [x] Bouton supprimer : `accessibilityLabel` (`conversation.lock.a11y.delete`) +
   `.disabled(currentPin.isEmpty)`.
6. [x] Titre `.system(size:18,.bold)` → `.headline` (+ center) ; sous-titre `.system(size:13)`
   → `.footnote.weight(.medium)`.
7. [x] Vérifs : 28/28 clés présentes au catalogue ; braces/parens équilibrés ; 0 littéral FR
   restant hors `defaultValue:`.
8. [ ] Commit + push `claude/upbeat-euler-q0vhy6`.
9. [ ] PR → attendre CI `ios-tests.yml` verte.
10. [ ] Merge dans `main` après CI verte ; MAJ `branch-tracking.md` (pointeur iOS → 82i base main HEAD) ; supprimer la branche mergée.

## Risques / mitigations
- **SwiftUI ne compile pas sous Linux** → validation via CI. Mitigation : édition mécanique,
  pattern `String(localized:defaultValue:bundle:)` déjà éprouvé (77i), équilibrage braces vérifié.
- **Churn catalogue** : évité en respectant le format Xcode exact (`" : "`, ordre des clés).
- **Régression a11y `.disabled`** : le bouton était déjà no-op quand vide → désactiver ne change
  pas le comportement fonctionnel, améliore la sémantique.

## Non-objectifs (différés)
- `AddParticipantSheet`, `MemberManagementSection`, `ForwardPickerSheet`, `CrashReportSheet`,
  SDK `VideoEditorCaptionsPanel` (candidats repérés — itérations dédiées).
- Detents adaptatifs Dynamic Type (lot transverse sheets).
