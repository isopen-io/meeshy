# Phase 6 MessageComposer - Design Animations & Glassmorphisme

**Date:** 2026-01-29
**Auteur:** Architecture Team + User Collaboration
**Version:** 1.0
**Statut:** ✅ Validé

---

## Vue d'ensemble

Transformation du MessageComposer en une expérience **épurée, dynamique et vibrante** avec :
- ✨ Glassmorphisme premium avec bordure gradient animée
- 🎭 Animations fluides orchestrées (bounce, stagger, glow)
- ⚡ Performance adaptative selon profil appareil (high/medium/low)
- 📱 Optimisé mobile + desktop avec touch optimization
- ♿ Accessibilité WCAG 2.1 AA + prefers-reduced-motion
- 🧪 Tests complets (unit, a11y, performance, E2E)

**Approche technique:** CSS Modules + Framer Motion
**Priorité:** Core First (glassmorphisme → SendButton → Toolbar → Glow → Polish)

---

## 1. Architecture & Organisation

### 1.1 Structure des fichiers

```
components/common/message-composer/
├── index.tsx                          # Composant principal (existant)
├── MessageComposer.module.css         # Glassmorphisme + styles base
├── animations/
│   ├── SendButton.tsx                 # SendButton avec Framer Motion
│   ├── ToolbarButtons.tsx             # Mic + Attachment staggered
│   ├── GlassContainer.tsx             # Conteneur unifié glassmorphique
│   └── DynamicGlow.tsx                # Glow pulsant sur typing
├── hooks/
│   ├── useAnimationConfig.ts          # Config selon performance profile
│   └── useTypingGlow.ts               # Calcul couleur glow selon caractères
└── __tests__/
    ├── animations.test.tsx            # Tests Framer Motion
    ├── animations.a11y.test.tsx       # Tests accessibilité
    ├── performance.test.ts            # Tests performance (FPS, memory)
    └── e2e/
        ├── animations.visual.spec.ts  # Régression visuelle
        └── performance.spec.ts        # Paint time, jank detection
```

### 1.2 Stratégie d'intégration progressive

**Phase 6.1: Glassmorphisme Foundation (2-3h)**
- Créer `GlassContainer.tsx` avec CSS Module
- Remplacer conteneur actuel dans `index.tsx`
- Tests: rendu, modes light/dark, performance profiles

**Phase 6.2: SendButton Animé (2h)**
- Créer `animations/SendButton.tsx` avec Framer Motion
- Variants: bounce + rotate + gradient animé
- Tests: apparition/disparition, clicks, disabled state

**Phase 6.3: Toolbar Staggered (2h)**
- Créer `animations/ToolbarButtons.tsx`
- Stagger au focus/hover (Mic +50ms, Attachment +100ms)
- Tests: apparition, callbacks, location optionnel

**Phase 6.4: Dynamic Glow (2-3h)**
- Hook `useTypingGlow` (calcul couleurs)
- Composant `DynamicGlow` wrapper
- Tests: couleurs selon %, shimmer high-perf

**Phase 6.5: Tests & Optimisations (3-4h)**
- Tests E2E Playwright (visuel + performance)
- Benchmarks FPS, paint time, memory
- Lighthouse CI setup
- Documentation finale

**Total estimé:** 11-14h de développement

### 1.3 Dépendances

```json
{
  "dependencies": {
    "framer-motion": "^11.0.0"
  },
  "devDependencies": {
    "jest-axe": "^8.0.0",
    "@playwright/test": "^1.40.1"
  }
}
```

---

## 2. Configuration des Animations

### 2.1 Hook useAnimationConfig

```typescript
// hooks/useAnimationConfig.ts
import { usePerformanceProfile } from '@/hooks/usePerformanceProfile';

export interface AnimationConfig {
  staggerDelay: number;
  duration: number;
  enableBlur: boolean;
  enableShimmer: boolean;
  enableRotation: boolean;
  blurAmount: number;
  spring: object;
}

export const useAnimationConfig = (): AnimationConfig => {
  const profile = usePerformanceProfile();

  return {
    // Timing
    staggerDelay: profile === 'high' ? 0.05 : profile === 'medium' ? 0.08 : 0,
    duration: profile === 'high' ? 0.4 : profile === 'medium' ? 0.3 : 0.2,

    // Effects
    enableBlur: profile === 'high',
    enableShimmer: profile === 'high',
    enableRotation: profile === 'high',
    blurAmount: profile === 'high' ? 20 : profile === 'medium' ? 16 : 8,

    // Springs (Framer Motion)
    spring: profile === 'high'
      ? { type: 'spring', stiffness: 400, damping: 25 }
      : { type: 'tween', duration: 0.3 },
  };
};
```

