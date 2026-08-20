# Lot E — Viewers & cartes sur le noyau — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les trois surfaces de lecture (viewer Story, carte + détail Post, Réels) servent le même noyau : annonce du fond selon PROVENANCE et EXISTENCE (lois 3-5), bouton 🔇 partout où une piste existe (loi 6), carte de post avec scène rendue par le ScenePlayer — sous les budgets de P15.

**Architecture:** Grâce à B7, le fil v3 arrive DÉJÀ bridgé en runtime (`StoryEffects`) : les viewers existants fonctionnent sans modification. Ce lot fait trois choses ciblées : (1) il remplace l'annonce sonore ad hoc par le résolveur B5 sur les trois surfaces ; (2) il monte le 🔇 conditionné à l'existence ; (3) il rend la scène des POSTS dans la carte via `MeeshyScenePlayer(.card)` — né en pause, hauteur EXPLICITE, zéro décodeur actif dans le fil (le budget P15 est satisfait par construction : la carte est une image vivante en pause, le mouvement est au tap).

**Tech Stack:** SwiftUI, XCTest, `meeshy.sh test`, captures simulateur.

**Spec:** `docs/superpowers/specs/2026-08-20-meeshy-composer-execution-spec.md` (§D lot E, §B3 lois 2-6, budgets P15).

## Global Constraints

- Fichiers POSSÉDÉS : `apps/ios/Meeshy/Features/Main/Views/StoryViewerView*.swift`, `FeedPostCard.swift`, `PostDetailView.swift`, `ReelsPlayerView.swift`, `ReelFeedCard.swift`, `ViewModels/ReelsViewModel.swift`, `Components/BackgroundSoundBadge.swift` (nouveau). (Revue Fable n°6 : `ReelsView*.swift` n'existe pas — les vrais fichiers Réels sont nommés ici, et C n'en touche AUCUN.)
- Consomme (gelé) : `BackgroundAudioAnnouncement` + `AudioChipDisplay.backgroundAnnouncement(...)` (B5), `MeeshyScenePlayer(document:mode:)` (B4), `StoryEffects.canvasV3` (B7).
- Les invariants du reader sont des LOIS : rail figé à l'entrée du slide, né en pause, le cache gèle le fade — aucune assertion existante ne doit rougir.
- Cellules du fil : hauteur EXPLICITE autour du player (le piège self-sizing récursif est documenté) — jamais de hosting self-sizing.
- `↻` sans verbe : DÉJÀ conforme iOS (2026-08-19) — assertion de non-régression seulement.

---

