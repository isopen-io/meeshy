# Plan — Itération 82i (iOS)

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`)
**Branche de travail** : `claude/upbeat-euler-9g6l3m` (base = `main` HEAD `dab04886`)
**Gate CI** : `iOS Tests` (`.github/workflows/ios-tests.yml`)

## Objectif

Migrer `ActiveSessionsView` (écran « Sessions actives ») du figé
`.font(.system(size:))` vers le style relatif scalable `MeeshyFont.relative(...)`
pour respecter le réglage Dynamic Type de l'utilisateur sur un écran de sécurité
100 % texte de lecture.

## Pré-vérification anti-collision (contention iOS ~10 agents)

PRs iOS ouvertes au moment de 82i — surfaces PRISES (à éviter) :
- #1185 ConversationLockSheet (81i), #1182 feed composer, #1178 CountryPicker (80i),
  #1176 PrivacySettingsView, #1174 story-viewer i18n (79i), #1172 MessageOverlayMenu i18n,
  #1171 Router titles (79i), #1168 link preview, #1166 semantic colors, #1165
  ConversationDashboard (71i), #1160 InviteFriendsSheet, #1157 quick-action menu,
  #1155/#1137 2FA, #1154 emoji-picker, #1150 voice profile, #1149 Support/Report tints,
  #1148/#1142 VoiceOver FR, #1139 feed comments.
- ✅ **`ActiveSessionsView` n'est prise par aucune de ces PRs** → surface libre.

## Étapes

1. [x] Resync `claude/upbeat-euler-9g6l3m` sur `main` HEAD (`dab04886`).
2. [x] Confirmer le helper `MeeshyFont.relative` (Accessibility.swift:152) et son usage précédent (74i).
3. [x] Swap mécanique 11 sites `.system(size:)` → `MeeshyFont.relative(...)` (weight/design préservés).
4. [x] Conserver figé le site L109 (icône badge géométrie fixe 32×32) — documenté.
5. [x] Rédiger analyse + plan + mettre à jour `branch-tracking.md`.
6. [ ] Commit + push sur la branche de travail.
7. [ ] Ouvrir la PR, attendre CI `iOS Tests` verte.
8. [ ] Merger dans `main`, supprimer la branche, mettre à jour le pointeur autoritaire 83i.

## Risque / test

- Swap purement typographique, aucune logique/couleur/structure touchée. Compile
  risk ≈ 0 (helper public déjà consommé par MeeshyApp.swift & les merges 74i/71i/72i).
- Pas de test neuf : swap littéral→helper sans nouveau comportement (parité 74i).
- Build local impossible (conteneur Linux, pas de Xcode) → gate = CI `iOS Tests`.

## Base de départ 83i

`main` HEAD (toujours resync avant de commencer ; supprimer la branche mergée).
