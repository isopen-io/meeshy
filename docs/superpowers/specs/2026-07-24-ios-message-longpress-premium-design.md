# iOS — Menu « appui long » sur les bulles de message, qualité premium (façon iMessage)

**Date** : 2026-07-24
**Plateforme** : iOS (`apps/ios/Meeshy`, `packages/MeeshySDK`)
**Statut** : Design validé — en attente de relecture utilisateur avant plan d'implémentation

---

## 1. Contexte & problème

L'appui long sur une bulle de message doit donner une impression **premium, façon iMessage** (bulle qui se soulève, fond flouté, barre de réactions flottante au-dessus, menu d'actions compact en dessous), avec une **animation d'apparition et de disparition extrêmement fluide**, pour **tous les types de bulles** : texte, image, carrousel, audio, vidéo.

### Diagnostic de l'existant

Le système possède aujourd'hui **deux chemins mutuellement exclusifs** selon la version d'OS :

- **iOS < 26** : overlay SwiftUI custom `MessageOverlayMenu` (pastille d'emojis flottante séparée au-dessus, vraie bulle surélevée, menu séparé en dessous, fond flou + lueur accentColor, spring + vague d'entrée). **Déjà proche d'iMessage.**
- **iOS 26+** : `.contextMenu` **natif** (Liquid Glass) via `buildNativeMessageMenu`.

**La capture jugée « pas premium » par l'utilisateur est le chemin NATIF iOS 26**, identifié par sa signature : carte blanche unique combinée, rangée d'emojis plafonnée à 4 (limite `ControlGroup(.compactMenu)`), « Plus d'emojis », liste d'actions longue, Delete rouge en bas, et un **platter blanc UIKit** derrière la bulle. Le `.contextMenu` natif **ne peut pas** produire une barre de réactions flottante séparée ni une animation de lift pilotée — c'est une limite structurelle du système.

### Conclusion d'architecture

Abandonner le `.contextMenu` **natif iOS 26 pour les messages** et faire de l'overlay custom `MessageOverlayMenu` le **chemin UNIQUE sur toutes les versions d'iOS**, puis le **polir au niveau iMessage**. Cela **inverse** la décision « natif sur iOS 26 » du 2026-07-14 (assumé : c'est ce natif qui produit le rendu générique).

> Note de portée : cela ne concerne QUE le menu des **messages**. La liste de **conversations** conserve son `.contextMenu` natif iOS 26 (hors sujet ici).

---

## 2. Objectifs / Non-objectifs

### Objectifs
1. Une **seule** présentation d'appui long sur les bulles, **identique** sur toutes les versions iOS supportées.
2. Structure iMessage : **pastille de réactions flottante au-dessus** + **bulle surélevée en place (sans platter)** + **menu compact séparé en dessous** + **fond flou/voile/lueur accent**.
3. Animation d'**apparition** et de **disparition** extrêmement fluide (spring de lift, entrée décalée, fondu du flou), et son **reverse** propre.
4. Fonctionne pour **tous les types de bulles** (texte / image / carrousel / audio / vidéo) via réutilisation de la bulle live.
5. **Identité Meeshy** : pastille de verre épurée (pas de queue/smiley iMessage), teinte **accentColor** de la conversation sur la pastille et le menu (règle du design system).

### Non-objectifs
- Aucune modification du menu de la **liste de conversations**.
- Aucune modification du **modèle de réaction** (1 réaction/user, `toggleReaction` reste la SSOT) ni du protocole socket/REST des réactions.
- Pas de bulle **scrollable** dans l'overlay pour les messages très longs (choix : mise à l'échelle pour tenir — voir §5.6). Le scroll fidèle iMessage est explicitement hors périmètre initial.
- Pas de refonte des vues de bulles (`ThemedMessageBubble`, `BubbleStandardLayout`, …) — on les réutilise telles quelles.

---

## 3. Décisions validées (utilisateur)

