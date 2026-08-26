# Itération 271 — Analyse : l'accent de conversation Android sert la COULEUR DIRECT pour `public`/`global`/`broadcast`, et aucun vecteur partagé ne le garde

## État courant

La couleur d'accent déterministe d'une conversation (`primary`/`secondary`/`accent`)
est calculée à partir de ses métadonnées (type, langue, thème) par l'algorithme
partagé documenté dans CLAUDE.md § *Conversation Accent Color* :

```
primary   = blend(langueColor × 0.30, typeColor × 0.30, thèmeColor × 0.40)
secondary = hueShift(primary, +30°)
accent    = hueShift(primary, −30°)
```

Cet algorithme vit en **trois miroirs** :

| plateforme | site | forme du type |
|---|---|---|
| Swift (SSOT vérifié) | `DynamicColorGenerator.colorFor(context:)` (`ColorGeneration.swift`) | enum fermé + `MeeshyConversation.computeColorPalette` (normalisation fil→contexte) |
| TypeScript (miroir web) | `conversationAccentPalette()` (`packages/shared/utils/conversation-colors.ts`) | `WIRE_TYPE_TO_CONTEXT_TYPE` (huit types du fil → cinq du contexte) |
| Kotlin (Android) | `DynamicColorGenerator.colorFor(...)` + `ConversationAccent.accentColorPalette()` (`apps/android/sdk-core/.../theme/`) | `when(type.lowercase()) { … else -> DIRECT }` |

Un **fichier de vecteurs partagé** — `packages/shared/fixtures/reading-modes/accent.vectors.json`
(24 cas : 20 vecteurs de palette `{type, language?, theme?} → {primary, secondary, accent}`
+ 4 vecteurs `colorForName → hex`) — est le CONTRAT cross-plateforme. Il est rejoué
par TS (`__tests__/vectors/accent.vectors.test.ts`) **et** iOS
(`AccentVectorTests.swift`, « 7/7 fichiers de vecteurs en XCTest »).

## Problèmes identifiés

### 1. Divergence RÉELLE, visible par l'utilisateur — `public`/`global`/`broadcast` → mauvaise couleur sur Android

La table canonique `WIRE_TYPE_TO_CONTEXT_TYPE` (TS/iOS) fait retomber **quatre**
types du fil sur `community` :

```
public → community · global → community · community → community · broadcast → community
```

L'adaptateur Android `ConversationAccent.accentColorPalette()` ne mappe que
`group`/`community`/`channel`/`bot`, et jette **tout le reste** dans la branche
`else -> ConversationType.DIRECT` :

```kotlin
type = when (type.lowercase()) {
    "group" -> ConversationType.GROUP
    "community" -> ConversationType.COMMUNITY
    "channel" -> ConversationType.CHANNEL
    "bot" -> ConversationType.BOT
    else -> ConversationType.DIRECT      // ← public, global, broadcast tombent ici
}
```

Conséquence : une conversation `public`, `global` ou `broadcast` reçoit la
couleur de base **DIRECT** (`FF6B6B`, corail) sur Android, alors qu'elle reçoit
la couleur **COMMUNITY** (`9B59B6`, violet) sur web et iOS. Le MÊME salon rend
un avatar/dégradé corail sur Android et violet ailleurs — une incohérence de
premier plan sur un indicateur présent partout (lignes de liste, en-têtes).
Le web thread bien `conversation.type` brut dans `conversationAccentPalette`
(`use-conversation-accent.ts`), donc la normalisation y opère ; Android la
court-circuite.

### 2. Trou de parité « zéro sur N » — Android ne rejoue AUCUN vecteur partagé

`accent.vectors.json` garde TS ↔ iOS. Android n'y est **pas branché** :
`DynamicColorGeneratorTest.kt` vérifie à la main ~3 exemples (`colorForName("test")`,
un blend, un saturationBoost). Les 24 vecteurs — dont ceux qui exercent
précisément la normalisation de type (`public`, `global`, `broadcast`) — ne sont
rejoués par aucune suite Android. C'est la forme « N miroirs, zéro témoin » de la
leçon 291 : la divergence #1 est restée invisible parce qu'aucun test ne rougit
pour signaler l'absence de couverture.

### 3. Cause structurelle — Android n'a pas de résolveur wire→palette

