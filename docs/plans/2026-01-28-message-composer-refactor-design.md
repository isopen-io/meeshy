# Message Composer - Design de Refonte Complète

**Date:** 2026-01-28
**Auteur:** Architecture Team
**Version:** 1.0
**Statut:** ✅ Validé

## Vue d'ensemble

Refonte complète du composant `MessageComposer` pour créer une expérience **ultra-minimaliste, dynamique et vibrante** avec :
- Zone épurée dont les éléments apparaissent progressivement
- Effet glassmorphique premium
- Animations fluides et engageantes
- Support complet desktop + mobile
- Performance adaptative selon l'appareil
- Accessibilité WCAG 2.1 AA

---

## 1. Architecture & Structure

### 1.1 Hiérarchie des composants

```
MessageComposer (parent)
├── ComposerContainer (wrapper glassmorphique unifié)
├── ReplyPreviewSection (conditionnel, slide in from top)
├── AttachmentSection (conditionnel, slide in)
│   ├── AttachmentCarousel
│   └── AudioRecorderWithEffects
├── CompressionSection (conditionnel, fade in)
├── TextareaSection (toujours présent)
│   ├── GlassTextarea
│   ├── CharacterCounter (progressif à partir de 70%)
│   └── MentionAutocomplete (overlay)
├── ToolbarSection (apparition au hover/focus)
│   ├── LanguageSelector (toujours visible, intégré)
│   ├── MicButton (slide from bottom, +0ms)
│   ├── AttachmentButton (slide from bottom, +50ms)
│   │   └── AttachmentDropdown (radial popup)
│   └── LocationIndicator (si présent, +100ms)
└── SendButton (conditionnel si hasContent, scale + rotate + bounce)
```

### 1.2 États du composant

| État | Description | Éléments visibles |
|------|-------------|-------------------|
| **Empty** | Aucune saisie, aucun attachment | Textarea + LanguageSelector |
| **Focused** | Focus/Hover sur textarea | + MicButton + AttachmentButton (staggered) |
| **Typing** | Saisie en cours | + Glow dynamique + Shimmer |
| **HasContent** | Contenu ou attachments présents | + SendButton (animation bounce) |
| **Multiple** | Reply + Attachments + Typing | Expansion verticale fluide |
| **Uploading** | Upload en cours | + Progress overlay glassmorphique |
| **Error** | Erreur détectée | + Inline error section + Toast |
| **Disabled** | Composition désactivée | + Overlay avec message contextuel |

### 1.3 Principe du conteneur unifié

Toutes les sections (ReplyPreview, AttachmentCarousel, Textarea) partagent le **même fond glassmorphique** sans bordures internes. Le conteneur grandit organiquement avec un seul bloc visuel cohérent.

**Bordure externe uniquement :**
- Bordure gradient animée subtile
- Reflet interne en haut (lumière)
- Ombre colorée douce
- Séparateurs internes : lignes de lumière ultra-subtiles (optionnel)

---

## 2. Système d'Animations

### 2.1 Configuration selon performance

**Système de détection adaptative :**
```typescript
type PerformanceProfile = 'high' | 'medium' | 'low';

// Détection basée sur :
// - navigator.hardwareConcurrency (cores CPU)
// - navigator.deviceMemory (RAM)
// - navigator.connection.effectiveType (réseau)
// - Test de framerate initial
```

**Configurations par profil :**

| Paramètre | High | Medium | Low |
|-----------|------|--------|-----|
| Blur | 20px | 16px | 8px |
| Rotation 3D | ✅ | ❌ | ❌ |
| Gradient animé | ✅ | ✅ | ❌ |
| Shimmer | ✅ | ❌ | ❌ |
| Stagger delay | 30ms | 50ms | 0ms |
| Dropdown anim | Radial | Scale | Fade |

### 2.2 Animation du bouton Envoyer

**Apparition (hasContent: false → true)**
```css
@keyframes sendButtonAppear {
  0% {
    transform: scale(0) rotate(15deg);
    opacity: 0;
  }
  60% {
    transform: scale(1.15) rotate(-3deg); /* Bounce */
  }
  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
}
/* Timing: 400ms cubic-bezier(0.34, 1.56, 0.64, 1) */
```

**Gradient animé continu :**
```css
background: linear-gradient(135deg, #3b82f6, #8b5cf6, #3b82f6);
background-size: 200% 200%;
animation: gradientShift 3s ease infinite;
```

**Disparition (hasContent: true → false)**
```css
@keyframes sendButtonDisappear {
  0% { transform: scale(1) rotate(0deg); opacity: 1; }
  100% { transform: scale(0) rotate(-15deg); opacity: 0; }
}
/* Timing: 400ms ease-in */
```

