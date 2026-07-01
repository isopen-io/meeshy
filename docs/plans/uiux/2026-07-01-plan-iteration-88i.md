# Plan — Iteration 88i (2026-07-01)

## Objectif
Accessibilité du flux destructif `DeleteAccountView` (iOS) : Dynamic Type + VoiceOver.

## Base de départ
`main` HEAD (post-87i, commit `94537e44`). Branche : `claude/upbeat-euler-x74cy3`.

## Périmètre (1 fichier)
`apps/ios/Meeshy/Features/Main/Views/DeleteAccountView.swift`

### Étapes
1. **Dynamic Type (19/20 sites)** — swap mécanique `.font(.system(size:))` →
   `.font(MeeshyFont.relative(size, weight:, design:))`, préservant `weight` et
   `design` (`.monospaced` du TextField de confirmation, `.rounded` du section header).
   Sites : header (chevron 14 + « Retour » 15 + titre 17), message d'erreur 13, carte
   d'avertissement (icône 24 + titre 17 + intro 14 + puce 14 + texte puce 13),
   confirmation (prompt 14 + TextField 14 mono + checkmark 20), bouton destructif
   (trash 14 + texte 15), vue e-mail (titre 20 + corps 15 + bouton 16), helper
   `sectionHeader` (icône 12 + libellé 11 rounded).
2. **Site gardé FIXE** — icône héros `envelope.circle.fill` 64pt (l.268) : commentaire
   d'exception (glyphe décoratif héros, parité 84i/74i).
3. **VoiceOver** —
   - `sectionHeader` helper : `.accessibilityAddTraits(.isHeader)`.
   - Bloc héros e-mail : `.accessibilityElement(children: .combine)`.

### Contraintes
- 0 logique métier modifiée, 0 test neuf (swap présentation + traits déclaratifs).
- `requiredPhrase` FR hardcodée : **NON touchée** (différé i18n/backend, cf. analyse).

## Vérification
Gate = CI `ios-tests.yml` (compile Xcode 26.1.x + simu 18.2). Pas de build Linux.

## Merge
Push branche → PR → CI verte → merge dans `main` → supprimer branche → MAJ pointeur
`branch-tracking.md`.

## Statut : ✅ appliqué