### 2.2 Variants Framer Motion standardisés

**SendButton (bounce + rotate):**
```typescript
const sendButtonVariants = {
  hidden: { scale: 0, rotate: 15, opacity: 0 },
  visible: {
    scale: [0, 1.15, 1],      // Bounce
    rotate: [15, -3, 0],       // Swing
    opacity: 1,
    transition: {
      duration: 0.4,
      times: [0, 0.6, 1],
      ease: [0.34, 1.56, 0.64, 1], // Bounce cubic-bezier
    }
  },
  exit: { scale: 0, rotate: -15, opacity: 0 },
  hover: { scale: 1.05 },
  tap: { scale: 0.95 }
};
```

**Toolbar (stagger):**
```typescript
const toolbarContainerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05,  // 50ms entre enfants
      delayChildren: 0.1,
    }
  }
};

const toolbarButtonVariants = {
  hidden: { y: 10, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.25 } }
};
```

### 2.3 Gestion prefers-reduced-motion

Framer Motion respecte automatiquement `prefers-reduced-motion`. Forçage manuel si besoin :

```typescript
import { useReducedMotion } from 'framer-motion';

const shouldReduceMotion = useReducedMotion();
const variants = shouldReduceMotion
  ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
  : fullAnimationVariants;
```

---

## 3. Glassmorphisme CSS Module

### 3.1 Structure principale

```css
/* MessageComposer.module.css */
.glassContainer {
  position: relative;
  backdrop-filter: blur(var(--glass-blur)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(180%);
  background: rgba(255, 255, 255, 0.75);
  border-radius: 16px;
  overflow: visible;

  /* GPU acceleration */
  transform: translateZ(0);
  backface-visibility: hidden;

  /* Ombre colorée */
  box-shadow: 0 8px 32px rgba(59, 130, 246, 0.15);

  /* Variables dynamiques */
  --glass-blur: 20px;
  --border-gradient: linear-gradient(
    135deg,
    rgba(59, 130, 246, 0.3),
    rgba(147, 51, 234, 0.2),
    rgba(59, 130, 246, 0.3)
  );
}

/* Bordure gradient animée */
.glassContainer::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  padding: 1px;
  background: var(--border-gradient);
  background-size: 200% 200%;
  animation: gradientShift 3s ease infinite;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  z-index: 1;
}

/* Reflet interne (lumière haut) */
.glassContainer::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6), transparent);
  border-radius: 16px 16px 0 0;
  pointer-events: none;
  z-index: 2;
}

@keyframes gradientShift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
```

### 3.2 Mode sombre

```css
.glassContainer[data-theme="dark"] {
  background: rgba(17, 24, 39, 0.75);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);

  --border-gradient: linear-gradient(
    135deg,
    rgba(59, 130, 246, 0.4),
    rgba(147, 51, 234, 0.3),
    rgba(59, 130, 246, 0.4)
  );
}

.glassContainer[data-theme="dark"]::after {
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
}
```

### 3.3 Performance profiles

```css
/* Medium: blur réduit */
.glassContainer[data-performance="medium"] {
  --glass-blur: 16px;
  backdrop-filter: blur(16px) saturate(150%);
}

/* Low: blur minimal, pas d'animation */
.glassContainer[data-performance="low"] {
  --glass-blur: 8px;
  backdrop-filter: blur(8px);
}

.glassContainer[data-performance="low"]::before {
  animation: none;
  background-position: 0% 50%;
}
```

---

## 4. Glow Dynamique sur Typing

### 4.1 Hook useTypingGlow

```typescript
// hooks/useTypingGlow.ts
interface UseTypingGlowProps {
  currentLength: number;
  maxLength: number;
  isTyping: boolean;
}

export const useTypingGlow = ({ currentLength, maxLength, isTyping }: UseTypingGlowProps) => {
  const percentage = (currentLength / maxLength) * 100;

  const getGlowColor = () => {
    if (percentage < 50) return 'rgba(59, 130, 246, 0.4)';      // Bleu
    if (percentage < 90) return 'rgba(139, 92, 246, 0.4)';      // Violet
    if (percentage < 100) return 'rgba(236, 72, 153, 0.4)';     // Rose
    return 'rgba(239, 68, 68, 0.5)';                            // Rouge
  };

  const getGlowIntensity = () => Math.min(percentage / 100, 1);

  return {
    glowColor: getGlowColor(),
    glowIntensity: getGlowIntensity(),
    shouldGlow: isTyping && currentLength > 0,
    isNearLimit: percentage >= 90,
  };
};
```

