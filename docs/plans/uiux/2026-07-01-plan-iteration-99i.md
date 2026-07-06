# Plan — Itération 99i (iOS) : Dynamic Type + VoiceOver `CommunityLinkDetailView`

**Piste** : iOS (suffixe `i`). Base = `main` HEAD `5deacf76` (post-91i mergé #1236).
**Branche** : `claude/upbeat-euler-l5yima`.
**Gate** : CI `iOS Tests` (SwiftUI ne compile pas sous Linux → CI seule autorité).

## Objectif
Rendre l'écran de détail d'un lien communautaire (`CommunityLinkDetailView.swift`) conforme **Dynamic Type** et **VoiceOver**, sans changer layout par défaut, logique, palette ni chaînes i18n. Sibling direct de 91i (`CommunityLinksView`).

## Étapes
1. [x] Resync branche sur `main` HEAD (post-91i #1236 mergé).
2. [x] Vérifier collision via `list_pull_requests` : 87i–98i saturés sur d'autres fichiers → `CommunityLinkDetailView` libre → numéro **99i**.
3. [x] Migrer 8/10 `.font(.system(size:))` → `MeeshyFont.relative(size, weight:/design:)` (weight/`.monospaced` préservés).
4. [x] Garder 2 glyphes figés (héros 26pt dans cercle 60×60 + icône bouton 22pt dans tuile 52×52) + commentaire + `.accessibilityHidden(true)`.
5. [x] VoiceOver : `.combine` (carte en-tête, stats, lignes info), `.isHeader` (« INFORMATIONS »), `.accessibilityLabel` sur boutons d'action + hidden sur glyphes décoratifs.
6. [x] Docs analyse + plan + `branch-tracking.md`.
7. [ ] Commit + push + PR ; attendre CI verte ; merger dans `main` ; supprimer la branche.

## Contraintes respectées
- 1 seul fichier de production touché → orthogonal, aucun conflit attendu.
- 0 logique / 0 clé i18n / 0 test neuf (parité doctrine sweep).
- SDK non touché.

## Différé (candidats futurs, hors surfaces en vol 87i–98i)
- `StoryViewerView+Content` (31, coordonner i18n historique), `ConversationView+Composer` (22, lot prudent).
- Glass adoption `MessageOverlayMenu` (21) via `AdaptiveGlassContainer`.