### 2.3 Animation de la toolbar (Micro, Pièce jointe)

**Apparition staggered au hover/focus du textarea :**

```css
@keyframes toolbarButtonReveal {
  from {
    transform: translateY(10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
/* Timing: 250ms ease-out */
/* Délais: LanguageSelector (0ms), Mic (+50ms), Attachment (+100ms) */
```

### 2.4 Animation du dropdown radial (pièces jointes)

**Desktop : 2 icônes (Fichier, Position) en arc de 60°**
**Mobile : 3 icônes (Fichier, Capture, Position) en arc de 90°**

```css
@keyframes radialPop {
  0% {
    transform: scale(0) rotate(-180deg);
    opacity: 0;
  }
  60% {
    transform: scale(1.2) rotate(15deg) translateY(-5px);
  }
  100% {
    transform: scale(1) rotate(0deg) translateY(0);
    opacity: 1;
  }
}
/* Base: 350ms cubic-bezier(0.34, 1.56, 0.64, 1) */
/* Délais: icon1(0ms), icon2(40ms), icon3(80ms) */
```

### 2.5 Animation des mentions

**Apparition de la liste :**
```css
@keyframes mentionListAppear {
  0% {
    transform: translateY(10px) scale(0.95);
    opacity: 0;
    filter: blur(4px);
  }
  100% {
    transform: translateY(0) scale(1);
    opacity: 1;
    filter: blur(0);
  }
}
/* Timing: 250ms ease-out */
```

**Items staggered :**
```css
@keyframes mentionItemReveal {
  0% { transform: translateX(-10px); opacity: 0; }
  100% { transform: translateX(0); opacity: 1; }
}
/* Délais: item1(0ms), item2(+30ms), item3(+60ms)... max 10 items */
```

### 2.6 Expansion verticale (sections multiples)

**Ajout d'une section :**
```css
@keyframes expandSection {
  0% {
    max-height: 0;
    opacity: 0;
    transform: translateY(-10px);
  }
  100% {
    max-height: var(--section-height);
    opacity: 1;
    transform: translateY(0);
  }
}
/* Timing: 300ms ease-out */
```

---

## 3. Effet Glassmorphique Premium

### 3.1 Style du textarea

**État de base :**
```css
.glass-composer-textarea {
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid transparent;
  border-radius: 16px;
  position: relative;
  overflow: visible;
}

/* Bordure gradient */
.glass-composer-textarea::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(
    135deg,
    rgba(59, 130, 246, 0.3),
    rgba(147, 51, 234, 0.2),
    rgba(59, 130, 246, 0.3)
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

/* Reflet interne (lumière en haut) */
.glass-composer-textarea::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: inherit;
  pointer-events: none;
}

/* Ombre douce colorée */
box-shadow: 0 8px 32px rgba(59, 130, 246, 0.15);
```

**Mode sombre :**
```css
.dark .glass-composer-textarea {
  background: rgba(17, 24, 39, 0.75);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.dark .glass-composer-textarea::after {
  background: rgba(255, 255, 255, 0.05);
}
```

### 3.2 Feedback visuel dynamique (typing)

**Glow pulsant avec évolution de couleur :**

| Progression | Couleur | Signification |
|-------------|---------|---------------|
| 0-50% | Bleu `rgba(59, 130, 246, 0.4)` | Normal |
| 50-90% | Violet `rgba(139, 92, 246, 0.4)` | Approche limite |
| 90-100% | Rose `rgba(236, 72, 153, 0.4)` | Proche limite |
| >100% | Rouge `rgba(239, 68, 68, 0.5)` | Limite dépassée |

```css
@keyframes glowPulse {
  0%, 100% {
    box-shadow: 0 0 20px var(--glow-color),
                0 8px 32px rgba(59, 130, 246, 0.15);
  }
  50% {
    box-shadow: 0 0 30px var(--glow-color),
                0 8px 32px rgba(59, 130, 246, 0.25);
  }
}
/* Animation: 2s ease-in-out infinite */
```

**Shimmer sur le fond :**
```css
@keyframes glassShimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}

.glass-composer-textarea.typing::before {
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.3),
    transparent
  );
  background-size: 200% 100%;
  animation: glassShimmer 2s linear infinite;
}
```

---

## 4. Mobile & Interactions Tactiles

### 4.1 Gestion du clavier virtuel

