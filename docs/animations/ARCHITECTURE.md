# Architecture des Animations

## Vue d'Ensemble

Le système d'animations est construit sur 3 piliers:

1. **Adaptive Performance**: Profils high/medium/low détectés automatiquement
2. **CSS-First Approach**: CSS pour effets visuels, Framer Motion pour orchestration
3. **Composable Design**: Chaque composant est indépendant et réutilisable

## Diagramme d'Architecture

```
MessageComposer
├── DynamicGlow (overlay, z-index: 0)
│   └── useTypingGlow hook
│       └── Calcule couleur basée sur percentage
└── GlassContainer (wrapper, z-index: 1)
    ├── Data attributes (theme, performance)
    ├── Glassmorphisme CSS
    └── Children
        ├── ToolbarButtons (stagger)
        │   └── Framer Motion containerVariants
        └── SendButton (bounce + rotation)
            └── Framer Motion buttonVariants
```

## Composants en Détail

### GlassContainer

**Responsabilités**:
- Glassmorphisme avec backdrop-filter blur
- Gradient border animé
- Dark mode support
- Performance adaptative

**Props**:
```typescript
interface GlassContainerProps {
  children: React.ReactNode;
  className?: string;
  theme?: 'light' | 'dark';
  performanceProfile?: 'high' | 'medium' | 'low';
}
```

**Data Attributes**:
- `data-theme`: "light" | "dark"
- `data-performance`: "high" | "medium" | "low"

**CSS Techniques**:
- `backdrop-filter: blur()` pour glassmorphisme
- Pseudo-element `::before` pour gradient border
- `mask-composite` pour border effect
- `@keyframes gradientShift` pour animation

**Structure CSS**:
```css
.glassContainer {
  position: relative;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(var(--blur-amount));
  border-radius: 16px;
}

.glassContainer::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 16px;
  padding: 2px;
  background: linear-gradient(135deg, colors...);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  animation: gradientShift 8s ease infinite;
}
```

**Adaptive Blur**:
```typescript
// High: 20px, Medium: 16px, Low: 8px
const blurAmount = performanceProfile === 'high' ? 20 :
                   performanceProfile === 'medium' ? 16 : 8;
```

### DynamicGlow

**Responsabilités**:
- Glow overlay basé sur typing activity
- Progression de couleur (4 zones)
- Pulse animation (2s normal, 1s warning)

**Hook Integration**:
```typescript
const { glowColor, glowIntensity, shouldGlow, isNearLimit } = useTypingGlow({
  currentLength: message.length,
  maxLength: MAX_MESSAGE_LENGTH,
  isTyping: isTyping,
});
```

**CSS Variables**:
- `--glow-color`: rgba(r, g, b, a)
- `--glow-intensity`: 0-1

**Animation**:
```css
@keyframes glowPulse {
  0%, 100% { transform: scale(1); opacity: var(--glow-intensity); }
  50% { transform: scale(1.02); opacity: calc(var(--glow-intensity) * 0.8); }
}

.glowOverlay {
  animation: glowPulse var(--pulse-duration) ease-in-out infinite;
}
```

**Color Progression**:
```typescript
// Zone 1 (0-50%): Blue
rgba(59, 130, 246, intensity * 0.2)

// Zone 2 (50-90%): Violet
rgba(139, 92, 246, intensity * 0.3)

// Zone 3 (90-100%): Pink
rgba(236, 72, 153, intensity * 0.4)

// Zone 4 (>100%): Red
rgba(239, 68, 68, intensity * 0.5)
```

**Pulse Speed**:
```typescript
const pulseDuration = isNearLimit ? '1s' : '2s';
```

### ToolbarButtons

**Responsabilités**:
- Stagger entrance animation
- Hover/tap interactions
- Glassmorphism buttons

**Framer Motion Pattern**:
```typescript
const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: config.staggerDelay, // 50ms/80ms/0ms
    },
  },
};

const buttonVariants = {
  hidden: { scale: 0, y: 10, opacity: 0 },
  visible: {
    scale: 1,
    y: 0,
    opacity: 1,
    transition: {
      type: config.transitionType, // 'spring' or 'tween'
      ...config.springConfig,
    },
  },
  hover: { scale: 1.05 },
  tap: { scale: 0.95 },
};
```

**Adaptive Stagger**:
```typescript
// High: 50ms (sequential reveal)
// Medium: 80ms (slower, smoother)
// Low: 0ms (simultaneous)
```

