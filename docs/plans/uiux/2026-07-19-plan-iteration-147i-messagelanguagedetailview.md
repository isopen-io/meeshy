# Plan — Itération 147i : `MessageLanguageDetailView` (a11y VoiceOver)

**Date** : 2026-07-19 · **Piste** : iOS (`i`) · **Base** : `main` HEAD (`efedb69e4`) ·
**Branche** : `claude/laughing-thompson-lknori` · **Gate** : CI `iOS Tests`

## Objectif
Corriger les défauts d'accessibilité VoiceOver de l'explorateur de langues du Prisme Linguistique
(vue « Langue » du `MessageMoreSheet`), fichier jamais traité par les ~146 itérations précédentes.
Aucune migration Dynamic Type nécessaire (le fichier utilise déjà des styles de texte).

## Étapes
1. [x] Sync `main` (HEAD `efedb69e4`), repartir la branche assignée depuis `origin/main` (146i/#1978 mergée).
2. [x] Identifier une surface fraîche via scan sous-agent (icône-seule sans label, hero décoratif sans hidden).
3. [x] `xmark.circle.fill` (fermer traduction) → `.accessibilityLabel(common.close)`.
4. [x] `arrow.clockwise` (retraduire) → `.accessibilityLabel(message-detail.retranslate)`.
5. [x] `text.bubble.fill` + `waveform` ×2 (décoratifs) → `.accessibilityHidden(true)`.
6. [x] `checkmark`/`chevron` de rangée (×2) → `.accessibilityHidden(true)`.
7. [x] Bouton de rangée → `.accessibilityAddTraits(isSelected ? .isSelected : [])` (repère de sélection non-couleur).
8. [x] Rédiger analyse + plan (`docs/analyses/uiux/`, `docs/plans/uiux/`).
9. [ ] Commit + push sur la branche assignée.
10. [ ] Ouvrir la PR ; mettre à jour `branch-tracking.md` après merge CI vert.

## Contraintes respectées
- 1 fichier `.swift`, 0 logique, 0 mutation d'état, 0 test neuf.
- 1 clé i18n neuve (`message-detail.retranslate`, `defaultValue` inline — famille existante).
- `common.close` réutilisée (précédent 146i).
- Patterns a11y déjà présents ailleurs dans le codebase → compile OK.
- Pas de dépendance à la couleur seule (trait `.isSelected` remplace le glyphe checkmark masqué).

## Revue
Voir la section « Corrections appliquées » et « Statut » de
`docs/analyses/uiux/2026-07-19-iteration-147i-messagelanguagedetailview.md`.
Défauts a11y réels (2 boutons icône-seule non labellisés) corrigés dans une feature documentée et à fort
trafic (Prisme Linguistique). Un staff engineer approuverait : additif, minimal, non-régressif, complet
(masquage + repère de sélection sémantique).
