# Plan — Iteration 96i (2026-07-01) — NotificationSettingsView (iOS a11y)

## Objectif
Rendre l'écran **Réglages › Notifications** (`NotificationSettingsView.swift`) conforme aux règles
a11y CLAUDE.md : polices Dynamic-Type-aware + VoiceOver correct, sans changer le layout ni la logique.

## Base de départ
- Branche : `claude/upbeat-euler-ed1lfk` (resync sur `main` HEAD `2e2796b` au démarrage).
- Surface disjointe (aucune PR ouverte ne cible ce fichier — cf. anti-repetition check de l'analyse).

## Étapes
1. **Dynamic Type (8 sites)** — `.font(.system(size:))` → `MeeshyFont.relative(size, weight:[, design:])`,
   weight/design préservés :
   - header : chevron Retour (36), libellé Retour (38), titre toolbar (46) ;
   - DnD : champ heure début (203), champ heure fin (214) ;
   - helpers réutilisables : icône en-tête section (310), titre section `.rounded` (313),
     libellé `settingsRow` (350).
2. **2 labels figés + commentés** :
   - label de jour DnD dans pastille 28×28 fixe (245) — doctrine 86i/93i ;
   - glyphe badge `settingsRow` dans badge 28×28 fixe (349) — doctrine 74i/86i + `.accessibilityHidden`.
3. **VoiceOver (3 traits déclaratifs)** :
   - en-tête section : `.accessibilityElement(children: .combine)` + `.accessibilityAddTraits(.isHeader)` ;
   - badge `settingsRow` : `.accessibilityHidden(true)` ;
   - `Toggle` de `notifToggle` : `.accessibilityLabel(title)` (comble le trou « activé/désactivé »
     sans nom de réglage).

## Contraintes
- 1 seul fichier touché (`NotificationSettingsView.swift`).
- 0 logique modifiée, 0 clé i18n neuve, 0 test neuf (sweep présentation + traits déclaratifs).
- Couleurs déjà tokenisées → 0 swap palette.
- Style visuel préservé (aucun changement de rendu à Dynamic Type par défaut).

## Vérification
- Gate = CI `ios-tests.yml` (compile Xcode 26.1.x + tests simulateur 18.2).
- Local : `grep '.system(size:'` doit ne laisser que les 2 sites figés commentés (245, 349).

## Merge
- Après CI verte : merge dans `main`, suppression de la branche, mise à jour de
  `docs/plans/uiux/branch-tracking.md` (pointeur 96i → base 97i).

## Hors-scope (différé 97i+)
- Touch targets pastilles DnD 28×28 (< 44×44 HIG) → lot layout dédié.
- Autres grandes surfaces Dynamic Type (cf. analyse § Différé prioritaire).
