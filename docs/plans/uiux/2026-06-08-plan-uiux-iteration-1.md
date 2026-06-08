# Plan UI/UX — Itération 1 (2026-06-08)

**Référence :** `docs/analyses/uiux/2026-06-08-audit-uiux-iteration-1.md`  
**Branch :** `claude/dazzling-hawking-w0tHu`

---

## Itération 1 — Scope (cette session)

### I1.1 Web: v2/AudioPlayer — Speed Control ✅ FAIRE
- **Fichier :** `apps/web/components/v2/AudioPlayer.tsx`
- Ajouter `playbackRate` state (valeurs: 0.5, 1, 1.25, 1.5, 2)
- Bouton speed cycle dans la zone time display (compact, badge style)
- Synchroniser `audioRef.current.playbackRate`
- **Impact :** Parité avec SimpleAudioPlayer, feature attendue WhatsApp/Telegram

### I1.2 Web: Scroll-to-bottom — Badge unread ✅ FAIRE
- **Fichier :** `apps/web/components/conversations/ConversationMessages.tsx`
- Tracker `newMessagesWhileScrolled`: s'incrémente quand `showScrollButton && nouveaux messages`
- Badge rouge au-dessus du bouton scroll si `> 0`
- Reset quand l'utilisateur scrolle vers le bas
- **Impact :** Feature manquante vs WhatsApp/Telegram, UX très visible

### I1.3 iOS: MessageOverlayMenu — Forward ✅ FAIRE
- **Fichiers :** `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift`
- Ajouter `var onForward: (() -> Void)?` aux props
- Ajouter l'action "Transférer" dans `overlayActions` (après Reply, avant Thread)
- Icon : `arrowshape.right.fill`, color : `34D399` (vert success)
- Dans `ConversationView.swift` : câbler `onForward` → `composerState.forwardMessage = msg`
- **Impact :** Forward découvrable dans le menu (aujourd'hui: swipe seulement)

### I1.4 iOS: VoiceOver Custom Actions sur les bulles ✅ FAIRE
- **Fichier :** `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift` (ou ThemedMessageBubble)
- Ajouter `.accessibilityAction(named: "Repondre") { onReply?() }` etc.
- Actions à exposer : Repondre, Copier, Supprimer (conditionnel si canDelete)
- **Impact :** VoiceOver users peuvent accéder aux actions sans activer le long-press

---

## Itération 2 — Backlog (prochaines sessions)

### I2.1 Web: Keyboard shortcuts global
- Escape → fermer modal/sidebar actif
- `⌘K` / `Ctrl+K` → ouvrir GlobalSearch
- `⌘/` / `Ctrl+/` → afficher help overlay avec liste des raccourcis
- Implémentation : `useEffect` sur `document.addEventListener('keydown')`

### I2.2 Web: MessageActionsBar — Forward
- Ajouter bouton Forward dans `MessageActionsBar.tsx`
- Créer `ForwardDialog` (liste conversations, recherche)
- Appeler `POST /api/v1/messages/:id/forward` (si endpoint existe)

### I2.3 iOS + Web: Conversation accent colors dans les bulles web
- Exposer `conversation.accentColor` depuis le gateway dans les métadonnées
- Utiliser pour le dégradé des bulles "moi" à la place du hardcode indigo
- Nécessite audit de `MessageContent.tsx` et `BubbleMessage.tsx`

### I2.4 iOS: MiniAudioPlayerBar accent color
- Étendre `ActiveAudioContext` avec `accentColorHex: String?` (SDK)
- Utiliser dans la barre de progression et l'avatar fallback
- Nécessite modification du SDK

### I2.5 Web: Aria-labels i18n
- Parcourir tous les `aria-label` en dur dans les composants
- Remplacer par clés `t('a11y.xxx')`
- Ajouter namespace `a11y` dans locales/

### I2.6 iOS: Empty states avec illustrations
- Créer `EmptyStateIllustration` composant (SVG/lottie)
- Conversation list vide, recherche vide, feed vide
- Style cohérent avec le brand indigo

### I2.7 iOS: Scroll-to-bottom badge unread
- Même logique que I1.2 mais iOS
- `ConversationView` : track `newMessagesCount` quand user a scrollé vers le haut
- Afficher badge rouge sur le bouton scroll (déjà présent via `ConversationScrollControlsView`)

### I2.8 Web: Fixed → absolute scroll button
- `ConversationMessages.tsx:555` : remplacer `fixed z-50` par positionnement relatif
- Évite le conflit z-index avec les modales

---

## Itération 3 — Vision long terme

### I3.1 Message scheduling (web + iOS)
- Timestamp d'envoi différé
- UI de sélection date/heure dans le composer

### I3.2 Disappearing messages UI
- `expiresAt` existe dans le schema
- UI "Timer" dans la bulle + settings per-conversation

### I3.3 View-once photos
- `isViewOnce` dans schema et modèles
- Câbler la logique de suppression après visualisation

### I3.4 Polls / Quizzes
- Nouveau type de message
- Builder dans le composer

---

## Métriques de succès Itération 1

| Métrique | Avant | Cible |
|---------|-------|-------|
| Forward menu iOS | ❌ Non trouvable | ✅ Visible dans overlay |
| Audio speed web | ⚠️ SimpleAudioPlayer only | ✅ v2/AudioPlayer parity |
| Scroll badge | ❌ Absent | ✅ Badge rouge avec count |
| VoiceOver actions | ❌ 0 actions | ✅ Reply, Copy, Delete |
