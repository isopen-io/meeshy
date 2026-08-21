# R-137 — Montage de la Rivière au fil (iOS)

## Constat de départ (2026-08-21, worktree `feat/riviere-mount-r137`, base `origin/main` e4d8c4419)

Le mode Rivière est **entièrement conçu et à moitié livré** :

| Étage | État avant ce lot |
|---|---|
| Loi partagée (`packages/shared/utils/river-lanes.ts`) | livrée, 53 vecteurs |
| Miroir Swift (`RiverLaneResolver`) | livré, rejoue les 3 fichiers de vecteurs |
| Tokens (`RiverMetrics` ← `lentille-tokens.json`) | livrés |
| Peau iOS (`RiverStreamHost`, `RiverBubbleView`, `RiverLaneCanvas`, `RiverLaneHeaderStrip`) | livrée |
| Menu de mode (dégrisage) | livré (R-135) |
| **Site de montage dans le fil** | **AUCUN** — `RiverStreamHost` n'est référencé nulle part hors de `Riviere/` |
| **Drapeau `riviere_mode`** | **OFF par défaut**, et `ConversationView.init` ne câble même pas `isRiverFlagEnabled` |
| **Avis système pleine largeur** | la LOI l'a (`RiverBubble.isSystem`), la PEAU ne le rend pas |

Conséquence produit : choisir « Rivière » ⇒ voir Focal/Script (`clamped-unavailable`).
Deux témoins gardent cet état en conscience (`RiverScreenNotMountedTests` position B,
`RiverActivationLockTests`) et documentent tous deux qu'ils tomberont « avec R-137 ».

## Ce que ce lot livre

1. **`RiverThreadInput`** (`Riviere/Core/`, NEUF) — traduction PURE `[Message] → ResolveRiverLanesInput`
   + `[RiverBubbleContent]`. Zéro SwiftUI, zéro I/O, zéro horloge : testable seule.
   Le Prisme (résolution de langue) entre en PARAMÈTRE, il n'est jamais résolu ici.
2. **Avis système pleine largeur** — `RiverBubbleView` branche sur `content.bubble.isSystem`
   et rend l'avis GRAVÉ (heure en tête, centré), en réutilisant `BubbleJoinNoticeView` /
   `FocalSystemNoticeRow` (mêmes clés i18n, un seul domicile). `RiverStreamHost` lui donne
   TOUTE la largeur (span des couloirs), jamais une cellule de couloir.
3. **Montage** — `ConversationView` câble `isRiverFlagEnabled` dans son `resolveCapabilities`
   ET monte `RiverStreamHost` quand `readingModeController.mode == .river` (additif, même
   patron que `LivingSummaryHost`).
4. **Activation** — `LentilleFeatureFlag.riviereMode` passe à défaut ON. L'éligibilité
   (≥ 5 participants actifs, jamais en `direct`) reste la SEULE porte, inchangée.
5. **Témoins retournés en conscience** — la position B de `RiverScreenNotMountedTests`
   devient un témoin de MONTAGE ; `RiverActivationLockTests` passe tout seul (ON + monté).

## Non-régression — ce que ce lot ne touche pas

- `MessageListView` / `MessageListViewController` : AUCUNE édition (les modes Bulles/Script/
  Focal passent par le même chemin qu'avant).
- `ReadingModeOrchestrator` : GELÉ, aucune ligne.
- `RiverLaneResolver` : la loi, aucune ligne.
- Les 3 fichiers de vecteurs partagés : aucun.

## Suivi

- [x] Build de référence verte AVANT toute édition (127 s)
- [ ] `RiverThreadInput` + tests
- [ ] Avis système pleine largeur + tests
- [ ] Montage `ConversationView` + câblage du drapeau
- [ ] Défaut du drapeau ON + témoins retournés
- [ ] Build + suite iOS vertes
- [ ] Recette sur le simulateur `Meeshy-iOS26`
