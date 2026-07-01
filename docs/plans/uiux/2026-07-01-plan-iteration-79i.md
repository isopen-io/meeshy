# Plan Itération 79i — Dynamic Type `FeedView+Attachments.swift`

**Date** : 2026-07-01 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `2261ca0f`
**Branche** : `claude/upbeat-euler-szzmyg` · **Gate** : CI `iOS Tests`

## Objectif
Accessibilité Dynamic Type du composer de feed avec pièces jointes : migrer les tailles de police
figées `.font(.system(size:))` vers le helper scalable `MeeshyFont.relative(size, weight:)` sur le
texte de lecture et les glyphes inline appariés, en préservant les décoratifs à géométrie fixe.

## Étapes
1. [x] Sync `main` HEAD, resync branche assignée, vérifier PRs iOS ouvertes (surface orthogonale).
2. [x] Lire `FeedView+Attachments.swift` + doctrine `MeeshyFont.relative` (Accessibility.swift).
3. [x] Classer les 30 sites : 16 convertis (texte + inline), 14 figés (décoratifs / fixes).
4. [x] Appliquer les swaps 1:1 (weight préservé).
5. [x] Vérifier compte : 16 relative / 14 system(size) figés = décoratifs attendus.
6. [x] Documenter analyse + différés.
7. [ ] Commit, push, PR, attendre CI verte.
8. [ ] Merge dans `main`, supprimer branche, mettre à jour `branch-tracking.md` (pointeur → 80i).

## Contrainte
- iOS EXCLUSIF. 1 seul fichier. Aucun changement de logique / layout / couleur.
- Pas de build local (env Linux) → gate CI `iOS Tests`.

## Review (à compléter après merge)
- Résultat : swap typographique pur, 16 sites Dynamic-Type-aware, 14 décoratifs documentés figés.
