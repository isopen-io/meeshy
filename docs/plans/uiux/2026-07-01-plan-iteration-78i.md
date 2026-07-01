# Plan — Iteration 78i (2026-07-01)

## Objectif
Rendre le composeur de post du feed (`FeedView+Attachments.swift`) compatible **Dynamic Type** :
16 polices texte/icônes-inline figées `.system(size:)` → styles sémantiques scalables. Laisser
fixes les icônes décoratives à frame fixe (badges/vignettes/toolbar).

## Base
- Branche : `claude/upbeat-euler-yj1n54` resync sur `main` HEAD `ea749a8a`.
- Surface disjointe des PRs iOS en vol (vérifié `list_pull_requests`).

## Étapes
1. [x] Analyse → `docs/analyses/uiux/2026-07-01-iteration-78i.md`
2. [x] Plan (ce fichier)
3. [ ] Éditer `FeedView+Attachments.swift` — 13 labels texte + 3 icônes inline (voir tableau
   d'analyse), + `minimumScaleFactor(0.8)` sur les 2 labels de vignette contraints en largeur
4. [ ] Vérif : aucun `@State private` touché (fichier extension) ; icônes décoratives à frame
   fixe intactes
5. [ ] Commit + push `claude/upbeat-euler-yj1n54`
6. [ ] PR → CI `ios-tests.yml` verte
7. [ ] Merge dans `main`, supprimer la branche, mettre à jour `branch-tracking.md`

## Mapping (source de vérité)
Voir tableau dans l'analyse. Styles : `.caption2`(10/11) `.caption`(12) `.footnote`(13/14 icône)
`.subheadline`(14/15) `.headline`(16 titre) `.body`(17). Poids préservés via `.weight(...)`.

## Risque
- Compile-risk faible : `Font.caption2.weight(.medium)` etc. sont des formes valides.
- Layout : les labels de vignette (`.frame(width:)` + `.lineLimit(1)`) truncateraient aux très
  grandes tailles → `minimumScaleFactor(0.8)` amortit (précédent 69i `ContactCardView`).

## Gate CI
`ios-tests.yml` (compile Xcode 26.1.x + tests simu 18.2). Pas de test neuf (changement de
présentation pur).
