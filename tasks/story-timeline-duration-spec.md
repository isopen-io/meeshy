# Spec — Le timeline pilote la durée du slide (source de vérité)

Date: 2026-06-01 · Décision produit user: **Option A — la timeline est autoritaire et
ÉCOURTE le média en rognant son temps** (« la timeline EST la story avec la vision
temporelle ; elle configure la durée de chaque élément, le moment d'apparition,
l'animation »).

## Problème (diagnostic prouvé)
`StorySlide.computedTotalDuration()` est l'UNIQUE source de vérité de la durée (viewer
wall-clock + canvas auto-advance + exporter `StoryExporter.export` l.80). Elle calcule
`MAX(bg media, texte long, 6 s)` et **ignore délibérément** `effects.slideDuration` ET
`slide.duration` (doc StoryModels l.902-921 : éviter les valeurs backend héritées arbitraires).

Conséquences (bugs) :
1. La durée configurée via le timeline (`TimelineProject.slideDuration`, persistée par
   `TimelineProject.apply → slide.duration` l.1927) est **perdue** : le slide ne suit pas
   sa config timeline.
2. `computedTotalDuration()` ne regarde que le **background** media → un **foreground**
   vidéo/audio plus long est **coupé** dans viewer/export (le timeline l'avait étendu, cf.
   commentaire init l.1908-1911).
3. `slide.duration` est écrit par 3 chemins composer (`currentSlideDuration` setter l.711,
   `autoExtendDuration` l.732, `TimelineProject.apply` l.1927) mais **jamais lu** par la
   source de vérité → champ mort pour le playback.
4. 5 tests export échouent (StoryExporterStaticOnlyTests + StoryExporter_BackgroundVideoTests)
   — ils testaient « la durée suit la config » et captent ce bug depuis la centralisation 28/05.

## Design (champ dédié — anticipé par la doc « un champ dédié lu en priorité »)
Nouveau champ **`StoryEffects.timelineDuration: Double?`** :
- `nil` = pas d'autorité timeline (vieilles stories backend, slide jamais édité) → fallback
  contenu (comportement actuel inchangé → ZÉRO régression sur l'existant).
- non-nil = durée AUTORITAIRE configurée par le timeline (peut être < contenu = trim).

Pourquoi un nouveau champ (pas réutiliser `slide.duration`/`effects.slideDuration`) : ces
deux portent des valeurs backend héritées arbitraires (raison de la centralisation 28/05).
Un champ neuf est `nil` pour tout l'existant → fallback sûr ; seul le nouvel authoring l'écrit.

## Changements
1. **Model** `StoryModels.swift` `StoryEffects` :
   - `public var timelineDuration: Double?` + CodingKey + `decodeIfPresent` (additif,
     backward-compat) + `encodeIfPresent` + init param `= nil` + toDict.
2. **`computedTotalDuration()`** : en TÊTE,
   `if let t = effects.timelineDuration, t > 0 { return t }` (autoritaire, peut écourter),
   sinon logique contenu actuelle inchangée.
3. **Écrivains de durée → `effects.timelineDuration`** (et non plus seulement `slide.duration`) :
   - `TimelineProject.apply(to:)` : `slide.effects.timelineDuration = Double(slideDuration)`.
   - `StoryComposerViewModel.autoExtendDuration` : poser/étendre `effects.timelineDuration`.
   - `currentSlideDuration` setter : écrire `effects.timelineDuration`.
   - (garder `slide.duration` en miroir legacy pour compat schema, mais il n'est plus la vérité.)
4. **`TimelineProject.init(from slide)`** : `slideDuration = Float(slide.effects.timelineDuration
   ?? slide.computedTotalDuration())` (ré-ouvrir préserve le pin).
5. **Viewer / canvas / exporter** : suivent automatiquement (tous via computedTotalDuration).
   ⚠️ VÉRIFIER que `StoryExporter` TRONQUE bien un média plus long que la durée calculée
   (time ranges) — l'user veut le rognage. Vérifier aussi les fenêtres de visibilité des
   éléments côté viewer (StoryRenderer) face à une durée plus courte que le média.

## Tests (TDD)
- `computedTotalDuration` : honore `timelineDuration` (incl. < contenu = trim) ; `nil` →
  contenu (6s static / bg media / texte long) — protéger la non-régression.
- Les 5 tests export : passer par `effects.timelineDuration` (ou via le timeline) et
  asserter `export == timelineDuration` (rognage média long). Renommer le test « truncate »
  pour refléter « timeline autoritaire ».
- Round-trip `TimelineProject.init(from:)`/`apply` préserve `timelineDuration`.

## Risques
- Schema StoryModels = package partagé → édit ciblé + commit rapide (fenêtre courte vs agent
  parallèle). Champ ADDITIF, decode optionnel → pas de migration backend.
- Synchro pin ↔ contenu : tous les écrivains de durée écrivent `timelineDuration` (pas de
  slide bloqué à une valeur obsolète quand on ajoute un média).
- Vérifier que le rognage exporter + fenêtres viewer respectent une durée < média.

## Ordre d'implémentation (incréments testés)
1. Model field + computedTotalDuration priority + tests unitaires (additif, sûr).
2. Écrivains (apply / autoExtend / currentSlideDuration) + init round-trip + tests.
3. Mettre à jour les 5 tests export + vérifier rognage exporter (sim).
4. Vérif visuelle viewer : un slide configuré court rogne bien le média long.
