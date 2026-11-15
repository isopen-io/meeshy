# Itération 271 — Plan : résolveur wire→palette Android + parité `accent.vectors.json`

## Objectifs

1. Corriger la divergence de couleur d'accent : `public`/`global`/`broadcast`
   doivent retomber sur `community` sur Android comme sur web/iOS.
2. Fermer le trou de parité : brancher Android sur le fichier de vecteurs
   partagé `accent.vectors.json` (0 → 24 vecteurs rejoués).

## Modules affectés

- `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/theme/DynamicColorGenerator.kt`
  (+ `paletteForWire`, résolveurs wire, constantes de repli)
- `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/theme/ConversationAccent.kt`
  (délégation)
- `apps/android/sdk-core/src/test/kotlin/me/meeshy/sdk/theme/AccentVectorParityTest.kt`
  (nouveau témoin)

## Phases

### Phase 1 — RED : le témoin de parité
- Écrire `AccentVectorParityTest.kt` : charge `accent.vectors.json` (remontée du
  cwd jusqu'à trouver `packages/shared/fixtures/reading-modes/accent.vectors.json`),
  parse via `kotlinx.serialization.json`, rejoue les 24 vecteurs.
- Avant le correctif, les vecteurs `public`/`global`/`broadcast` échouent
  (couleur DIRECT servie) → RED prouvé.

### Phase 2 — GREEN : le résolveur wire + délégation
- Ajouter `paletteForWire(type, language?, theme?, memberCount)` à
  `DynamicColorGenerator`, miroir de `conversationAccentPalette` (TS).
- Introduire `UNKNOWN_KEY_FALLBACK_HEX`/`UNKNOWN_TYPE_FALLBACK_HEX` (constantes) et
  la table `wireTypeToContextType` (public/global/broadcast → COMMUNITY).
- Faire déléguer `ConversationAccent.accentColorPalette()`.

### Phase 3 — REFACTOR / vérif
- `colorFor(context:)` réutilise les constantes de repli (au lieu des littéraux
  inline) — cohérence, aucune régression.
- Contre-épreuve : mutation d'un poids / d'une entrée de palette → RED.

## Dépendances

Aucune nouvelle dépendance (`kotlinx.serialization.json` déjà en `implementation`).

## Risques estimés

- FAIBLE. Table pure + algorithme déjà testé. Le seul changement de comportement
  est le correctif voulu (public/global/broadcast).

## Stratégie de rollback

Revert du commit : restaure l'ancien `else -> DIRECT`. Aucun schéma, aucune
migration, aucune surface réseau touchée.

## Critères de validation

- 24/24 vecteurs verts, égalité hex stricte.
- `DynamicColorGeneratorTest` existant vert.
- Contre-épreuves rougissent.

## Statut d'achèvement

- [x] Phase 1 (RED) — témoin `AccentVectorParityTest` écrit ; `public`/`global`/`broadcast`
      rougissaient sous l'ancien `else -> DIRECT`.
- [x] Phase 2 (GREEN) — `paletteForWire` + résolveurs + tables ajoutés ; `ConversationAccent`
      délègue ; correctif public/global/broadcast → community.
- [x] Phase 3 (REFACTOR) — `colorFor` réutilise les constantes de repli ; validation
      indépendante des 24 vecteurs via transcription Node du résolveur exact (`24 pass, 0 fail`).
- [x] Validation : `ConversationAccentTest` existant reste vert (direct/group inchangés) ;
      `DynamicColorGeneratorTest` inchangé (colorFor byte-identique). Android non compilable ici
      (pas d'Android SDK) — logique validée par transcription fidèle contre le fixture partagé ;
      le test tourne en CI (`android.yml` → `testDebugUnitTest`).
- [ ] Commit + push

## Améliorations futures

- Threader `language`/`theme` réels dans l'accent Android en production (aujourd'hui
  `ApiConversation` ne porte ni langue ni thème ; web thread `language`, iOS thread
  les deux). Hors périmètre : nécessite un champ de fil et une décision produit.
- Validation croisée XCTest directe contre `ColorGeneration.swift` (déjà notée
  « V2 » dans `accent.vectors.json.$format`).
