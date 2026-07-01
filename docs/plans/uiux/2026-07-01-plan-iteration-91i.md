# Plan — Itération 91i (iOS) : Dynamic Type + VoiceOver `CommunityLinksView`

**Piste** : iOS (suffixe `i`). Base = `main` HEAD `af1fe619`.
**Branche** : `claude/upbeat-euler-l5yima`.
**Gate** : CI `iOS Tests` (SwiftUI ne compile pas sous Linux → CI seule autorité).

## Objectif
Rendre l'écran « Liens communauté » (`CommunityLinksView.swift`) conforme **Dynamic Type** et **VoiceOver**, sans changer layout par défaut, logique, palette ni chaînes i18n. Surface neuve (0 mention historique), disjointe des 4 PR « 90i » en vol (#1224/#1225/#1226/#1228).

## Étapes
1. [x] Vérifier collision : `DataExportView`/`FeedCommentsSheet`/`MagicLinkView`/`NewConversationView` pris → choisir `CommunityLinksView` (libre).
2. [x] Vérifier résolution `MeeshyFont.relative` sans `import MeeshyUI` (précédent `MessageInfoSheet.swift`).
3. [x] Migrer 13/15 `.font(.system(size:))` → `MeeshyFont.relative(size, weight:)`.
4. [x] Garder 2 glyphes figés (héros 40pt état-vide + glyphe 14pt dans cercle fixe 40×40) + commentaire + `.accessibilityHidden(true)`.
5. [x] VoiceOver : `.isHeader` ×2 (titre + section), `.combine` sur carte de stat + état vide, `.accessibilityHidden` sur glyphes décoratifs.
6. [x] Docs analyse + plan + `branch-tracking.md`.
7. [ ] Commit + push + PR ; attendre CI verte ; merger dans `main` ; supprimer la branche.

## Contraintes respectées
- 1 seul fichier de production touché → orthogonal, aucun conflit attendu.
- 0 logique / 0 clé i18n / 0 test neuf (parité doctrine sweep).
- SDK non touché.

## Différé (candidat futur)
- `CommunityLinkDetailView.swift` (10 sites `.system(size:)`) — même traitement Dynamic Type.
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
# Plan Itération 91i — Dynamic Type + VoiceOver `AffiliateView`

**Date** : 2026-07-01 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `af1fe619`
**Branche** : `claude/upbeat-euler-vncfye` · **Gate** : CI `iOS Tests`

## Objectif

Rendre l'écran « Parrainage » (`AffiliateView.swift`) conforme Dynamic Type + VoiceOver, sans
changer layout par défaut, logique, palette ni chaînes i18n. Surface du différé prioritaire
84i/89i.

## Étapes

1. [x] Resync `main` HEAD, vérifier `list_pull_requests` (90i saturé → viser **91i**).
2. [x] Compter les sites : 17 `.system(size:)` / 0 `relative` confirmés.
3. [x] Migrer 16 sites → `MeeshyFont.relative(size, weight:, design:)` (weight/design préservés).
4. [x] Garder figé le héros `link` 36pt de l'état vide + `.accessibilityHidden(true)` + commentaire.
5. [x] VoiceOver : `.accessibilityLabel` sur 4 boutons icône-only (clés SSOT, 0 clé neuve) ;
   `.combine` sur stat cards + bloc token ; `.isHeader` sur « MES LIENS » ; `.accessibilityHidden`
   sur glyphes décoratifs appariés.
6. [x] Vérifier compte final : 16 relative + 1 fixed = 17 ✅.
7. [x] Analyse + plan + `branch-tracking.md`.
8. [ ] Commit, push, PR, CI verte → merge `main`, supprimer la branche.

## Non-scope (documenté)

- `accentColor = "2ECC71"` = tint de marque déterministe (feed gradients/borders) → **préservé**.
- Sémantiques déjà tokenisées en 69i (`success`/`error`) → rien à faire.
- 0 test neuf (sweep présentation + traits déclaratifs, parité doctrine).

## Différé 92i+ (inchangé)

Dynamic Type grandes surfaces restantes : `StoryViewerView+Content` (coordonner i18n),
`LocationPickerView` (17), `MemberManagementSection` (17), `ConversationView+Composer` (22,
lot prudent). Puis Glass adoption `MessageOverlayMenu` (via `AdaptiveGlassContainer`).
Palette : hexes proches-mais-non-exacts (`#4ADE80`→success ?) audit un par un avec vérif visuelle.
# Plan itération 91i — Dynamic Type + VoiceOver `DataExportView`

**Base de départ** : `main` HEAD `af1fe619` (post-90i mergé #1221).
**Branche** : `claude/upbeat-euler-pt8xxj` (resync sur `main`).
**Portée** : 1 fichier iOS, sweep pur.

## Objectif
Rendre l'écran RGPD `DataExportView` conforme Dynamic Type + VoiceOver (parité doctrine 86i/88i/90i), sans toucher à la logique ni au rendu par défaut.

## Étapes
1. [x] Resync branche sur `main` HEAD (post-90i).
2. [x] Vérifier absence de collision (90i mergé, 89i EffectsPicker session parallèle).
3. [x] Migrer 16 sites `.font(.system(size:))` → `MeeshyFont.relative(...)`, weight/`.rounded` préservés.
4. [x] Garder figé le glyphe de badge 28×28 (toggleRow), commenter l'exception.
5. [x] VoiceOver : combine carte info + bandeau erreur ; `.isHeader` sur sectionHeader ; hidden sur glyphes décoratifs.
6. [x] Vérifier : 1 `.system(size:)` résiduel attendu, 16 `relative`, 4 traits a11y.
7. [x] Docs analyse + plan + tracking.
8. [ ] Commit + push ; PR ; CI `iOS Tests` verte.
9. [ ] Merger dans `main`, supprimer la branche, mettre à jour le pointeur tracking.

## Risques
- **Compile** : `MeeshyFont.relative(N, weight:, design:)` supporte `design:` → sectionHeader `.rounded` OK.
- **Visuel** : cadence par défaut = tailles identiques → pas de régression.
- **Build local** : impossible (env Linux) → CI seule autorité.

## Prochaines cibles différées (92i+)
`NewConversationView` (17), `AffiliateView` (17), `LocationPickerView` (17), `MemberManagementSection` (17) ; puis `StoryViewerView+Content` (31, ⚠️ collision i18n) et `ConversationView+Composer` (22, prudent) ; Glass `MessageOverlayMenu` (21).
