# Plan — Iteration-234i : consolidation du compteur de membres

**Analyse** : `docs/analyses/uiux/2026-08-21-iteration-234i-members-count-consolidation.md`
**Base** : `main` HEAD `3e64afaa` · **Branche** : `claude/intelligent-noether-z3vjqg`

## Thèse

231i et 232i ont corrigé **le même défaut deux fois**, chacune sur sa clé, sans
retirer la cause : trois clés de catalogue et deux helpers jumeaux rendaient un
seul et même libellé. La troisième occurrence existait déjà (quatre
concaténations `"\(count) " + unit.members`) et échappait aux deux itérations.

## Étapes

1. **`MembersCountLabel`** — namespace `enum` neuf, motif `PostStatAccessibility`
   (`bundle`/`locale` par paire). Une entrée `text(_:capped:bundle:locale:)`.
2. **Catalogue** — `conversation.info.members-count` → `conversation.members-count`
   (valeurs inchangées) ; `forward.members-count` supprimée ; `unit.members`
   conservée pour la seule branche plafonnée.
3. **Puce du picker** — sortie des 13 formes localisées, rendue par la vue en
   `Text(verbatim:)` + `.accessibilityHidden(true)` (doctrine 223i). Police et
   couleur hissées sur le `HStack` (3 modificateurs dupliqués retirés).
4. **Six sites** rebranchés sur le helper ; gardes produit (`> 2`,
   `type != .direct`) conservées telles quelles.
5. **Tests** — les 2 suites jumelles fusionnent en `MembersCountLabelTests`
   (19 assertions) : toutes les régressions antérieures conservées, plus la
   puce et la branche plafonnée.
6. **pbxproj** — 2 fichiers retirés, 2 ajoutés (4 entrées chacun).

## Empreinte

| Catégorie | Delta |
|---|---|
| Fichiers prod | 5 modifiés, 1 neuf |
| Suites de test | 2 → 1 (19 assertions) |
| Clés i18n | −1 supprimée, 1 renommée, **0 neuve** |
| Logique / réseau / SDK | 0 |
| Changement visuel | puce du picker : ±4 pt d'écart |

## Gate

CI `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2, run simu iOS 18.2). Aucune
toolchain Swift sous Linux — contrôles locaux : round-trip catalogue octet pour
octet, greps de fermeture, équilibre syntaxique, revue des gardes i18n
existantes. Détail dans l'analyse.