### Task E1: L'annonce du fond — un résolveur, trois surfaces

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift` (header — l'actuel note+onde/marquee ad hoc)
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift` (rangée auteur, après `↻ @handle`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift` (rangée auteur — le vrai fichier)
- Create: `apps/ios/Meeshy/Features/Main/Components/BackgroundSoundBadge.swift` (LA vue commune — ♫〰 ou marquee crédit, à partir de l'enum B5)
- Test: `apps/ios/MeeshyTests/Unit/Views/BackgroundSoundBadgeTests.swift` + garde `BackgroundAnnouncementWiringGuardTests.swift`

**Interfaces:**
- Produces : `BackgroundSoundBadge(announcement: BackgroundAudioAnnouncement, accentHex: String)` — rend `EmptyView` pour `.none` (loi 5 : pas de piste, RIEN — pas de placeholder), ♫〰 pour `.original`, marquee `« titre · @pseudo · M:SS »` pour `.credit` (métadonnées nil ⇒ « ♫ — », JAMAIS la note+onde).
- **`accentHex` = l'accent déterministe du POST** (rév. 2, revue totale C8 :
  `FeedPostCard.accentColor == post.authorColor`, `FeedPostCard.swift:93` —
  le chrome de carte entier reste teinté par lui, `surfaceGradient`/bordure
  `:498/:501` : assertion de NON-régression dans la garde de câblage). Sur
  carte claire (thème light), le badge suit le précédent
  `mentionColor`/`hashtagColor` pour rester AA (revue totale U16).

- [ ] **Step 1: Tests rouges** — la vue : `.none ⇒` corps vide (garde de source : `EmptyView`) ; `.original ⇒` note+onde (les deux glyphes, note PUIS onde — la convention testée du header) ; `.credit("Nuits d'été","sam",15) ⇒` texte contenant `Nuits d'été · @sam · 0:15` ; `.credit(nil,nil,nil) ⇒` contient `♫` et PAS l'onde. Garde de câblage : les TROIS surfaces appellent `AudioChipDisplay.backgroundAnnouncement(` et montent `BackgroundSoundBadge` ; le header de story ne fabrique PLUS son affichage sonore ad hoc (assertion négative sur l'ancien chemin, commentaires filtrés).
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** — les métadonnées viennent des MÊMES champs de post qui nourrissent déjà `AudioChipDisplay.resolve` au viewer (`StoryViewerView.swift:1790` — lire ce site, réutiliser ses champs, ne rien inventer) ; la provenance vient de `storyEffects.canvasV3?.sound` quand le fil a servi v3, sinon du legacy (`backgroundAudioId` ⇒ bibliothèque, `voiceAttachmentId` ⇒ original) — CE mapping est le miroir exact du convertisseur §C2, écrit une fois dans un helper `backgroundSound(of:)` app-side testé.
- [ ] **Step 4: Vert + gardes UI (catalogue, RTL).** **Step 5: Commit.**

---

### Task E2: Le bouton 🔇 — trois surfaces, monté si piste seulement

**Files:**
- Modify: `FeedPostCard.swift` (rangée d'engagement), `PostDetailView.swift`, `StoryViewerView+Sidebar.swift` (le rail a déjà son muet — assertion de non-régression seulement), `ReelsPlayerView.swift` (idem si présent, sinon ajout)
- Test: `apps/ios/MeeshyTests/Unit/Views/MuteButtonExistenceGuardTests.swift`

- [ ] **Step 1: Tests rouges (source)** — carte et détail : le bouton n'est monté QUE si `announcement != .none` (loi 6 — même condition d'existence que l'annonce, un seul prédicat partagé, pas deux) ; le tap bascule le muet du LECTEUR LOCAL de la surface (l'état global du viewer story reste `isGlobalMuted`, inchangé) ; l'icône dit l'état (`speaker.slash` ↔ `speaker.wave.2`).
- [ ] **Step 2-5:** rouge → implémentation (le prédicat vit avec `backgroundSound(of:)` d'E1) → vert → commit.

---

### Task E3: La scène dans la carte — `MeeshyScenePlayer(.card)`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift`
- Test: `apps/ios/MeeshyTests/Unit/Views/FeedPostCardScenePlayerGuardTests.swift`

- [ ] **Step 1: Tests rouges (source)** —
  1. quand `post.storyEffects?.canvasV3 != nil`, la carte monte `MeeshyScenePlayer(document:…, mode: .card, …)` — et le mode `.card` est né en pause + muet (déjà verrouillé côté SDK par `ScenePlayerConfig`, l'assertion ici vérifie le MODE passé) ;
  2. le player est enveloppé d'un `.frame(height:` EXPLICITE (aspect 9:16 borné par une hauteur max de carte — le piège self-sizing récursif est la raison, la citer en commentaire) ;
  3. le tap route vers le plein écran EXISTANT (même chemin que l'embed de story reposté — pas de nouveau viewer) ;
  4. AUCUN `AVPlayer`/décodage actif dans la carte (assertion négative : le mode `.card` seul, jamais `.reader`). DÉCISION CONSIGNÉE (revue Fable n°25) : la carte de POST naît en pause — c'est une surface NEUVE, le mouvement est au tap ; les cartes RÉEL du fil GARDENT leur autoplay muet existant (`ReelFeedAutoplayCoordinator`, intouché) — le « autoplay muet » de P15 reste vrai là où il existait.
- [ ] **Step 2-5:** rouge → implémentation → vert → captures de la carte (avec scène / sans scène) → commit.

---

### Task E4: Le viewer story adopte le ScenePlayer (`.reader`)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift` (l'hôte canvas de `StoryCardView`)
- Test: `apps/ios/MeeshyTests/Unit/Views/StoryViewerScenePlayerGuardTests.swift`

- [ ] **Step 1: Test rouge (source)** — `StoryCardView` monte `MeeshyScenePlayer(… mode: .reader …)` à l'endroit exact où vivait l'hôte canvas direct (`StoryReaderRepresentable`, `StoryViewerView+Canvas.swift:1192` — défini côté SDK `Story/Canvas/`, possédé par B : le swap est le point de couture B4→E4) ; les couches de chrome (progress bars, header, rail, `ReferenceNoteRow`, commentaires) sont INCHANGÉES autour (assertions positives sur leur présence — la refonte ne touche que la couche contenu) ; l'ancien hôte direct n'est plus référencé DANS ce fichier (il vit désormais sous le ScenePlayer, côté SDK).
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** — swap minimal : le document vient de `currentStory.storyEffects` (v3 → `canvasV3` ; legacy → `CanvasV3(migrating:)` B2 — un seul chemin de sortie). Les bindings existants (lecture/pause, muet, progression) passent par les paramètres du player.
- [ ] **Step 4: `meeshy.sh test` COMPLET** — c'est la tâche à plus fort rayon : TOUTES les suites du viewer (scrub, gestes, invariants, référence expirée, NOTE row) doivent rester vertes SANS modification. Une suite qui rougit = le swap a trahi un invariant : corriger le swap, jamais le test.
- [ ] **Step 5: Captures avant/après (story texte, story vidéo, story v3).** **Step 6: Commit.**

---

### Task E5: Non-régression `↻` + gate final

- [ ] Assertion de non-régression : l'attribution de la carte reste `↻ @handle` sans verbe (le test posé le 2026-08-19 existe — le lancer, ne rien réécrire).
- [ ] `./apps/ios/meeshy.sh test` complet vert ; captures des trois surfaces jointes au commit final.
- [ ] Merge : après D, avant C (ordre spec).

## Hors périmètre (dit une fois)

Réels : bascule du pipeline vidéo vers ScenePlayer (post-v1 — le réel reste son lecteur vidéo actuel, seule l'ANNONCE et le 🔇 changent ici) · feuille d'engagement commune (post-v1) · réponse privée P/R (P14, hors lots) · toute retouche du composer (lot C).
