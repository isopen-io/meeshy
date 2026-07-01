# Plan — Itération 95i (iOS) : `CommunityLinkDetailView`

**Base** : `main` HEAD (`8ecbeb5f`) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + VoiceOver + sélection de contenu (doctrine 86i/91i)
**Gate** : CI `iOS Tests`

## Objectif

Rendre `CommunityLinkDetailView` conforme aux features iOS naturelles (Dynamic Type,
VoiceOver, sélection/copie) tout en préservant le style Meeshy existant (accent communauté
déterministe, gradients de surface). Épuration : aucune surcharge ajoutée, sweep ciblé.

## Détail par site (10 `.font(.system(size:))`)

| # | Ligne | Avant | Action |
|---|-------|-------|--------|
| 1 | header glyphe | `.system(size: 26)` (cercle fixe 60×60) | **FIGÉ** + `.accessibilityHidden` + commentaire |
| 2 | `link.name` | `.system(size: 20, weight: .bold)` | `MeeshyFont.relative(20, weight: .bold)` |
| 3 | `link.joinUrl` | `.system(size: 12, design: .monospaced)` | `relative(12, design: .monospaced)` + `.textSelection` |
| 4 | icône action | `.system(size: 22)` (cadre fixe 52×52) | **FIGÉ** + `.accessibilityHidden` + commentaire |
| 5 | libellé action | `.system(size: 10, weight: .medium)` | `relative(10, weight: .medium)` |
| 6 | icône stat | `.system(size: 22)` (inline, pas de cadre fixe) | `relative(22)` + `.accessibilityHidden` |
| 7 | valeur stat | `.system(size: 22, weight: .bold)` | `relative(22, weight: .bold)` |
| 8 | libellé stat | `.system(size: 12)` | `relative(12)` |
| 9 | label infoRow | `.system(size: 14)` | `relative(14)` |
| 10 | valeur infoRow | `.system(size: 13, weight: .medium)` | `relative(13, weight: .medium)` + `.textSelection` |

## A11y VoiceOver (en plus)

- `communityStatCard` → `.accessibilityElement(children: .combine)`
- `infoRow` → `.accessibilityElement(children: .combine)`
- Titre section INFORMATIONS → `.accessibilityAddTraits(.isHeader)`

## Règles respectées

1. Glyphes dans cadre de dimension fixe (60×60, 52×52) → figés (débordement sinon) + masqués VoiceOver.
2. Weight & `design: .monospaced` préservés à chaque conversion.
3. Palette accent/sémantiques déjà conforme → non touchée.
4. 1 fichier, 0 logique, 0 clé i18n, 0 test neuf.

## Étapes

1. [x] Éditer `CommunityLinkDetailView.swift` (8 conversions + 2 gels + a11y + textSelection).
2. [x] Vérifier : 2 `.system(size:)` restants (figés commentés), 8 `MeeshyFont.relative`.
3. [ ] Commit + push sur `claude/upbeat-euler-s5qysh`.
4. [ ] Ouvrir PR, attendre CI `iOS Tests` verte.
5. [ ] Merger dans `main`, supprimer la branche, mettre à jour `branch-tracking.md`.

## Suite (96i+)

Candidats restants (hors surfaces essaim en vol) : `MessageOverlayMenu` (21, Glass + Dynamic Type,
lot dédié), `ConversationView+Composer` (22, lot prudent), `FeedView+Attachments` (14),
`AudioFullscreenView` (7) ; audit palette hexes proches ; adoption Liquid Glass ciblée.
