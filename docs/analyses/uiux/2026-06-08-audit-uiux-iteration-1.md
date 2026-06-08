# Audit UI/UX — Itération 1 (2026-06-08)

**Périmètre :** Web (Next.js 15) + iOS (SwiftUI)  
**Méthode :** Exploration statique des composants + audit git (PRs #329–#335)  
**Précédent :** Aucune analyse UI/UX dédiée — analyses générales dans `docs/routine/analyses/`

---

## 1. Contexte — Ce qui a été livré récemment

| PR | Contenu UI/UX |
|----|---------------|
| #332 | Virtual scrolling web, next/image attachments |
| #334 | i18n strings iOS + web (LanguagePickerSheet, MiniAudioPlayerBar, RootViewComponents) |
| #335 | Internationalisation UI strings, loading-state, EmptyStates, ConversationSidebar |

---

## 2. Findings iOS

### 2.1 Forward manquant dans le menu long-press ❌ PRIORITÉ HAUTE
- **Fichier :** `MessageOverlayMenu.swift` `overlayActions` (lignes 955–1016)
- Le sheet `ForwardPickerSheet.swift` (257 lignes, complet) existe
- Le geste swipe (`onSwipeForward`) est câblé dans `ConversationView.swift:979-984`
- Mais le menu overlay long-press n'a **pas** de bouton "Forward"
- Résultat : feature non-découvrable pour la majorité des utilisateurs

### 2.2 Absence de VoiceOver Custom Actions sur les bulles ❌ PRIORITÉ HAUTE
- `MessageOverlayMenu.swift` expose Reply, Copy, Pin, Star, Edit, Delete
- Aucune de ces actions n'est exposée via `.accessibilityAction()`
- Les utilisateurs VoiceOver doivent activer le menu long-press avec un geste complexe
- **Correction :** `.accessibilityAction(named:)` sur `ThemedMessageBubble` ou `BubbleStandardLayout`

### 2.3 MiniAudioPlayerBar couleur hardcodée ⚠️ PRIORITÉ MOYENNE
- `MiniAudioPlayerBar.swift:124,142` — `Color(hex: "6366F1")` et `Color(hex: "4338CA")` hardcodés
- Le mini-player est un composant global (flottant), l'indigo brand est la couleur intentionnelle
- Cependant la barre de progression devrait avoir un tint variable selon la conversation active
- `ActiveAudioContext` ne contient pas `accentColor` → nécessiterait modification SDK
- **Décision :** Garder indigo pour l'avatar (brand global) ; à faire en itération 2 si SDK étendu

### 2.4 Empty states iOS sans illustrations ⚠️ PRIORITÉ BASSE
- Seulement des SF Symbols, pas d'illustrations
- Strings localisées (correct)
- Comparé à WhatsApp/Telegram qui ont des illustrations spécifiques

### 2.5 Skeleton loaders limités ⚠️ PRIORITÉ BASSE
- `SkeletonVisibilityResolver` applique correctement cache-first
- Pas de custom shimmer views — `.redacted(reason: .placeholder)` système
- Acceptable pour l'instant

---

## 3. Findings Web

### 3.1 v2/AudioPlayer sans contrôle de vitesse ❌ PRIORITÉ HAUTE
- `components/v2/AudioPlayer.tsx` (362 lignes) : play/pause + waveform mais **pas de speed control**
- `components/audio/SimpleAudioPlayer.tsx` : a 0.5x/1x/1.5x/2x via `handlePlaybackRateChange`
- Incohérence entre les deux lecteurs audio
- **Correction :** Ajouter bouton speed cycle 1x→1.5x→2x→0.5x→1x à v2/AudioPlayer

### 3.2 Scroll-to-bottom sans badge de nouveaux messages ❌ PRIORITÉ HAUTE
- `ConversationMessages.tsx:547-576` : bouton scroll sans indicateur de messages non lus
- Quand l'utilisateur scrolle vers le haut, de nouveaux messages arrivent sans signal visuel
- WhatsApp et Telegram affichent un compteur sur le bouton
- **Correction :** Tracker les messages reçus pendant que `showScrollButton === true`, afficher un badge

### 3.3 Aucun raccourci clavier global ❌ PRIORITÉ MOYENNE
- `ApplicationSettings.tsx` mentionne "Enable keyboard shortcuts" mais non implémenté
- Seuls l'emoji grid et l'audio player ont des raccourcis locaux
- Manque : Escape (fermer modales), `⌘K`/`Ctrl+K` (recherche globale), `⌘/` (aide)

### 3.4 Couleurs de bulles hardcodées ⚠️ PRIORITÉ MOYENNE
- `MessageContent.tsx:125-126` : `from-indigo-500 to-indigo-700` hardcodé pour les messages envoyés
- La préférence `accentColor` existe en base de données mais n'est pas utilisée pour les bulles
- Le système de couleur per-conversation (`conversation.accentColor`) n'est pas exposé au web
- **Note :** Ceci nécessite une refonte du composant BubbleMessage — à traiter en itération 2

### 3.5 Bouton scroll positionné en `fixed` avec z-index élevé ⚠️ PRIORITÉ BASSE
- `ConversationMessages.tsx:555` : `fixed z-50` — problème potentiel avec les modales z>50
- Devrait être `absolute` dans un contexte `relative` au lieu de `fixed`

### 3.6 aria-labels en dur (non-i18n) ⚠️ PRIORITÉ BASSE
- `ConversationMessages.tsx:567` : `aria-label="Scroll to top"` en dur anglais
- Devrait utiliser la clé i18n `t('scrollToBottom')` etc.
- Plusieurs composants affectés

---

## 4. Comparaison concurrents (scope UI/UX)

| Feature | WhatsApp | Telegram | Meeshy Web | Meeshy iOS |
|---------|----------|----------|------------|------------|
| Forward (menu) | ✅ | ✅ | ❌ | ⚠️ (swipe seulement) |
| Audio speed | ✅ | ✅ | ⚠️ (SimpleAudioPlayer only) | ✅ |
| Scroll badge count | ✅ | ✅ | ❌ | ❌ |
| Keyboard shortcuts web | ✅ | ✅ | ❌ | N/A |
| VoiceOver actions | ✅ | ✅ | Partiel | ❌ |
| Accent color bubbles | N/A | N/A | ❌ | ✅ |

---

## 5. Score UX par axe

| Axe | Score | Notes |
|-----|-------|-------|
| Design / Cohérence visuelle | 7/10 | Bonne cohérence brand indigo, quelques hardcodes |
| Dark mode | 8/10 | Bien implémenté sur iOS + web |
| i18n | 8/10 | Couverture quasi-complète, quelques aria-labels |
| Accessibilité (a11y) | 5/10 | Labels OK, custom VoiceOver actions manquants |
| Navigation | 8/10 | NavigationStack iOS solide, web Next.js App Router |
| Deep Links | 9/10 | iOS très complet, web conversationnel OK |
| Contenu / Copy | 8/10 | Copy bien fait, Forward partiellement caché |
| Audio UX | 7/10 | Speed présent iOS, manquant v2/AudioPlayer web |
| Skeleton / Loading | 7/10 | Cache-first correct, quelques améliorations possibles |
| Scroll UX | 6/10 | Bouton scroll sans badge unread |

---

## 6. Non-régressions vérifiées

Les analyses précédentes ont traité :
- ✅ Virtual scrolling (PR #332)
- ✅ i18n strings (PRs #334, #335)
- ✅ Loading states EmptyStates (PR #335)
- ✅ Connection status indicator (PR #335)
- ✅ next/image optimization (PR #332)

Cette analyse se concentre sur des axes **non traités** par les itérations précédentes.
