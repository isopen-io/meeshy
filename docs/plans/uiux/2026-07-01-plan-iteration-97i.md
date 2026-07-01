# Plan Itération 97i — Dynamic Type + VoiceOver `AddParticipantSheet`

**Date** : 2026-07-01 · **Piste** : iOS (`i`) · **Base** : `main` HEAD post-91i · **Gate** : CI `ios-tests.yml`

## Objectif
Rendre la modale « Ajouter un membre » (`AddParticipantSheet.swift`) conforme Dynamic Type + VoiceOver, sans toucher la logique, en suivant la doctrine établie (55i/74i/86i/88i/90i/91i).

## Sélection de surface
- Surfaces différées prioritaires **toutes prises** par des PR en vol (vérif `list_pull_requests` : #1233→#1252). `AddParticipantSheet` = fresh, self-contained, zéro collision.
- Numéro `97i` : `96i` déjà pris (#1252).

## Étapes
1. [x] Resync branche sur `main` HEAD ; vérifier PRs ouvertes pour éviter collision.
2. [x] Migrer 11 sites `.font(.system(size:))` → `MeeshyFont.relative(...)` (weight/design préservés).
3. [x] Garder 3 sites figés + commentaire : xmark chrome 28×28, 2 hero décoratifs 32pt (états vides).
4. [x] Ajouter 4 traits VoiceOver : `.isHeader` (titre), `.combine` (nom+@pseudo, 2 états vides), `.accessibilityHidden` (loupe).
5. [x] Rédiger analyse + plan, mettre à jour `branch-tracking.md`.
6. [ ] Commit + push branche `claude/upbeat-euler-1zchqh`, ouvrir PR, attendre CI verte, merger dans `main`, supprimer la branche.

## Contraintes
- 1 seul fichier, swaps mécaniques 1:1, 0 test neuf, 0 clé i18n neuve.
- Tailles de base inchangées → zéro régression au réglage Dynamic Type standard.

## Suite (98i+)
- Grandes surfaces restantes une par itération (vérifier `list_pull_requests` AVANT chaque choix) : `StoryViewerView+Content` (31, ⚠️ collision i18n historique #1174) et `ConversationView+Composer` (22) en dernier ; Glass adoption `MessageOverlayMenu` (21, via `AdaptiveGlassContainer`).
- Candidats frais non pris à date : `ConversationMediaGalleryView` (13), `SupportView` (10), `LicensesView` (10), `CommunityLinkDetailView` (10), `UserStatsView` (9), `ForwardPickerSheet` (8).
