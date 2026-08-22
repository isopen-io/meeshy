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

---

## Reste à faire — arbitrages produit du 2026-08-21 non encore livrés

Ordre de valeur décroissante. Chaque ligne est un lot autonome.

- [x] **R-3 · Plan à axe du temps avec poignée.** (22/08, `RiverTimeScale` + `RiverTimeHandle`) Axe des ordonnées = le temps ;
      une poignée apparaît au défilement, graduée jour / semaine / mois / année
      selon l'amplitude réelle du fil ; en la tenant on saute directement à la
      période voulue. C'est le lot le plus lourd : il faut une projection
      rang → date (la loi sert déjà `createdAtMs`), une échelle adaptative et
      un `scrollTo` par rang cible.
- [ ] **R-4 · La bulle Rivière devient une vraie bulle.** (22/08 : appui long — ouvrir dans le fil, répondre, copier ; reste pièces jointes, réactions, traductions) Appui long (menu),
      réactions, traductions, pièces jointes — images, vidéos, audio avec
      transcription à segments coloriés et synchronisés à la lecture, comme le
      fil. Aujourd'hui `RiverBubbleView` ne rend que texte + citation.
      Réutiliser les composants du Fil plutôt que les réécrire.
- [x] **R-5 · Identité vivante.** (22/08) Avatars avec présence et cercle de story ;
      le nom devient activable — profil pour un compte, feuille d'information
      pour un visiteur anonyme. `ProfileSheetUser` existe déjà (`FocalRowInput`).
- [x] **R-6 · La citation mène à sa cible.** (22/08) Un tap sur la citation d'une bulle
      déplace le curseur ET cadre le rang du message cité (`moveTo` +
      `scrollTo`) — la loi sert déjà le connecteur et son `toRank`.
- [x] **R-7 · Canvas plein écran avec marges.** (22/08 : réserve basse + composeur au-dessus du pane) Le pane occupe déjà l'écran ;
      reste à réserver le bas (composeur) et à garantir qu'aucune bulle ne
      tombe sous une zone non atteignable.
- [x] **R-8 · Affinages mesurés au simulateur.** (22/08 : ouverture au présent, bande en overlay, canvas dans le repère du pane ; reste l'anneau « adressé » de tête de segment parfois absent) La bande de couloirs se vide
      quand la ligne de lecture tombe entre deux rangs (la loi ne nomme
      personne sur le vide — décider si la peau doit garder le dernier nom
      connu) ; le plan s'ouvre avec ~135 pt de marge à gauche au premier
      cadrage.

## Hors périmètre de cette branche

Les captures « padding des bulles du fil » et « padding des items de
conversation » (2026-08-21) montrent `focusIdentityChip` / `focusStrip` /
encoche CATÉGORIE : ce code vit sur `feat/ios-list-scroll-fluidity`, pas sur
`main`. Il ne peut pas être corrigé depuis cette branche.