| Décision | Choix retenu |
|---|---|
| Architecture | Overlay custom **unifié partout** ; retrait du `.contextMenu` natif iOS 26 pour les messages |
| Identité pastille & menu | Verre **épuré** + teinte **accentColor** ; **pas** de queue/smiley iMessage |
| Densité du menu | **Compact** : ≤ 4 actions primaires visibles + « Plus… » |
| Contenu pastille | **Conserver la bande scrollable ~20 emojis** (chrome poli), + bouton « + » (picker complet) |
| Action Supprimer | **Dans « Plus… »** (avec confirmation ; comportement de confirmation actuel préservé) |
| Message très long | **Mise à l'échelle** pour tenir à l'écran (pas de scroll dans l'overlay) |

---

## 4. Composants & fichiers touchés

| Fichier | Rôle | Changement |
|---|---|---|
| `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` | Présentation overlay, `buildNativeMessageMenu`, split des actions | Retirer la branche native message ; ne plus fournir `nativeMessageMenu` ; router les actions vers `primaryActions`/`overflowActions` |
| `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift` | `ConditionalBubbleLongPress`, `nativeMessageContextMenu` | Long-press **toujours actif** ; `nativeMessageContextMenu` renvoie `self` pour les messages (ou retiré du call site) |
| `apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift` | Config cellule, bascule OS | `enableLongPress` toujours `true` ; ne plus câbler `nativeMessageMenu` ; conserver la suppression de l'`UIContextMenuInteraction` système |
| `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift` | L'overlay custom (cœur) | Polish : chrome pastille accent, ombre de lift bulle, menu compact, springs, mise à l'échelle message long |
| `apps/ios/Meeshy/Features/Main/Components/MessageActionsMenu.swift` | Liste d'actions verticale | Rendre la carte compacte + teinte accent ; row « Plus… » |
| `apps/ios/Meeshy/Features/Main/Components/MessageActionResolver.swift` | Logique pure de composition des actions | **Scinder** en `primaryActions` (≤ 4, sans Delete) + `overflowActions` (reste + Delete) ; reste une fonction pure |
| `apps/ios/MeeshyTests/Unit/Views/ConversationMenuSystemDesignGuardTests.swift` | Guard design system | **Inverser l'invariant** : « overlay custom partout pour les messages » ; le natif message n'est plus attendu sur iOS 26 |
| `apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift` | Tests du resolver | Tests du split primary/overflow (par type de message, ownership, Delete → overflow) |

Réutilisés **sans modification** : `ThemedMessageBubble` (+ `standalone`), `BubbleStandardLayout`, `EmojiReactionPicker`, `EmojiUsageTracker`, `BubbleReactionsOverlay`, `ReactionService`, `ConversationViewModel.toggleReaction`, `MessageFrameTracker`, `MessageOverlayDragLaw`.

---

## 5. Design détaillé

### 5.1 Structure cible

**Message court (envoyé, aligné à droite)**
```
   ╭──────────────────────────────────╮
   │ 😀 ❤️ 👍 😂 😮 🎉 …  (scroll)  ＋ │  pastille flottante (verre + accent), AU-DESSUS
   ╰──────────────────────────────────╯
        ╭──────────────────────────╮
        │  Hello Steve how are      │      la VRAIE bulle, surélevée, ombre douce
        │  you doing ?        16:45 │      (aucun platter blanc)
        ╰──────────────────────────╯
             ╭────────────────────╮
             │ 🌐  Traduire        │        menu COMPACT, teinté accent
             │ ⧉   Copier          │
             │ 📌  Épingler        │
             │ ···  Plus…          │        → Modifier, Favoris, Supprimer…
             ╰────────────────────╯
   fond : flou + voile sombre retenu + lueur accentColor de la conversation
```

**Message long** : pastille tout en haut → bulle mise à l'échelle pour tenir → menu **en bas**.

L'alignement horizontal de la pastille et du menu suit le **côté de la bulle** (leading pour reçu, trailing pour envoyé), calé sur la frame source (`MessageFrameTracker`).

### 5.2 Pastille de réactions (au-dessus)
- Bande **scrollable ~20 emojis** via `EmojiReactionPicker` (top usage `EmojiUsageTracker.topEmojis(count: 20)`), bouton « + » qui ouvre le picker complet.
- **Chrome poli** : capsule de verre (`.adaptiveGlass` iOS 26 / `.ultraThinMaterial` sinon) avec **teinte accentColor** discrète et ombre d'élévation. Pas de queue ni de smiley.
- Vague d'entrée conservée (`WaveTileModifier`, stagger ~0.045) mais synchronisée avec le lift de la bulle (voir §5.5).
- `onReact` → `EmojiUsageTracker.recordUsage` + `ConversationViewModel.toggleReaction` + `dismiss()` (inchangé).

### 5.3 Bulle surélevée (au centre)
- Réutilise la **vraie** `ThemedMessageBubble` avec exactement les params de la cellule live (fidélité pixel-perfect), `.allowsHitTesting(false)`.
- **Ombre de lift** (élévation douce, teinte accent légère) ; **aucun** fond/platter blanc.
- Réactions existantes rendues en overlay lecture seule (`BubbleReactionsOverlay`, callbacks nil) — inchangé.
- Tous types couverts sans code spécifique : le dispatch `ThemedMessageBubble` → `BubbleStandardLayout` gère texte / grille image+vidéo / `carouselView` / audio (simple & `AudioCarouselView`).

### 5.4 Menu d'actions compact (en dessous)
- Carte **compacte** teintée accent, largeur ~240, `.adaptiveGlass`.
- **`primaryActions` (≤ 4)** issues de `MessageActionResolver`, ordre proposé par type (à valider en implémentation) :
  - **Texte (reçu)** : Traduire · Copier · Épingler · **Plus…**
  - **Texte (envoyé, éditable)** : Modifier · Traduire · Copier · **Plus…**
  - **Image / carrousel** : Enregistrer · Copier · Épingler · **Plus…**
  - **Audio** : Enregistrer · Épingler · (Favoris) · **Plus…**
  - **Vidéo** : Enregistrer · Épingler · (Favoris) · **Plus…**
- **`overflowActions`** (feuille « Plus… ») : toutes les actions restantes **+ Supprimer** (rouge, isolé, **confirmation préservée** via `overlayState.deleteConfirmMessageId` — jamais de delete direct).
- Le drag vertical existant (`MessageOverlayDragLaw`) reste : swipe-up fort → ouvre « Plus… », swipe-down fort → dismiss, sinon snap-back. Câblage `.highPriorityGesture` conservé (évite que les Buttons avalent les drags lents).

### 5.5 Animation (apparition / disparition)
Piloté par le `@State isVisible` existant, avec springs affinés :
- **Apparition** : la bulle **se soulève** depuis sa frame source réelle (scale ↑ léger + translation vers la position finale) via `spring(response: ~0.42, dampingFraction: ~0.74)` ; pastille et menu entrent avec un **léger décalé** (offset + opacity + scale depuis le coin de la bulle) ; le **flou de fond monte en fondu** (`easeOut ~0.26`). Haptique `medium` au déclenchement.
- **Disparition** : reverse — la bulle **redescend** vers sa place, pastille/menu se replient, le flou s'efface ; `spring(response: ~0.32, dampingFraction: ~0.86)` puis coupure de `isPresented` après le settle. Haptique `light` optionnelle sur action.
- **Cohérence** : un même `isVisible` orchestre les trois clusters + le backdrop pour un mouvement unifié (pas de désynchronisation).
- Paramètres de spring **à peaufiner sur device** pour le « settle » iMessage (valeurs ci-dessus = point de départ, non contractuelles).

### 5.6 Message très long (bulle plus haute que l'écran)
- La bulle est **mise à l'échelle** (`nlFitScale`, comme le preview actuel) pour tenir dans l'espace disponible entre pastille (haut) et menu (bas), avec un **plancher d'échelle** raisonnable (lisibilité) et un plafond ~55–62 % de la hauteur écran.
- Pastille ancrée en haut, menu ancré en bas. Pas de scroll interne (hors périmètre).

### 5.7 Fond (backdrop)
- Conserver les 3 couches (`.thinMaterial` + voile `Color.black` retenu + `RadialGradient` teinté accentColor), **légèrement renforcées** pour un rendu plus dense/premium. Tap sur le fond → `dismiss()`. Pas d'`UIVisualEffectView`.

---

## 6. Impact sur les tests & garde-fous

- **Inverser** `ConversationMenuSystemDesignGuardTests` : l'invariant devient « les messages utilisent l'overlay custom sur **toutes** les versions ; aucun `.contextMenu` natif attaché aux bulles ». Retirer/adapter `test_messageRow_prefersNativeMenu_oniOS26_withCustomFallback` et `test_buildNativeMessageMenu_*`.
- **`MessageActionResolverTests`** : nouveaux cas pour `primaryActions` (cap ≤ 4, sans Delete) et `overflowActions` (contient Delete + reste), par type de contenu et ownership.
- **`MessageOverlayDragLawTests`** : inchangés (loi de drag réutilisée).
- Vérification device/simulateur : le long-press synthétique idb **ne déclenche pas** un `.contextMenu` natif mais **déclenche** l'overlay custom sur une **grande** bulle (durée ≥ 1.2 s) → la vérif visuelle auto **redevient possible** une fois le natif retiré. Cible large recommandée.
- `./apps/ios/meeshy.sh test` (schemes concernés) doit passer avant tout commit.

---

## 7. Risques & mitigations

| Risque | Mitigation |
|---|---|
| Régression Liquid Glass en retirant le natif iOS 26 | L'overlay custom utilise déjà `.adaptiveGlass` (Liquid Glass réel sur 26) pour pastille/menu ; parité visuelle assurée |
| Icônes de menu invisibles (piège `.tint(.clear)` du wrapper de scroll) | Ne pas propager de tint clair ; forcer `.tint(accent)` sur les surfaces de menu (cf. incident `MeeshyRefreshableScroll`) |
| Drags lents avalés par les Buttons du menu | Conserver `.highPriorityGesture(minimumDistance ≥ 12)` + `@GestureState(resetTransaction:)` |
| Crash de contenu de menu (AnyView instable, EXC_BAD_ACCESS) | Ne pas réintroduire de builder générique ré-exécuté ; contenu résolu une fois |
| Mixage avec le WIP settings/profile de la branche courante | Réaliser le travail dans un **worktree dédié** off `dev` (voir §9) |
| Message long peu lisible après mise à l'échelle | Plancher d'échelle + option de scroll différée si retour utilisateur |

---

## 8. Critères d'acceptation

1. Un appui long sur une bulle (texte/image/carrousel/audio/vidéo) affiche **toujours** l'overlay custom, sur toutes les versions iOS — **aucun** menu natif blanc, **aucun** platter derrière la bulle.
2. La **pastille de réactions** flotte au-dessus de la bulle, teinte accentColor, scrollable + « + », **sans** queue/smiley.
3. Le **menu** est compact (≤ 4 actions + « Plus… »), teinté accent ; **Supprimer** est dans « Plus… » avec confirmation.
4. L'**apparition** (lift + entrée décalée + fondu du flou) et la **disparition** (reverse) sont fluides, sans à-coups, avec haptique.
5. Un **message très long** tient à l'écran (mise à l'échelle), pastille en haut, menu en bas.
6. `MessageActionResolver` expose `primaryActions`/`overflowActions` purs et testés ; guard tests inversés ; suite iOS verte.