**Button Structure**:
```typescript
<motion.div variants={containerVariants} initial="hidden" animate="visible">
  <motion.button variants={buttonVariants} whileHover="hover" whileTap="tap">
    <MicIcon />
  </motion.button>
  <motion.button variants={buttonVariants} whileHover="hover" whileTap="tap">
    <AttachmentIcon />
  </motion.button>
</motion.div>
```

### SendButton

**Responsabilités**:
- Bounce entrance avec rotation
- Hover/tap states
- Loading spinner
- Gradient animé

**Variants**:
```typescript
const buttonVariants = {
  hidden: { scale: 0, rotate: 15, opacity: 0 },
  visible: {
    scale: [0, 1.15, 1],      // Bounce: start → overshoot → settle
    rotate: [15, -3, 0],       // Swing: right → left → center
    opacity: [0, 1, 1],
    transition: {
      times: [0, 0.6, 1],      // Timing points
      duration: 0.6,
      ease: 'easeOut',
    },
  },
  hover: {
    scale: 1.05,
    boxShadow: '0 8px 16px rgba(59, 130, 246, 0.3)',
  },
  tap: { scale: 0.95 },
};
```

**Adaptive Rotation**:
```typescript
// High profile: rotation enabled
if (config.enableRotation) {
  variants.visible.rotate = [15, -3, 0];
} else {
  variants.visible.rotate = 0; // No rotation for medium/low
}
```

**Loading State**:
```typescript
{isLoading ? (
  <motion.div
    animate={{ rotate: 360 }}
    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
  >
    <LoadingSpinner />
  </motion.div>
) : (
  <SendIcon />
)}
```

**Gradient Animation**:
```css
@keyframes gradientFlow {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.sendButton {
  background: linear-gradient(135deg, #3B82F6, #8B5CF6, #EC4899);
  background-size: 200% 200%;
  animation: gradientFlow 3s ease infinite;
}
```

## Hooks en Détail

### useAnimationConfig

**Responsabilité**: Détecter profil performance et retourner config adaptative

**API**:
```typescript
function useAnimationConfig(): AnimationConfig;

interface AnimationConfig {
  enableBlur: boolean;
  blurAmount: number;
  enableShimmer: boolean;
  enableRotation: boolean;
  staggerDelay: number;
  transitionType: 'spring' | 'tween';
  springConfig: { stiffness: number; damping: number };
}
```

**Détection**:
```typescript
const profile = usePerformanceProfile(); // 'high' | 'medium' | 'low'

// Détection basée sur:
// - CPU cores (navigator.hardwareConcurrency)
// - Memory (navigator.deviceMemory)
// - GPU tier (WebGL renderer)
```

**Configs**:
```typescript
// High Performance
{
  enableBlur: true,
  blurAmount: 20,
  enableShimmer: true,
  enableRotation: true,
  staggerDelay: 50,
  transitionType: 'spring',
  springConfig: { stiffness: 400, damping: 25 },
}

// Medium Performance
{
  enableBlur: true,
  blurAmount: 16,
  enableShimmer: false,
  enableRotation: false,
  staggerDelay: 80,
  transitionType: 'tween',
  springConfig: null,
}

// Low Performance
{
  enableBlur: true,
  blurAmount: 8,
  enableShimmer: false,
  enableRotation: false,
  staggerDelay: 0,
  transitionType: 'tween',
  springConfig: null,
}
```

### useTypingGlow

**Responsabilité**: Calcul couleur et intensité basés sur character percentage

**API**:
```typescript
function useTypingGlow(props: TypingGlowProps): TypingGlowState;

interface TypingGlowProps {
  currentLength: number;
  maxLength: number;
  isTyping: boolean;
}

interface TypingGlowState {
  glowColor: string;
  glowIntensity: number;
  shouldGlow: boolean;
  isNearLimit: boolean;
}
```

**Formule**:
```typescript
const percentage = (currentLength / maxLength) * 100;

// Intensity: 0 → 1 basé sur percentage
const intensity = Math.min(percentage / 100, 1);

// Color zones
if (percentage < 50) {
  // Blue zone
  glowColor = `rgba(59, 130, 246, ${intensity * 0.2})`;
} else if (percentage < 90) {
  // Violet zone
  glowColor = `rgba(139, 92, 246, ${intensity * 0.3})`;
} else if (percentage < 100) {
  // Pink zone (warning)
  glowColor = `rgba(236, 72, 153, ${intensity * 0.4})`;
} else {
  // Red zone (over limit)
  glowColor = `rgba(239, 68, 68, ${intensity * 0.5})`;
}
```