### 4.2 CSS Glow pulsant

```css
.glowWrapper[data-glowing="true"] .glassContainer {
  box-shadow:
    0 0 calc(20px * var(--glow-intensity)) var(--glow-color),
    0 0 calc(30px * var(--glow-intensity)) var(--glow-color),
    0 8px 32px rgba(59, 130, 246, 0.15);
  animation: glowPulse 2s ease-in-out infinite;
}

@keyframes glowPulse {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.05); }
}

/* Shimmer (high performance) */
.glowWrapper[data-glowing="true"][data-performance="high"] .glassContainer::before {
  background:
    var(--border-gradient),
    linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  background-size: 200% 200%, 200% 100%;
  animation:
    gradientShift 3s ease infinite,
    glassShimmer 2s linear infinite;
}

@keyframes glassShimmer {
  0% { background-position: 0% 50%, -200% center; }
  100% { background-position: 100% 50%, 200% center; }
}
```

---

## 5. SendButton Animé

### 5.1 Composant SendButton

```typescript
// animations/SendButton.tsx
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2 } from 'lucide-react';

export const SendButton: React.FC<SendButtonProps> = ({
  onClick, disabled, isProcessing, hasContent
}) => {
  const animConfig = useAnimationConfig();

  const buttonVariants = {
    hidden: { scale: 0, rotate: animConfig.enableRotation ? 15 : 0, opacity: 0 },
    visible: {
      scale: animConfig.enableRotation ? [0, 1.15, 1] : [0, 1],
      rotate: animConfig.enableRotation ? [15, -3, 0] : 0,
      opacity: 1,
      transition: {
        duration: animConfig.duration,
        times: animConfig.enableRotation ? [0, 0.6, 1] : undefined,
        ease: animConfig.enableRotation ? [0.34, 1.56, 0.64, 1] : 'easeOut',
      }
    },
    exit: { scale: 0, rotate: animConfig.enableRotation ? -15 : 0, opacity: 0 },
    hover: { scale: 1.05 },
    tap: { scale: 0.95 }
  };

  return (
    <AnimatePresence mode="wait">
      {hasContent && (
        <motion.button
          variants={buttonVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          whileHover={!disabled ? "hover" : undefined}
          whileTap={!disabled ? "tap" : undefined}
          className={styles.sendButton}
          aria-label="Envoyer le message"
        >
          {isProcessing ? <Loader2 /> : <Send />}
          <div className={styles.sendButtonGradient} />
        </motion.button>
      )}
    </AnimatePresence>
  );
};
```

### 5.2 CSS SendButton

```css
.sendButton {
  position: absolute;
  bottom: 12px;
  right: 12px;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  overflow: hidden;
  transform: translateZ(0);
  backface-visibility: hidden;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  box-shadow:
    0 4px 16px rgba(59, 130, 246, 0.4),
    0 2px 8px rgba(139, 92, 246, 0.3);
}

.sendButtonGradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6, #ec4899, #3b82f6);
  background-size: 300% 300%;
  animation: gradientFlow 4s ease infinite;
  z-index: 1;
}

@keyframes gradientFlow {
  0%, 100% { background-position: 0% 50%; }
  25% { background-position: 50% 0%; }
  50% { background-position: 100% 50%; }
  75% { background-position: 50% 100%; }
}

.sendButton[data-performance="low"] .sendButtonGradient {
  animation: none;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
}
```

---

## 6. Toolbar Staggered

### 6.1 Composant ToolbarButtons

```typescript
// animations/ToolbarButtons.tsx
export const ToolbarButtons: React.FC<ToolbarButtonsProps> = ({
  onMicClick, onAttachmentClick, isFocused, disabled
}) => {
  const animConfig = useAnimationConfig();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: animConfig.staggerDelay,
        delayChildren: 0.1,
      }
    }
  };

  const buttonVariants = {
    hidden: { y: 10, opacity: 0, scale: 0.9 },
    visible: { y: 0, opacity: 1, scale: 1 },
    hover: { scale: 1.1 },
    tap: { scale: 0.95 }
  };

  return (
    <motion.div
      className={styles.toolbar}
      variants={containerVariants}
      initial="hidden"
      animate={isFocused ? "visible" : "hidden"}
    >
      <motion.button variants={buttonVariants} whileHover="hover" whileTap="tap">
        <Mic />
      </motion.button>
      <motion.button variants={buttonVariants} whileHover="hover" whileTap="tap">
        <Paperclip />
      </motion.button>
    </motion.div>
  );
};
```

