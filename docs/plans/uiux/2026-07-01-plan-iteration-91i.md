# Plan — Itération 91i (iOS)

**Objectif** : Rendre `AffiliateView` (écran « Parrainage ») conforme Dynamic Type + VoiceOver, sans changer layout, logique, palette ni i18n.

## Étapes
1. [x] Resync branche sur `main` HEAD ; vérifier PRs ouvertes (`list_pull_requests`) → 90i saturé (4 PRs disjointes) → prendre **91i**, surface `AffiliateView` non prise.
2. [x] Migrer 16/17 `.font(.system(size:))` → `MeeshyFont.relative(size, weight:, design:)` (weight/design préservés dont `.rounded`).
3. [x] Garder figé le héros décoratif `link` 36pt de l'état vide + `.accessibilityHidden(true)` + commentaire d'exception.
4. [x] Ajouter 4 `.accessibilityLabel` (bouton +, copier, partager, supprimer) via clés SSOT existantes (0 clé neuve).
5. [x] `.accessibilityElement(children: .combine)` sur cartes de stats + section header ; `.isHeader` sur section ; `.accessibilityHidden` sur glyphes décoratifs.
6. [x] Analyse + plan + `branch-tracking.md`.
7. [ ] Commit + push + PR ; gate CI `iOS Tests` ; merge sur `main`.

## Contraintes
- **0 logique**, **0 clé i18n neuve**, **0 test neuf** (sweep présentation pur).
- Palette `accentColor = "2ECC71"` (teinte thématique via `surfaceGradient/border(tint:)`) **laissée intacte** — décision différée, vérif visuelle requise.
- Gate = CI `iOS Tests` (pas de toolchain Xcode local).

## Base de départ 92i
`main` HEAD (toujours resync ; supprimer la branche mergée).

## Différé prioritaire iOS 92i+
- Dynamic Type grandes surfaces restantes : `StoryViewerView+Content` (coordonner i18n), `ConversationView+Composer` (lot prudent), `MemberManagementSection`, `LocationPickerView` (+ Glass adoption sheet).
- Glass adoption reste : `MessageOverlayMenu` via `AdaptiveGlassContainer` (lot dédié).
- Palette : audit hexes proches (`#4ADE80`→success ?, `accentColor` thématiques) **avec vérif visuelle**.
- **NE PAS re-flagger** `AffiliateView` (Dynamic Type + VoiceOver soldés 91i ; héros 36pt figé à dessein ; teinte thématique différée).
