# Plan Itération 164i — `InviteFriendsSheet` VoiceOver

**Date** : 2026-07-18 · **Piste** : iOS · **Base** : `main` HEAD `7ad6e3e` ·
**Branche** : `claude/laughing-thompson-rn6mfv` · **Gate** : CI `iOS Tests`

## Objectif
Combler la lacune VoiceOver du résumé d'options : les permissions actives (Messages/Images/
Fichiers/Historique) sont portées **par icône + couleur seule** → invisibles/muettes pour VoiceOver.

## Étapes
1. [x] Resync `main` HEAD + branche fraîche.
2. [x] `optionsSummary` : `.accessibilityElement(children: .ignore)` + `.accessibilityLabel`
   composé (`optionsSummaryAccessibilityLabel`) — expiration + liste des permissions actives via
   `ListFormatter.localizedString(byJoining:)`, réutilisant les clés `invite.perm.*` existantes ;
   cas vide géré. 3 clés `.a11y` neuves (code-only, 0 xcstrings).
3. [x] En-tête de conversation : `.accessibilityElement(children: .combine)` + `.accessibilityHidden`
   sur glyphe avatar décoratif et séparateur « · ».
4. [x] Vérif : braces équilibrées, 4 `.system(size:)` figés inchangés, docs + tracking.
5. [ ] Commit + push + PR.

## Non-régression
1 fichier, 0 logique, 0 changement visuel, 0 test neuf. Dynamic Type déjà soldé 76i.