### 6.2 CSS Toolbar

```css
.toolbar {
  position: absolute;
  bottom: 12px;
  left: 12px;
  display: flex;
  gap: 8px;
}

.toolbarButton {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(59, 130, 246, 0.2);
  box-shadow:
    0 2px 8px rgba(59, 130, 246, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
  transform: translateZ(0);
  transition: all 0.2s ease;
}

.toolbarButton:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
}

@media (max-width: 768px) {
  .toolbarButton {
    width: 44px;
    height: 44px;
    touch-action: manipulation;
  }
}
```

---

## 7. Tests

### 7.1 Tests Unitaires

```typescript
// __tests__/animations.test.tsx
describe('SendButton Animations', () => {
  it('should appear when hasContent is true');
  it('should show loader when processing');
  it('should call onClick when clicked');
  it('should not call onClick when disabled');
});

describe('ToolbarButtons Animations', () => {
  it('should show toolbar when focused');
  it('should show location button when showLocation');
  it('should call callbacks when clicked');
});

describe('DynamicGlow', () => {
  it('should calculate correct glow color based on %');
  it('should stop glowing when not typing');
});
```

### 7.2 Tests Accessibilité

```typescript
// __tests__/animations.a11y.test.tsx
describe('Animations Accessibility', () => {
  it('SendButton should have no a11y violations');
  it('ToolbarButtons should have no a11y violations');
  it('should respect prefers-reduced-motion');
});
```

### 7.3 Tests Performance

```typescript
// __tests__/performance.test.ts
describe('Animation Performance', () => {
  it('should adapt based on performance profile');
  it('should disable heavy animations on low perf');
  it('should measure animation render time < 500ms');
});

// __tests__/e2e/performance.spec.ts
test('should maintain 60fps during typing');
test('should not increase memory > 5MB');
test('should handle simultaneous animations without jank');
```

### 7.4 Régression Visuelle

```typescript
// __tests__/e2e/animations.visual.spec.ts
test('SendButton appearance with animation');
test('Toolbar appear on focus');
test('Glow appear when typing');
test('Rapid typing without glitches');
```

---

## 8. Performance Budgets

| Métrique | Target | Maximum |
|----------|--------|---------|
| **FPS** | 60fps | 50fps |
| **First Paint** | < 800ms | < 1000ms |
| **Animation Render** | < 300ms | < 500ms |
| **Memory Increase** | < 3MB | < 5MB |
| **Jank Frames** | < 3% | < 8% |
| **Lighthouse Performance** | > 95 | > 90 |
| **CLS** | < 0.05 | < 0.1 |

---

## 9. Checklist d'Implémentation

### Phase 6.1: Glassmorphisme (2-3h)
- [ ] Créer `MessageComposer.module.css` avec styles glass
- [ ] Créer `animations/GlassContainer.tsx`
- [ ] Intégrer dans `index.tsx`
- [ ] Tests: rendu, dark mode, performance profiles
- [ ] Commit: `feat(composer): add glassmorphism container`

### Phase 6.2: SendButton (2h)
- [ ] Créer `animations/SendButton.tsx` avec Framer Motion
- [ ] Variants bounce + rotate + gradient animé
- [ ] Tests: apparition/exit, clicks, disabled
- [ ] Commit: `feat(composer): add animated SendButton`

### Phase 6.3: Toolbar (2h)
- [ ] Créer `animations/ToolbarButtons.tsx`
- [ ] Stagger 50ms entre boutons
- [ ] Tests: focus trigger, callbacks
- [ ] Commit: `feat(composer): add staggered toolbar animations`

### Phase 6.4: Glow (2-3h)
- [ ] Hook `useTypingGlow` avec calcul couleurs
- [ ] Composant `DynamicGlow` wrapper
- [ ] Tests: couleurs selon %, shimmer
- [ ] Commit: `feat(composer): add dynamic glow on typing`

### Phase 6.5: Tests & Polish (3-4h)
- [ ] Tests E2E Playwright (visual + perf)
- [ ] Benchmarks FPS, paint, memory
- [ ] Lighthouse CI setup
- [ ] Documentation finale
- [ ] Commit: `test(composer): add complete animation test suite`

---

## 10. Références

- [Framer Motion Docs](https://www.framer.com/motion/)
- [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [CSS Glassmorphism](https://css.glass/)
- [Performance Budget](https://web.dev/performance-budgets-101/)
