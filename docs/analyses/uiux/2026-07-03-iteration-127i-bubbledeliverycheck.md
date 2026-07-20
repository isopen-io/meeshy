# Itération 127i — Analyse UI/UX iOS : `BubbleDeliveryCheck`

**Date** : 2026-07-03
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleDeliveryCheck.swift`
**Base** : `main` HEAD (`7f187ca8`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

`BubbleDeliveryCheck` est le glyphe unique de statut de distribution de tous les pieds de bulle
(`DeliveryStatus` : sending / clock / slow / sent / delivered / read / failed + hourglass hors-ligne).
Il s'affiche **inline avec l'horodatage de la meta-row** de chaque bulle. Surface **fraîche** : 8
`.font(.system(size:))`, 0 commentaire doctrine, 0 `relative`. **1 seule PR iOS ouverte** au démarrage
(#1391, piste _calls_ : `CallEffectsOverlay`/`FloatingCallPillView`/`CallView`/`IncomingCallView`/
`CallTranscriptionService`) → **0 contention** avec cette surface (fichier bulle disjoint). Numéro
**127i** (126i = `ConversationView+Composer` mergé #1388).

## Constat (avant 127i)

**8 `.font(.system(size:))`** — tous des **glyphes de statut sémantiques** (chacun porte déjà son
`.accessibilityLabel` distinct via `Self.label(...)`), affichés à côté du texte d'horodatage :
hourglass (10 semibold), 2 × clock (10), clock.badge.exclamationmark (10 semibold), checkmark envoyé
(10 semibold), exclamationmark.circle.fill (10 bold), et 2 × checkmark du `doubleCheck`
(distribué/lu, taille paramétrée 10/11).

## Corrections appliquées (1 fichier, 0 logique)

- **8/8 `.font(.system(size:))` → `MeeshyFont.relative(...)`** (mêmes tailles/poids) : les glyphes de
  statut **scalent désormais avec le texte de la meta-row** sous Dynamic Type, restant alignés avec
  l'horodatage plutôt que de rester figés à 10 pt pendant que le texte grandit.
- **`doubleCheck`** (distribué/lu) : les deux checkmarks superposés migrent aussi. Le `.frame(width:)`
  n'est qu'une **réservation de largeur de layout** (pas de `.clipped()`) → le scaling est **sûr, sans
  rognage**, et garde les trois états checkmark (envoyé / distribué / lu) **visuellement cohérents**
  sous Dynamic Type (sinon « envoyé » aurait grandi alors que « distribué/lu » serait resté petit).

Aucun gel appliqué : ces glyphes ne sont **pas** bornés par un cadre de dimension fixe (pas de tuile,
pas de cercle tap ; le `.frame(width:)` du `doubleCheck` ne rogne pas). Ce sont des indicateurs de
statut inline qui doivent scaler avec le texte adjacent → **`relative`, pas figé**.

Palette (`tint`, `readTint` indigo adaptatif, `MeeshyColors.warning/error`) déjà conforme → **intacte**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 clé i18n neuve (les 7 labels sont déjà
  `String(localized:)`), 0 test neuf. `import MeeshyUI` déjà présent.
- Le test existant `BubbleDeliveryCheckLabelTests` n'inspecte **que** le helper `label(_:)` (non-vacuité
  / unicité des labels VoiceOver), **pas** les littéraux de police → aucune régression de test.
- Vue feuille (rendue en boucle de liste) : édits `.font()`-only, aucun `@ObservedObject` singleton
  introduit, `Equatable` préservé → pattern « Zero Unnecessary Re-render » intact.

## Statut

**TERMINÉE** — `BubbleDeliveryCheck` Dynamic Type soldé (8/8 glyphes de statut → `relative`, a11y déjà
en place). Ne plus re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `BubbleDeliveryCheck` — 8/8 glyphes de statut → `MeeshyFont.relative` (aucun gel : indicateurs inline
  non bornés par cadre fixe, scalent avec la meta-row) ; 7 `.accessibilityLabel` déjà en place. **SOLDÉ 127i.**
