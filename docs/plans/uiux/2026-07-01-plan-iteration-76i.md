# Plan Itération 76i — Dynamic Type `InviteFriendsSheet` (iOS)

**Date** : 2026-07-01 · **Piste** : iOS · **Base** : `main` HEAD `7d960fb`

## Objectif

Rendre `InviteFriendsSheet.swift` accessible au Dynamic Type en migrant ses 33 tailles
de police codées en dur vers l'helper scalable `MeeshyFont.relative(...)`, sans changer
layout/couleurs/logique/copie. Continuité de 54i (`GlobalSearchView`) et 55i
(`ConversationInfoSheet`).

## Anti-collision (vérifié)

`list_pull_requests` open (18 PR) : `InviteFriendsSheet` absent de toutes.
Surfaces iOS en vol évitées : 2FA (#1137/#1155), feed comments (#1139), dashboard
(#1145), voice profile (#1150), emoji-picker (#1154), quick-action (#1157), Support/Report
(#1149), VoiceOver labels (#1142/#1148). Numéro d'itération : **76i** (> 75i en vol).

## Étapes

1. [x] Repérer les 33 `.font(.system(size:))` (grep).
2. [x] Classer : texte + icônes inline → convertir ; icônes en conteneur fixe → figer.
3. [x] Convertir 29 occurrences → `MeeshyFont.relative(N, weight:, design:)` (map 1:1).
4. [x] Garder 4 icônes figées (108 toolbar, 131 avatar 44pt, 492/526 tuiles 32pt) +
       commentaire d'exception.
5. [x] Vérifier : 4 `.system(size:)` restants (tous commentés), 29 `MeeshyFont.relative`,
       0 test couplé.
6. [ ] Commit + push sur `claude/upbeat-euler-37k8i5`.
7. [ ] PR, attendre CI verte (`ios-tests.yml`), merger dans `main`.
8. [ ] MAJ `branch-tracking.md` (76i mergée, base 77i = main HEAD, supprimer la branche).

## Risques

- **Overflow d'icône** à grand Dynamic Type si on scale un glyphe en frame fixe → écarté
  en gardant les 4 icônes de conteneur figées.
- Aucun test snapshot n'assertait ces polices → pas de baseline à rebaser.

## Résultat

- 29 call-sites migrés, 4 exceptions documentées. 1 fichier touché. Swap mécanique pur.
</content>
