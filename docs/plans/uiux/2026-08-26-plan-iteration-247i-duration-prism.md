# Plan — Iteration-247i · les durées, une source pour ce qu'on montre et ce qu'on dit

**Analyse** : `docs/analyses/uiux/2026-08-26-iteration-247i-duration-prism.md`
**Base** : `main` HEAD `4b9acd3f` · **Branche** : `claude/intelligent-noether-llro07`

## Objectif

Fermer la famille « durée » sur les deux faces que `LocalizedNumber` déclare
déjà servir : ce que l'app **montre** (chiffres de la locale) et ce qu'elle
**dit** (unités en toutes lettres, jamais l'horloge).

## Lot

- [x] `LocalizedNumber.DurationClock` — les 3 orthographes de l'app, nommées
- [x] `LocalizedNumber.duration(seconds:clock:locale:)` — `Int` + `TimeInterval`
- [x] `LocalizedNumber.spokenDuration(seconds:locale:)` — `Int` + `TimeInterval`
- [x] `LocalizedNumber.wholeSeconds(from:)` — pont borné (`Int(1e30)` piège)
- [x] 11 formateurs privés → délégation (nom et signature conservés : 0 churn
      au site d'appel)
- [x] 11 `.accessibilityValue` → forme parlée
- [x] `CameraView` + `UniversalComposerBar` : libellé statique / valeur
      dynamique + `.updatesFrequently` (doctrine 211i)
- [x] `MessageOverlayMenu` : l'indice VoiceOver porte la LONGUEUR, plus la
      position courante
- [x] `CallManager` : `spokenDuration` jumeau, `locale` en paramètre (234i)
- [x] Garde `NumericAccessibilityValueGuardTests` § Durées — 5 tests, dont les
      2 auto-gardes de 238i
- [x] `LocalizedNumberTests` — 11 tests de comportement, variance de locale
      plutôt que chaînes CLDR
- [x] Suites existantes réalignées : `CallViewAccessibilityTests`,
      `FloatingCallPillViewTests`, `CallManagerFormatDurationTests`

## Hors lot, assumé

- **SDK** (17 copies) — hors périmètre par règle, piste SDK.
- **`NotificationSettingsView.formattedDndTime`** — format de PERSISTANCE
  « HH:mm ». Le localiser corromprait la donnée : allowlisté NOMMÉMENT dans la
  garde, jamais toléré en silence.
- **`ComposerModels:35`**, chaîne française hors catalogue — défaut d'i18n
  distinct, non mélangé (leçon 238i : découper par niveau de doute).

## Vérification

Aucune toolchain Swift dans l'environnement → **gate réel = CI `iOS Tests`**,
suite complète via ` — run test` **dans le SUJET du commit**. Les contrôles
déterministes rejoués hors Swift sont tabulés au § 6 de l'analyse.

## Statut

Terminé — PR ⏳
