# Plan — Iteration 69i (2026-06-30)

## Objectif
iOS only. Solder le différé **palette** de `ContactCardView` (hex durs → tokens sémantiques)
et combler la dette **Dynamic Type** (polices figées → styles sémantiques scalables) sur la
carte de contact partagé. Itération bornée (1 fichier app), « logique épurée », continuité
directe de 53i (qui a fait le glass de cette carte et a différé ces deux points).

## Base
- Branche : `claude/upbeat-euler-5s13ta` (resynchronisée sur `main` HEAD `6a32e26`, post-68i/53i).

## Changements

### `apps/ios/.../Components/ContactCardView.swift` (app)
- [x] Icône téléphone `Color(hex: "2ECC71")` → `MeeshyColors.success` (affordance « appeler »).
- [x] Icône email `Color(hex: "3498DB")` → `MeeshyColors.info` (affordance « message »).
- [x] Polices figées `.system(size:)` → styles sémantiques Dynamic Type :
      label `.caption2`, nom `.subheadline`, chevron/icônes `.caption`, valeurs `.footnote`
      (graisses de marque conservées).
- [x] `minimumScaleFactor` (0.85 nom / 0.8 valeurs) pour dégradation élégante aux grandes
      tailles dans la largeur fixe 240pt (pas de casse de layout).
- [x] `accentColor` (cercle/label/stroke) **inchangé** — couleur de marque conversation, pas
      une affordance sémantique.
- [x] Glyphe avatar 18pt fixe **inchangé** (atome décoratif dans cercle 36pt fixe).

## Vérification
- [x] `grep` : 0 test/snapshot ne référence `ContactCardView` → swap sûr.
- [x] A11y structurelle (combine+label+hint) et glass 53i préservés.
- [ ] CI `ios-tests.yml` verte (compile + tests simulateur) — seule vérif de build.

## Merge
- [ ] Push `claude/upbeat-euler-5s13ta`, PR → `main`, merge après CI verte. Supprimer la
      branche. Mettre à jour `branch-tracking.md` (base 70i = main post-merge 69i).
</content>
</invoke>