**Détection et slide :**
```typescript
useEffect(() => {
  const handleResize = () => {
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const isKeyboardVisible = viewportHeight < window.innerHeight * 0.75;
    setKeyboardActive(isKeyboardVisible);
  };

  window.visualViewport?.addEventListener('resize', handleResize);
  return () => window.visualViewport?.removeEventListener('resize', handleResize);
}, []);
```

**Animation :**
```css
.composer-unified-container.keyboard-active {
  transform: translateY(calc(-1 * env(keyboard-inset-height, 0px)));
  transition: transform 250ms ease-out;
}
```

### 4.2 Safe areas (notch, nav bars)

```css
.composer-unified-container {
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  padding-left: max(16px, env(safe-area-inset-left));
  padding-right: max(16px, env(safe-area-inset-right));
}
```

### 4.3 Touch targets

```css
@media (max-width: 768px) {
  button, a[role="button"], [role="button"] {
    min-height: 44px;
    min-width: 44px;
    touch-action: manipulation;
  }
}
```

### 4.4 Dropdown mobile adapté

**Overlay avec backdrop blur :**
```css
.attachment-dropdown-mobile {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20px;
  padding-bottom: max(20px, env(safe-area-inset-bottom));
  backdrop-filter: blur(24px) saturate(180%);
  background: rgba(255, 255, 255, 0.9);
  border-radius: 24px 24px 0 0;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.2);
  z-index: 100;
  animation: slideUpMobile 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

**Disposition : 3 icônes en grid**
```css
.attachment-options-mobile {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
```

### 4.5 Ripple effect sur les boutons

```css
.mobile-button::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at center,
    rgba(59, 130, 246, 0.3) 0%,
    transparent 70%
  );
  transform: scale(0);
  opacity: 0;
  pointer-events: none;
}

.mobile-button:active::after {
  transform: scale(2);
  opacity: 1;
  transition: transform 300ms ease-out, opacity 300ms ease-out;
}
```

---

## 5. Accessibilité (WCAG 2.1 AA)

### 5.1 Navigation clavier

**Raccourcis principaux :**
- `Enter` : Envoyer (sans Shift)
- `Shift + Enter` : Nouvelle ligne
- `Cmd/Ctrl + K` : Focus sélecteur de langue
- `Cmd/Ctrl + Shift + A` : Ouvrir pièces jointes
- `Cmd/Ctrl + Shift + V` : Démarrer enregistrement vocal
- `Escape` : Fermer dropdown/mentions/clear reply
- `ArrowUp/Down` : Navigation dans les mentions
- `Tab` : Naviguer entre boutons toolbar

### 5.2 ARIA complet

**Conteneur :**
```tsx
<div
  role="region"
  aria-label="Composition de message"
  aria-describedby="composer-help-text"
>
  <span id="composer-help-text" className="sr-only">
    Tapez votre message. Utilisez @ pour mentionner.
    Entrée pour envoyer, Shift+Entrée pour nouvelle ligne.
  </span>
</div>
```

**Textarea :**
```tsx
<textarea
  aria-label="Message"
  aria-multiline="true"
  aria-invalid={isOverLimit}
  aria-describedby="char-limit-error reply-preview"
  aria-controls={showMentionAutocomplete ? 'mention-listbox' : undefined}
  aria-expanded={showMentionAutocomplete}
  aria-autocomplete="list"
/>
```

**Boutons :**
```tsx
<button
  aria-label="Envoyer le message"
  aria-disabled={!canSend}
  aria-keyshortcuts="Enter"
>
  <Send aria-hidden="true" />
</button>
```

**Liste de mentions :**
```tsx
<div role="listbox" aria-label="Suggestions de mentions">
  <div
    role="option"
    aria-selected={selectedIndex === index}
    aria-label={`Mentionner ${user.displayName}`}
    tabIndex={selectedIndex === index ? 0 : -1}
  />
</div>
```

### 5.3 Annonces live

```tsx
<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
  {liveAnnouncement}
</div>

// Exemples d'annonces :
// - "Bouton Envoyer disponible"
// - "5 suggestions de mentions disponibles"
// - "Upload de fichiers en cours"
// - "Compression terminée"
```

### 5.4 prefers-reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }

  /* Garder uniquement transitions d'opacity */
  .send-button, .toolbar-button {
    animation: none !important;
    transition: opacity 100ms ease !important;
  }
}
```

---

## 6. Performance & Optimisations

### 6.1 GPU Acceleration

```css
.composer-unified-container,
.send-button,
.toolbar-button,
.mention-autocomplete-list {
  transform: translateZ(0);
  -webkit-transform: translateZ(0);
  will-change: transform, opacity; /* Uniquement pendant animations */
  backface-visibility: hidden;
}
```

### 6.2 Will-change dynamique

