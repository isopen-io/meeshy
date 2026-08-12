# Plan itération 93ib — iOS `LocationPickerView` (Dynamic Type + VoiceOver)

**Base** : `main` HEAD `53068393` · **Branche** : `claude/upbeat-euler-ieycux` · **Gate** : CI `iOS Tests`

## Objectif
Rendre la feuille de sélection de lieu conforme Dynamic Type et améliorer VoiceOver, sans changer
layout par défaut, logique, palette, Glass (déjà adopté) ni chaînes i18n.

## Étapes
1. [x] Vérifier anti-collision via `list_pull_requests` → `LocationPickerView` non prise, label 93i libre.
2. [x] Sweep Dynamic Type : 15/17 `.font(.system(size:))` → `MeeshyFont.relative(...)` (weight/design préservés).
3. [x] Garder 2 sites fixes justifiés + commentés (annotation MapKit 36pt, épingle 12pt en cercle 28×28).
4. [x] VoiceOver : `.isHeader` sur titre, `.accessibilityHidden` sur 3 glyphes décoratifs,
       `.accessibilityElement(children: .combine)` sur le bloc info de la carte d'action.
5. [x] Analyse `docs/analyses/uiux/2026-07-01-iteration-93i.md`.
6. [x] Mettre à jour `branch-tracking.md` (pointeur 93i + base de départ 94i).
7. [ ] Commit + push `claude/upbeat-euler-ieycux`.
8. [ ] Ouvrir PR, attendre CI verte, merger dans `main`.

## Portée
1 fichier de production + docs routine. **0 test neuf** (sweep présentation + traits déclaratifs).

## Différé prioritaire iOS 94i+
- Dynamic Type grandes surfaces restantes — `MemberManagementSection` (17), `ConversationView+Composer`
  (22, lot prudent = composer critique), `StoryViewerView+Content` (coordonner i18n), `AboutView` (16).
- Glass adoption reste (`MessageOverlayMenu` via `AdaptiveGlassContainer`, lot dédié).
- Palette : hexes proches-mais-non-exacts (checkmark `#4ADE80` → `success`, vérif visuelle).
- **NE PAS re-flagger** `LocationPickerView` (soldé 93i : Dynamic Type + VoiceOver + Glass).