**Conditions**:
```typescript
shouldGlow = isTyping && currentLength > 0;
isNearLimit = percentage >= 90;
```

**Debouncing**:
```typescript
// Typing inactivity timer
useEffect(() => {
  if (isTyping) {
    const timer = setTimeout(() => {
      setIsTyping(false); // Fade out glow after 2s
    }, 2000);
    return () => clearTimeout(timer);
  }
}, [isTyping, currentLength]);
```

## Flow d'Animation

### 1. Page Load (Component Mount)

```
Timeline:
0ms    → GlassContainer mount
50ms   → GlassContainer visible (fade in)
100ms  → ToolbarButtons mount
150ms  → Mic button visible (stagger child 1)
200ms  → Attachment button visible (stagger child 2)
250ms  → SendButton mount
850ms  → SendButton visible (bounce + rotation, 600ms duration)
```

**Séquence**:
1. GlassContainer apparaît avec fade-in (opacity 0 → 1)
2. Glassmorphisme effect s'active (backdrop-filter blur)
3. Gradient border animation démarre (8s loop)
4. ToolbarButtons trigger stagger sequence
5. Mic button scale 0 → 1 avec delay 0ms
6. Attachment button scale 0 → 1 avec delay 50ms
7. SendButton bounce entrance (scale 0 → 1.15 → 1) + rotation (15° → -3° → 0°)

### 2. Typing Activity

```
Timeline:
0ms    → User types character
1ms    → setIsTyping(true), currentLength increments
2ms    → useTypingGlow recalculates
3ms    → DynamicGlow shouldGlow = true
4ms    → Glow opacity 0 → 1 (CSS transition 200ms)
204ms  → Glow visible at full intensity
...    → User continues typing (glow color progresses)
2000ms → (no activity) setIsTyping(false)
2001ms → DynamicGlow shouldGlow = false
2200ms → Glow opacity 1 → 0 (CSS transition 200ms)
```

**États**:
- **Inactive** (shouldGlow = false): opacity 0, no animation
- **Active** (shouldGlow = true): opacity 1, glowPulse animation
- **Near Limit** (isNearLimit = true): faster pulse (1s vs 2s), pink/red color

**Color Transition**:
```
0-50%:   Blue (#3B82F6)    - Normal typing
50-90%:  Violet (#8B5CF6)  - Approaching limit
90-100%: Pink (#EC4899)    - Warning
>100%:   Red (#EF4444)     - Over limit
```

### 3. Near Limit Warning

```
Timeline:
0ms    → currentLength reaches 90% of maxLength
1ms    → useTypingGlow detects isNearLimit = true
2ms    → DynamicGlow updates CSS variable --pulse-duration = 1s
3ms    → Glow color switches to pink
4ms    → Pulse animation speeds up (2s → 1s)
```