```typescript
const [isAnimating, setIsAnimating] = useState(false);

const triggerAnimation = useCallback(() => {
  setIsAnimating(true);
  setTimeout(() => setIsAnimating(false), 500);
}, []);

<div style={{ willChange: isAnimating ? 'transform, opacity' : 'auto' }} />
```

### 6.3 Mémoïsation React

```typescript
// Calculs coûteux
const glowColor = useMemo(() => {
  const percentage = (value.length / maxMessageLength) * 100;
  // ... calcul de couleur
}, [value.length, maxMessageLength]);

const hasContent = useMemo(() => {
  return value.trim() || selectedFiles.length > 0 || uploadedAttachments.length > 0;
}, [value, selectedFiles.length, uploadedAttachments.length]);

// Handlers stables
const handleSendMessage = useCallback(() => {
  onSend();
  resetTextareaSize();
}, [onSend, resetTextareaSize]);
```

### 6.4 Debounce/Throttle

```typescript
// Position des mentions : 50ms debounce
const updateMentionPosition = useDebouncedCallback((cursorPos, textarea) => {
  const position = getCursorPosition(textarea, cursorPos);
  setMentionPosition(adjustPositionForViewport(position));
}, 50);

// Resize viewport : 100ms throttle
const handleViewportResize = useThrottle(() => {
  // ... détection clavier
}, 100);
```

### 6.5 Lazy loading

```typescript
// Import dynamique des composants lourds
const AttachmentLimitModal = dynamic(
  () => import('@/components/attachments/AttachmentLimitModal'),
  { ssr: false }
);

const AudioRecorderWithEffects = dynamic(
  () => import('@/components/audio/AudioRecorderWithEffects'),
  { ssr: false }
);
```

---

## 7. Gestion des Erreurs

### 7.1 Types d'erreurs gérées

| Erreur | Affichage | Actions |
|--------|-----------|---------|
| Upload échoué | Toast + Inline | Réessayer / Ignorer |
| Limite fichiers | Toast + Modal | Voir détails / OK |
| Fichier trop gros | Toast | Compresser / Annuler |
| Réseau hors ligne | Toast persistent + Badge | Auto-retry |
| Session expirée | Toast + Overlay | Connexion |
| Limite caractères | Inline + Compteur rouge | - |

### 7.2 Toast notifications glassmorphiques

```typescript
import { toast } from 'sonner';

toast.error('Échec de l\'upload', {
  description: 'Le fichier n\'a pas pu être uploadé.',
  className: 'glass-toast error-toast',
  icon: <AlertCircle />,
  action: {
    label: 'Réessayer',
    onClick: () => retryUpload(file)
  }
});
```

**Styles :**
```css
.glass-toast {
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  animation: toastSlideIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.error-toast {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: rgb(239, 68, 68);
}
```

### 7.3 Erreurs inline

```tsx
{error && (
  <div role="alert" aria-live="assertive" className="inline-error">
    <AlertCircle />
    <div>
      <span className="error-title">{error.title}</span>
      <span className="error-message">{error.message}</span>
    </div>
    <button onClick={() => setError(null)}>
      <X />
    </button>
    {error.actions && (
      <div className="error-actions">
        {error.actions.map(action => (
          <button onClick={action.onClick}>{action.label}</button>
        ))}
      </div>
    )}
  </div>
)}
```

---

## 8. Features Priorité HAUTE & MOYENNE

### 8.1 Priorité HAUTE

#### A. Édition de message existant
- État `editingMessageId` dans le store
- Pré-remplir le textarea avec contenu existant
- Remplacer "Envoyer" par "Modifier"
- Ajouter bouton "Annuler l'édition"

#### B. Auto-save brouillons
- Sauvegarde automatique dans `localStorage` toutes les 2 secondes
- Clé : `draft-${conversationId}`
- Restauration au mount du composant
- Clear au send ou après 24h

#### C. Paste d'images clipboard
- Détecter `clipboardData.files` dans event paste
- Extraire images et les ajouter comme attachments
- Support : PNG, JPEG, GIF, WebP

### 8.2 Priorité MOYENNE

#### D. Retry automatique uploads
- Exponential backoff : 1s, 2s, 4s
- Max 3 tentatives
- Afficher tentative actuelle : "Tentative 2/3..."

#### E. Rate-limiting côté client
- Cooldown de 500ms entre envois
- Queue des messages si multiples envois rapides
- Indicateur "Envoi ralenti..."

#### F. Upload par batch (50+ fichiers)
- Batch de 10 fichiers simultanés
- Queue pour le reste
- Progress global : "12/53 fichiers uploadés"