TS expose `conversationAccentPalette(type, language, theme)` (strings du fil →
palette, avec `WIRE_TYPE_TO_CONTEXT_TYPE`, `ISO_TO_CONVERSATION_LANGUAGE`, et les
replis `UNKNOWN_KEY_FALLBACK`). iOS l'expose via `MeeshyConversation.computeColorPalette`.
Android n'a que `colorFor(ConversationContext)` — qui prend des **enums**, pas des
strings du fil — et un adaptateur `ConversationAccent` qui réimplémente une
FRACTION de la normalisation de type (la branche `else`) au lieu de la table
complète. Le résolveur wire→palette, source de vérité unique du mapping, est
absent d'Android.

## Causes racines

- L'adaptateur `ConversationAccent` a été écrit en énumérant les types « connus »
  du produit Android à l'instant T, avec un `else -> DIRECT` de confort. Les types
  `public`/`global`/`broadcast` n'ont pas été traités comme des synonymes de
  `community` parce que la table canonique n'était pas le point de départ.
- Le fichier de vecteurs a été conçu comme contrat cross-plateforme mais son
  rejeu n'a été câblé que sur deux des trois clients (leçon 288 : un témoin de
  parité qui couvre N−1 des N sites déplace le risque sur le site non couvert —
  ici le risque était sur Android, et il s'était déjà matérialisé).

## Impact métier / technique

- **Métier** : incohérence visuelle de marque sur les salons publics/broadcast —
  exactement le type de conversation le plus visible (annonces, communautés
  ouvertes). Un utilisateur multi-appareils voit deux couleurs pour un même salon.
- **Technique** : dette de SSOT — un mapping dupliqué et divergent, sans garde.

## Évaluation du risque

- Correctif : FAIBLE. La normalisation de type est une table pure ; le nouveau
  résolveur wire réutilise les maps de couleurs enum existantes (aucune constante
  couleur dupliquée) et l'algorithme blend/hueShift déjà en place et déjà testé.
- Témoin : FAIBLE. Test JVM pur (le `DynamicColorGenerator` n'a aucune dépendance
  Android), lisant le fichier de vecteurs partagé depuis le dépôt.

## Améliorations proposées

1. **Ajouter `DynamicColorGenerator.paletteForWire(type, language?, theme?, memberCount)`** —
   le miroir Kotlin exact de `conversationAccentPalette` : `WIRE_TYPE_TO_CONTEXT_TYPE`
   (les quatre → community inclus), résolution langue ISO+nom-complet, replis
   `UNKNOWN_KEY_FALLBACK` (`4ECDC4`) et `UNKNOWN_TYPE_FALLBACK` (`FF6B6B`). Réutilise
   `blendColors`/`shiftHue`/`languageColors`/`typeColors`/`themeColors` — zéro
   duplication de constante couleur.
2. **Faire déléguer `ConversationAccent.accentColorPalette()` à `paletteForWire`** —
   corrige la divergence #1 (public/global/broadcast → community). Comportement
   préservé pour direct/group/community/channel/bot et pour le repli type-inconnu
   (→ direct).
3. **Ajouter `AccentVectorParityTest.kt`** (sdk-core, JVM) : charge
   `accent.vectors.json`, rejoue les 24 vecteurs (20 palette via `paletteForWire`,
   4 via `colorForName`) en égalité hex STRICTE. Le résolveur par strings de couleur
   reproduit AUSSI le vecteur `unknown-lang` (klingon → `4ECDC4`), là où iOS doit
   l'exempter (enum fermé) : **24/24 sans exemption**, couverture supérieure.

## Bénéfices attendus

- Même couleur d'accent pour un salon `public`/`global`/`broadcast` sur les trois
  clients.
- Trou de parité fermé : 3 miroirs sur 3 rejouent désormais le contrat partagé.
- Un futur écart (réordonnancement de palette, dérive d'un poids de blend,
  changement de la table de type) fait rougir Android comme il fait déjà rougir
  TS/iOS.

## Complexité d'implémentation

Faible. ~1 fonction publique + 3 helpers privés + 2 constantes dans
`DynamicColorGenerator.kt` ; 1 délégation dans `ConversationAccent.kt` ; 1 fichier
de test.

## Critères de validation

- `paletteForWire("public", "french", "general")` == vecteur `community` (`#5D9AC6…`).
- `paletteForWire("broadcast", "english", "tech")` == vecteur `broadcast` (`#73839C…`).
- Les 24 vecteurs de `accent.vectors.json` passent en égalité hex stricte.
- Contre-épreuve : muter un poids de blend, réordonner une entrée de palette, ou
  retirer `public` de la table → un test rougit.
- `DynamicColorGeneratorTest` existant reste vert (aucune régression sur l'API enum).
