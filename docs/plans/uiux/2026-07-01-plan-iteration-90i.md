# Plan — Itération 90i (2026-07-01) — iOS Dynamic Type + a11y `DataExportView`

## Objectif
Rendre l'écran d'export de données RGPD (`DataExportView.swift`) conforme Dynamic Type et
VoiceOver, sans changer le layout par défaut, la logique ni la palette.

## Base
- Branche : `claude/upbeat-euler-ojxbs8` resync sur `main` HEAD (`c8063196`).
- Numéro : `90i` (88i/89i déjà mergés par agents parallèles → prochain libre).

## Étapes
1. [x] Resync branche sur `origin/main`, vérifier 0 PR ouverte (aucune contention).
2. [x] Migrer 16/17 `.font(.system(size:))` → `MeeshyFont.relative(...)` (weight/design préservés).
3. [x] Garder 1 glyphe figé (badge fixe 28×28 `toggleRow`) + commentaire doctrine 86i.
4. [x] VoiceOver : masquer 4 glyphes décoratifs, combiner carte/bannière/en-tête, `.isHeader`
       sur `sectionHeader`, état `.isSelected` + label sur boutons format JSON/CSV.
5. [x] Vérifier `grep` : 1 figé restant, 16 `MeeshyFont.relative`.
6. [ ] Commit + push sur la branche.
7. [ ] Ouvrir PR, attendre CI `ios-tests.yml` verte.
8. [ ] Merger dans `main`, supprimer la branche, mettre à jour `branch-tracking.md`.

## Invariants
- 1 fichier touché, 0 clé i18n neuve, 0 test neuf, 0 changement de logique.
- SDK non touché (`MeeshyFont.relative` déjà en scope via `import MeeshyUI`).

## Gate
CI `ios-tests.yml` (compile Xcode 26.1 + tests simu 18.2) — SwiftUI ne compile pas sous Linux.
# Plan itération 90i — Dynamic Type + VoiceOver `MagicLinkView`

**Base de départ** : `main` HEAD `ede22fe4` (post-88i mergé #1215).
**Branche** : `claude/upbeat-euler-pt8xxj` (branche désignée harness ; resync sur `main`).
**Portée** : 1 fichier iOS, sweep pur.

## Objectif
Rendre l'écran d'auth passwordless (`MagicLinkView`) conforme Dynamic Type + VoiceOver, cohérent avec la doctrine des itérations 84i/86i/87i/88i, sans toucher à la logique ni au rendu par défaut.

## Étapes
1. [x] Resync branche sur `main` HEAD.
2. [x] Vérifier absence de collision (PR ouvertes : #1217 DeleteAccount, #1218 EffectsPicker=89i, #1219/#1216/#1220 non-iOS). 90i = numéro > 89i.
3. [x] Migrer 14 sites `.font(.system(size: <token>, weight:))` → `MeeshyFont.relative(<token>, weight:)`, weight/`.monospacedDigit()` préservés.
4. [x] Garder figés 3 sites (xmark chrome + 2 héros ≥40pt), commenter l'exception.
5. [x] Ajouter `.accessibilityLabel(common.close)` sur xmark (manque comblé).
6. [x] Ajouter `.accessibilityHidden(true)` sur les 2 héros décoratifs.
7. [x] Vérifier : 3 `.system(size:)` résiduels attendus, 14 `relative`.
8. [x] Docs analyse + plan + tracking.
9. [ ] Commit + push branche.
10. [ ] Ouvrir/mettre à jour PR ; attendre CI `iOS Tests` verte.
11. [ ] Merger dans `main`, supprimer la branche, mettre à jour le pointeur tracking.

## Risques
- **Compile** : `MeeshyFont.relative` renvoie `Font` → `.monospacedDigit()` chaînable (idem `Font.system(...).monospacedDigit()`). OK.
- **Visuel** : cadence Dynamic Type par défaut = tailles identiques → pas de régression au réglage standard.
- **Build local** : impossible (env Linux) → CI `ios-tests.yml` seule autorité.

## Prochaines cibles différées (91i+)
`NewConversationView` (17), `DataExportView` (17), `AffiliateView` (17), `LocationPickerView` (17), `MemberManagementSection` (17) ; `StoryViewerView+Content` (31, ⚠️ collision i18n historique) et `ConversationView+Composer` (22, lot critique prudent) en dernier ; Glass adoption `MessageOverlayMenu` (21).