---

## 9. Notes d'implémentation (isolation git)

Le travail sera fait dans un **worktree dédié** créé off `dev` (ex. `../v2_meeshy-feat-ios-message-longpress-premium`, branche `feat/ios-message-longpress-premium`) afin de **ne pas mélanger** avec le WIP `fix/settings-profile-wiring-audit` en cours dans le worktree principal. Le `project.pbxproj` (aucun nouveau fichier prévu) reste géré côté dernier merge. Commits réguliers, worktree propre, suite iOS verte à chaque lot.

---

## 10. Hors périmètre (différé)
- Bulle **scrollable** dans l'overlay pour les messages très longs (fidélité iMessage #3).
- Menu de la **liste de conversations** (conserve le natif iOS 26).
- Réactions par **attachment** individuel (le modèle existant `attachment:reaction-*` reste inchangé).
- Parité **web / Android** de ce menu (ce design est iOS-only).

---

## 11. Révisions post-revue architecte (2026-07-24)

Revue de conception indépendante (ios-architect-expert). Deux points **bloquants** que le design initial sous-estimait, plus des arbitrages :

### Prérequis BLOQUANTS (pas du polish)
- **C1 — Masquer la cellule live sous l'overlay.** `MessageRowEnvelope` (`isHiddenForOverlay`, cross-fade 16 ms) est **du code mort jamais câblé**. Aujourd'hui le `.contextMenu` natif iOS 26 masque+soulève la vraie cellule gratuitement ; **retirer le natif expose une double-bulle fantôme sur toutes les versions** (la copie liftée se détache et découvre la cellule live floutée dessous). → Câbler le masquage de la cellule ciblée **AVANT** tout réglage d'animation : c'est ce qui fait lire le lift comme premium. Pousser l'id masqué au `MessageListViewController`, reconfigurer **uniquement** cette cellule (envelope Equatable), révéler en sync avec le settle du dismiss.
- **C2 — Accessibilité.** Le natif fournissait la sémantique VoiceOver (modal, liste, piège de focus, escape). L'overlay custom n'a rien. → Ajouter `.accessibilityAddTraits(.isModal)`, `.accessibilityAction(.escape) { dismiss() }`, labels sur pastille/actions, ordre de focus. Non négociable (règle a11y projet).