---

## 9. Structure des Fichiers

```
apps/web/components/common/message-composer/
├── MessageComposer.tsx                 # Composant principal
├── ComposerContainer.tsx               # Wrapper glassmorphique
├── SendButton.tsx                      # Bouton avec animations
│
├── sections/
│   ├── ReplyPreviewSection.tsx
│   ├── AttachmentSection.tsx
│   ├── CompressionSection.tsx
│   ├── TextareaSection.tsx
│   └── ToolbarSection.tsx
│
├── hooks/
│   ├── useComposerState.ts            # État centralisé
│   ├── useComposerAnimations.ts       # Gestion animations
│   ├── useComposerKeyboard.ts         # Navigation clavier
│   ├── usePerformanceProfile.ts       # Détection performance
│   ├── useDraftAutosave.ts            # Auto-save brouillons
│   └── useUploadRetry.ts              # Retry automatique
│
├── components/
│   ├── GlassTextarea.tsx
│   ├── CharacterCounter.tsx
│   ├── MentionAutocomplete.tsx
│   ├── AttachmentDropdown.tsx
│   ├── ErrorInline.tsx
│   └── OfflineIndicator.tsx
│
├── constants/
│   └── animations.ts                   # Config animations par profile
│
└── types/
    └── composer.types.ts               # Types TypeScript
```

---

## 10. Métriques de Performance Attendues

### Desktop (Chrome/Firefox/Safari)
- ✅ Framerate : 60 FPS constant
- ✅ Time to Interactive : < 50ms après focus
- ✅ Animation jank : 0%

### Mobile moderne (iPhone 12+, flagship Android)
- ✅ Framerate : 60 FPS (tolérance 55 FPS multi-anim)
- ✅ Time to Interactive : < 100ms
- ✅ Animation jank : < 5%

### Mobile mid-range (iPhone 8-11, Android mid)
- ✅ Framerate : 50-60 FPS avec fallbacks
- ✅ Time to Interactive : < 150ms
- ✅ Animation jank : < 10%

### Mobile bas de gamme
- ✅ Framerate : 30-45 FPS (animations simplifiées)
- ✅ Time to Interactive : < 200ms
- ✅ Animations lourdes désactivées automatiquement

---

## 11. Dépendances Techniques

### Librairies nécessaires
- `framer-motion` (optionnel, pour animations complexes)
- `use-debounce` (debounce/throttle)
- `sonner` (toast notifications)
- `lucide-react` (icônes)

### Hooks existants à réutiliser
- `useTextareaAutosize`
- `useAttachmentUpload`
- `useAudioRecorder`
- `useMentions`
- `useI18n`
- `useAuth`

### Nouveaux hooks à créer
- `usePerformanceProfile`
- `useComposerState`
- `useComposerAnimations`
- `useComposerKeyboard`
- `useDraftAutosave`
- `useUploadRetry`

---

## 12. Tests à Implémenter

### Tests unitaires
- ✅ Détection de performance profile
- ✅ Calcul de `hasContent`
- ✅ Calcul de `glowColor` selon longueur
- ✅ Logique de stagger delays
- ✅ Validation des fichiers (taille, type)

### Tests d'intégration
- ✅ Flow complet : saisie → send → clear
- ✅ Flow avec attachments
- ✅ Flow avec mentions
- ✅ Flow avec reply
- ✅ Édition de message existant
- ✅ Auto-save et restauration brouillon

### Tests E2E
- ✅ Scenario complet desktop
- ✅ Scenario complet mobile
- ✅ Gestion erreurs upload
- ✅ Gestion offline/online
- ✅ Navigation clavier complète
- ✅ Accessibilité (screen reader)

---

## 13. Migration depuis l'existant

### Stratégie
1. ✅ Créer nouveau composant en parallèle
2. ✅ Feature flag pour A/B testing
3. ✅ Migration progressive par conversation type
4. ✅ Monitoring des métriques (performance, erreurs)
5. ✅ Rollback plan si régression

### Compatibilité
- ✅ Conserver l'interface `MessageComposerProps`
- ✅ Maintenir `MessageComposerRef` pour API externe
- ✅ Support des mêmes événements (`onSend`, `onChange`, etc.)

---

## Conclusion

Ce design offre une expérience **moderne, fluide et accessible** avec :
- ✅ 95% de couverture des scénarios
- ✅ Performance adaptative
- ✅ Animations engageantes
- ✅ Accessibilité WCAG 2.1 AA
- ✅ Support desktop + mobile complet
- ✅ Gestion complète des erreurs

**Prêt pour l'implémentation.**