**Visual Changes**:
- Pulse frequency doubles (2s → 1s)
- Color changes to pink (#EC4899)
- Intensity increases (0.3 → 0.4)
- Transform scale increases (1.02 → 1.03)

### 4. Send Message

```
Timeline:
0ms    → User clicks SendButton
1ms    → whileTap variant triggers (scale 0.95)
50ms   → onClick handler fires
51ms   → isLoading = true
52ms   → SendIcon replaced with LoadingSpinner
53ms   → Spinner rotation animation starts (360° loop, 1s duration)
...    → Message sends (async)
1000ms → isLoading = false
1001ms → LoadingSpinner replaced with SendIcon
1002ms → Button returns to normal state
```

## Performance Stratégies

### CSS-First Approach

**Rationale**: CSS animations run on compositor thread (GPU), avoiding main thread blocking.

**Exemples**:
```css
/* Glassmorphisme - GPU accelerated */
.glassContainer {
  backdrop-filter: blur(20px);
  transform: translateZ(0); /* Force GPU layer */
}

/* Gradient animation - GPU accelerated */
@keyframes gradientShift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

/* Glow pulse - GPU accelerated */
@keyframes glowPulse {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.02); opacity: 0.6; }
}
```

**Avantages**:
- No JavaScript execution during animation
- Smooth 60fps même avec main thread busy
- Lower battery consumption
- Better mobile performance

### Framer Motion for Orchestration

**Rationale**: Framer Motion excellent pour animations complexes nécessitant orchestration.

**Use Cases**:
- **Stagger**: Séquencer révélation de multiple éléments
- **Bounce**: Orchestrer scale + rotation avec timing précis
- **Conditional Variants**: Adapter animation selon état (loading, disabled)

**Exemple**:
```typescript
// Bounce nécessite synchronisation scale + rotate
const buttonVariants = {
  visible: {
    scale: [0, 1.15, 1],      // 3 keyframes
    rotate: [15, -3, 0],      // 3 keyframes
    times: [0, 0.6, 1],       // Timing sync
  },
};
```

**Pourquoi pas CSS?**: CSS ne peut pas synchroniser précisément 2 animations avec keyframes différents.

### Adaptive Rendering

**Rationale**: Adapter complexité selon device capabilities pour maintenir 60fps.

**Décisions**:
```typescript
// High profile: All effects
if (profile === 'high') {
  renderShimmer();
  renderRotation();
  setStagger(50);
  setBlur(20);
}

// Medium profile: Essential effects only
if (profile === 'medium') {
  skipShimmer();
  skipRotation();
  setStagger(80);
  setBlur(16);
}

// Low profile: Minimal effects
if (profile === 'low') {
  skipShimmer();
  skipRotation();
  setStagger(0);
  setBlur(8);
}
```

**Trade-offs**:
- **High**: Maximum visual polish, requires beefy device
- **Medium**: Good balance, works on most devices
- **Low**: Functional animations only, works everywhere

### Will-Change Optimization

**Rationale**: Hint browser to prepare for changes, reducing first-frame jank.

**Usage**:
```css
.animating {
  will-change: transform, opacity;
}

/* Remove after animation completes */
.animated {
  will-change: auto;
}
```

**Caution**: Overuse consumes memory. Only apply during actual animation.

## Design Patterns

### Container/Presentational Separation

```typescript
// Container: Logic + State
function MessageComposerContainer() {
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const config = useAnimationConfig();

  return (
    <MessageComposerPresentation
      message={message}
      isTyping={isTyping}
      config={config}
      onMessageChange={setMessage}
    />
  );
}

// Presentational: UI + Animations
function MessageComposerPresentation({ message, isTyping, config, onMessageChange }) {
  return (
    <GlassContainer performanceProfile={config.profile}>
      <DynamicGlow currentLength={message.length} isTyping={isTyping} />
      {/* ... */}
    </GlassContainer>
  );
}
```

### Composition over Inheritance

Chaque composant est indépendant et composable:

```typescript
// Pas d'héritage
// Chaque composant se suffit à lui-même

<GlassContainer>
  <DynamicGlow />
  <ToolbarButtons />
  <SendButton />
</GlassContainer>
```

### Hook-Based Logic

Logic réutilisable via hooks:

```typescript
// useAnimationConfig - Logic de détection performance
// useTypingGlow - Logic de calcul couleur
// useDebounce - Logic de debouncing typing

// Réutilisable dans n'importe quel composant
const config = useAnimationConfig();
const glow = useTypingGlow({ currentLength, maxLength, isTyping });
```

## Extension Points

### Ajouter un Nouveau Composant Animé

1. Créer le composant avec variants Framer Motion
2. Utiliser `useAnimationConfig` pour adaptive behavior
3. Respecter les performance budgets
4. Ajouter tests (unit + E2E)
5. Documenter dans USAGE.md

### Ajouter un Nouveau Profil de Performance

1. Étendre type `PerformanceProfile` dans types
2. Ajouter config dans `useAnimationConfig`
3. Tester performance avec nouveaux budgets
4. Documenter dans PERFORMANCE.md

### Personnaliser les Couleurs

```typescript
// Dans useTypingGlow
const colorMap = {
  blue: 'rgba(59, 130, 246, intensity)',
  violet: 'rgba(139, 92, 246, intensity)',
  pink: 'rgba(236, 72, 153, intensity)',
  red: 'rgba(239, 68, 68, intensity)',
};

// Modifier selon design system
```

## Sécurité et Accessibilité

### prefers-reduced-motion

Toutes les animations respectent la préférence utilisateur:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Keyboard Navigation

Tous les boutons sont accessibles au clavier:

```typescript
<button
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick();
    }
  }}
>
```

### Screen Readers

ARIA labels sur tous les éléments interactifs:

```typescript
<button aria-label="Send message" aria-disabled={disabled}>
  <SendIcon aria-hidden="true" />
</button>
```

### Focus Visible

Outline visible pour navigation clavier:

```css
.button:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.8);
  outline-offset: 2px;
}
```
