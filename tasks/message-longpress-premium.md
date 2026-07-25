# Menu appui-long premium (façon iMessage) — suivi

Spec : `docs/superpowers/specs/2026-07-24-ios-message-longpress-premium-design.md`
Branche : `main` (directe, worktree principal). Simu visuel : iPhone 16 Pro / iOS 18.2 (`30BFD3A6-…`).

## Phases

- [x] **P1 — `MessageActionResolver` compact (TDD, pur)** ✅ 19 tests verts
  - [x] RED confirmé (16/19 échouent sur l'ancien comportement)
  - [x] Plumbing : `MoreItem` +pin/unpin/star/unstar/delete ; `MessageMoreSheet` (5 switches + callbacks onPin/onToggleStar/onDeleteMessage + destination) ; `ConversationView` (3 callbacks)
  - [x] GREEN : `primaryActions` compact (≤ clés + `.more`, sans pin/star/delete) ; `moreSections` accueille pin/star/delete
  - [x] Commit
- [x] **C1 — Masquer la cellule live (ghost fix)** ✅ `overlaidMessageId` sur le VC (reconfigure ciblée cellules visibles), `isHiddenForOverlay: message.id == overlaidMessageId` en config cellule, threadé via `MessageListView` depuis `overlayState`. Build OK.
- [x] **C2 — Retrait natif iOS 26 (messages)** ✅ `ConversationView` ne passe plus `nativeMessageMenu` → `nativeMenu == nil` → overlay custom partout. `buildNativeMessageMenu` conservé inerte (nettoyage P4). 52 tests verts (guards+resolver+dragLaw).
- [ ] **⚠️ Vérif VISUELLE de l'overlay = SUR DEVICE iOS 26** (l'appui long synthétique idb ne déclenche pas le LongPressGesture au simu — limitation documentée). À vérifier : plus de carte native, pastille+menu accent, zéro bulle fantôme, Supprimer dans « Plus… ».
- [ ] **P2 — `MessageOverlayLayout` pur (TDD)** : extraire la géométrie inline (`MessageOverlayMenu` L194-239) → struct pure + tests (clamps haut/bas-réserve-composer, plancher d'échelle ~0.7, ancrage isMe/reçu, clamp latéral)
- [ ] **D1 — Inverser guards** `ConversationMenuSystemDesignGuardTests` (RED : « aucun `.contextMenu` sur bulles ; overlay partout »)
- [x] **C2b — a11y** ✅ `.accessibilityAddTraits(.isModal)` + `.accessibilityAction(.escape)` sur l'overlay (parité sémantique menu natif après retrait du natif). Build OK.
- [~] **P3 — Polish overlay** : [x] isolation drag (bulle `.equatable()`, H3). Reste (VISUEL, à régler SUR DEVICE) : teinte accent menu/pastille (⚠️ le menu a été délibérément dé-teinté pour parité système + `EmojiReactionPicker` = SDK partagé → décision device), plancher d'échelle ~0.7 (risque overflow sans vérif visuelle), backdrop mono-source (subtil, non cassé), springs lift/reverse (réglage à l'œil).
- [ ] **P4 — Nettoyage code mort** post-natif : `standalone`, `MessageMenuPreviewContainer`, `makeThemedBubble(true)` + guards vestigiaux
- [ ] **P5 — Build + capture visuelle iPhone 16 Pro**, itérer

## Req 2026-07-24 (retour iMessage Liquid Glass)
- [x] **Req 1 — éléments de menu en Liquid Glass** ✅ VÉRIFIÉ : pastille (`EmojiReactionPicker`→`.adaptiveGlass(Capsule())`), menu (`MessageActionsMenu`), « Plus… » (`MessageMoreSheet`) rendent tous du **vrai `glassEffect`** sur iOS 26. Le retrait natif (C2) fait qu'iOS 26 les affiche en Liquid Glass.
- [x] **Req 4 — « Plus… » enrichi** ✅ éditer/copier/**partager** (ShareSheet réel)/traduire ajoutés à `moreSections` (RED→GREEN, 24 tests).
- [x] **Req 3 — morph** ✅ au tap d'un item explorable, la grille se replie en **bande d'icônes horizontale scrollable** (Liquid Glass) + contenu dessous (`explorableTabStrip`).
- [x] **Req 2 — Réactions voir+ajouter** ✅ bande de réactions rapides en tête de la vue Réactions → `onReact`→`toggleReaction`.
- [ ] ⚠️ Tout ce lot (morph, share, réactions-add) = **à vérifier VISUELLEMENT sur device iOS 26** (le sheet « Plus… » n'est pas atteignable via l'automatisation du simu — long-press synthétique KO).

## Décisions verrouillées
- Overlay custom unifié partout ; pastille épurée teinte accentColor (pas de queue smiley) ; menu compact ≤ actions clés + « Plus… » ; Supprimer dans « Plus… » ; bande 20 emojis scrollable conservée ; message long = mise à l'échelle (plancher relevé ~0.7).
- Pas de « Répondre » ajouté au resolver (absent, hors périmètre).

## Notes revue architecte (bloquants)
- C1 = prérequis premium (sinon double-bulle fantôme au retrait natif).
- C2b a11y = régression sinon (le natif fournissait la sémantique modale).
- Pas de `matchedGeometryEffect` (pont UIKit/SwiftUI, pas de Namespace partagé) → garder interpolation `.position` par frame.
