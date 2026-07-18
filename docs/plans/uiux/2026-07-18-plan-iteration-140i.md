# Plan — Itération 140i (iOS) : Dynamic Type + VoiceOver `MessageViewsDetailView` (empty/error states)

**Piste** : iOS (suffixe `i`). Base = `main` HEAD `aee4798` (post-#2019).
**Branche** : `claude/laughing-thompson-4bs06w`.
**Gate** : CI `iOS Tests` (SwiftUI ne compile pas sous Linux → CI seule autorité).

## Objectif
Rendre les sous-vues d'**état vide** et d'**erreur** de `MessageViewsDetailView.swift` conformes **Dynamic Type**, sans changer layout par défaut, logique, palette ni chaînes i18n. Sibling de la traîne `.system(size:)` fixe des itérations 135i–139i.

## Étapes
1. [x] Resync branche sur `main` HEAD (post-#2019 `aee4798`) — repart de main propre.
2. [x] Vérifier collision : aucune PR iOS ouverte ne touche `MessageViewsDetailView` → numéro **140i**.
3. [x] Migrer 2/2 `.font(.system(size: 28, weight: .light))` → `MeeshyFont.relative(28, weight: .light)` (icônes d'état vide + erreur ; scalent en phase avec le `.footnote` sous elles).
4. [x] VoiceOver : `.accessibilityHidden(true)` sur les 2 icônes illustratives décoratives → seul le libellé porteur de sens est lu.
5. [x] Confirmer que les 7 autres fonts (`.system(.caption*, design: .monospaced)`) sont déjà scalables → intacts.
6. [x] Docs analyse + plan + `branch-tracking.md`.
7. [ ] Commit + push + PR ; attendre CI verte ; merger dans `main` ; supprimer la branche.

## Contraintes respectées
- 1 seul fichier de production touché → orthogonal, aucun conflit attendu.
- 0 logique / 0 clé i18n / 0 test neuf (parité doctrine sweep).
- `import MeeshyUI` déjà présent → aucun import ajouté.
- SDK non touché.

## Différé (candidats futurs)
- `ConversationBackgroundComponents` (2 glyphes 16pt bornés par cercles fixes → gel doctrine 86i).
- `StoryExpiredContent` (2 glyphes hero 64/56pt → gel doctrine 84i).
- `StatsTimelineChart` (2 labels d'axe Charts 9pt → migrables avec prudence).
- `StoryViewerView+Content` (⚠️ i18n historique + `@State private` cross-file).
