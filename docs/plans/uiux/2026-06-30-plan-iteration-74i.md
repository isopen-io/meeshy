# Plan — Itération 74i (Dynamic Type `ConversationDashboardView`)

**Piste** : iOS · **Base** : `main` HEAD · **Branche** : `claude/upbeat-euler-uxvnw0`

## Objectif
Rendre le tableau de bord de conversation entièrement scalable avec Dynamic Type (a11y),
en finissant le différé « Dynamic Type grandes surfaces » (candidat #1 « 43 » depuis 53i/54i/55i).

## Étapes
1. [x] Resync branche sur `main` HEAD ; vérifier compile iOS débloquée (ReplyThreadOverlay retiré).
2. [x] Vérifier l'absence de PR ouverte touchant `ConversationDashboardView` (orthogonalité — 71i/72i/73i sur d'autres fichiers).
3. [x] Convertir les **35** sites de **texte de lecture + glyphes inline** `.font(.system(size:))` → `MeeshyFont.relative(size, weight:, design:)` (weight/design préservés).
4. [x] Garder **8** sites figés (documentés) : guillemet hero 48, axes de graphe ×2 (9), icône état vide 24, émoji sentiment 22, `StatRing` ×2 (14/9, anneau 60×60), `ArcGauge` 34.
5. [x] Vérif statique : 35 `MeeshyFont.relative` + 8 `.system(size:` restants = 43.
6. [x] Docs analyse + plan + `branch-tracking.md` (History append-only + pointeur iOS).
7. [ ] Commit + push + PR ; merge dans `main` quand CI `iOS Tests` verte.

## Risque
**Faible.** Swap typographique mécanique iso-weight/iso-design, identique en nature aux itérations
55i/71i/72i déjà mergées. Aucune logique métier, calcul de stat, requête ou rendu de graphe touché.

## Gate
CI `iOS Tests` (compile Xcode 26.1.x + simu 18.2). `Test Python (translator)` éventuellement rouge =
pré-existant/orthogonal (aucun `.py` touché).