### Arbitrages
- **Menu compact = réconcilier avec `moreSections`, PAS de surface parallèle (D2).** `primaryActions` devient compact (actions clés + `.more` toujours présent ; `.delete`/`.star`/`.pin` **jamais** en primaire). Tout ce qui sort du primaire est routé vers le `MessageMoreSheet` existant (SSOT « Plus… ») : j'étends `MoreItem`/`moreSections` avec `pin/unpin`, `star/unstar`, `delete`, et je câble la confirmation de suppression message (aujourd'hui seul `deleteMedia` confirme).
- **Message très long (D3).** Le plancher d'échelle 0.4 rend le texte illisible → relever le plancher (~0.7) + fondu de troncature bas ; scroll fidèle iMessage reste différé (§10).
- **Pastille (D4).** Garder la bande 20 emojis scrollable, mais **ne pas** étendre le drag vertical (Plus…/dismiss) à la pastille (conflit scroll horizontal ↔ dismiss vertical) — le drag reste sur le menu d'actions.

### Fluidité (mise en œuvre)
- **Pas de `matchedGeometryEffect`** : cellule dans `UIHostingConfiguration` d'UICollectionView, overlay dans l'arbre SwiftUI de `ConversationView` → aucun `Namespace` partagé possible. Garder l'**interpolation manuelle par frame** (`.position` source↔cible) déjà en place.
- **Une seule source d'animation** : retirer le `.animation(_, value: isVisible)` implicite du backdrop, piloter son opacité par un `withAnimation` explicite (easeOut flou / spring clusters) pour éviter le rebond (résout M2).
- **Isoler le drag (H3)** : un seul `.offset` lisant `clusterDragOffset`, bulle en sous-vue Equatable pour que le drag 60 fps ne ré-instancie pas `ThemedMessageBubble`. Hoister `currentUserId` en `let`.
- `.compositingGroup()` sur la bulle liftée (composite ombre+scale une fois) ; **jamais** `.drawingGroup()` (rasterise le texte pendant le scale).

### Ordre TDD (pur d'abord)
1. **`MessageActionResolver`** — compact `primaryActions` + `moreSections` étendu (RED = réécrire les 8 tests existants).
2. **Extraire `MessageOverlayLayout` pur** depuis la géométrie inline de `MessageOverlayMenu` (entrées bubbleRect/insets/écran/hauteurs → sorties positions/scale/anchor) + tests des clamps (haut, bas-réserve-composer, plancher d'échelle, ancrage isMe/reçu, clamp latéral). Actuellement 0 test.
3. **`MessageOverlayDragLaw`** — déjà pur & couvert, réutiliser.
4. **Inverser les guards** (`ConversationMenuSystemDesignGuardTests`) : nouvel invariant « aucun `.contextMenu` sur les bulles ; overlay partout » (RED), puis retirer `test_messageRow_prefersNativeMenu_*` et `test_buildNativeMessageMenu_*`.
5. **Nettoyage code mort** post-retrait natif : `standalone`, `MessageMenuPreviewContainer`, `makeThemedBubble(true)` + leurs guards.

### Purement visuel (simulateur iPhone 16 Pro / iOS 18.2)
Params spring, densité flou/lueur/ombre, stagger, timing lift/reverse, haptique ; **sync masquage cellule (C1)** = zéro ghost/flash ; Dynamic Type AX5, dark/light, RTL, placement bords/composer.
