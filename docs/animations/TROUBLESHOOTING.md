# Troubleshooting

Guide de dépannage pour les problèmes courants avec les animations du MessageComposer.

## Problèmes Courants

### ❌ GlassContainer n'affiche pas le glassmorphisme

**Symptômes**:
- Container a l'air plat, pas de blur
- Arrière-plan non-flouté
- Pas d'effet verre dépoli

**Causes possibles**:

1. **Performance profile trop bas**
   - Profile = "low" désactive/réduit le blur
   - Auto-detection a identifié un device lent

2. **Browser ne supporte pas backdrop-filter**
   - Safari < 14 ne supporte pas
   - Certains browsers Android anciens

3. **Z-index conflict**
   - Container derrière d'autres éléments
   - Backdrop-filter nécessite stacking context

**Solutions**:

```typescript
// Solution 1: Force high profile
<GlassContainer performanceProfile="high">
  <MyContent />
</GlassContainer>

// Solution 2: Vérifier support browser
if (CSS.supports('backdrop-filter', 'blur(10px)')) {
  // Supporté
} else {
  // Fallback: background opaque
  console.warn('backdrop-filter not supported');
}

// Solution 3: Fix z-index
<div style={{ position: 'relative', zIndex: 1 }}>
  <GlassContainer>
    <MyContent />
  </GlassContainer>
</div>
```

**Debug**:
```javascript
// Dans DevTools Console
const el = document.querySelector('.glassContainer');
console.log(getComputedStyle(el).backdropFilter);
// Should log: "blur(20px)" or similar

console.log(getComputedStyle(el).getPropertyValue('--blur-amount'));
// Should log: "20px" (high), "16px" (medium), or "8px" (low)
```

---

### ❌ DynamicGlow ne s'affiche pas

**Symptômes**:
- Pas de glow pendant la frappe
- Overlay invisible
- Pas de progression de couleur

**Causes possibles**:

1. **`isTyping` reste false**
   - Event handler ne met pas à jour l'état
   - Debounce trop agressif

2. **`currentLength` = 0**
   - Message vide
   - Length pas calculée correctement

3. **CSS variables non appliquées**
   - Inline styles manquants
   - Z-index incorrect

4. **Glow derrière le contenu**
   - Z-index trop bas
   - Position relative manquante sur parent

**Solutions**:

```typescript
// Solution 1: Vérifier typing detection
const handleChange = (e) => {
  setText(e.target.value);
  setIsTyping(true); // ⚠️ Important!
};

// Solution 2: Vérifier currentLength
console.log({ currentLength: message.length, shouldGlow: isTyping && message.length > 0 });

// Solution 3: Vérifier CSS variables
<DynamicGlow
  currentLength={message.length}
  maxLength={1000}
  isTyping={isTyping}
  style={{
    '--glow-color': glowColor,
    '--glow-intensity': glowIntensity,
  }}
/>

// Solution 4: Fix z-index
<div style={{ position: 'relative' }}>
  <DynamicGlow style={{ zIndex: 0 }} />
  <textarea style={{ position: 'relative', zIndex: 1 }} />
</div>
```

**Debug**:
```typescript
// Ajouter dans useTypingGlow
const { glowColor, glowIntensity, shouldGlow, isNearLimit } = useTypingGlow({
  currentLength,
  maxLength,
  isTyping,
});

console.log({
  glowColor,
  glowIntensity,
  shouldGlow,
  isNearLimit,
  currentLength,
  isTyping,
});
// Vérifier que shouldGlow = true quand vous tapez
```

---

### ❌ SendButton ne bounce pas

**Symptômes**:
- Button apparaît instantanément sans animation
- Pas de bounce/rotation entrance
- Animation fade simple au lieu de bounce

**Causes possibles**:

1. **Framer Motion pas installé**
   - Package manquant
   - Import error

2. **Performance profile = "low"**
   - Rotation désactivée
   - Spring physics désactivé

3. **`prefers-reduced-motion` activé**
   - User preference désactive animations
   - Accessibility setting

4. **Variants mal configurés**
   - Motion.div manquant
   - Initial/animate props incorrects

**Solutions**:

```bash
# Solution 1: Vérifier installation
pnpm list framer-motion
# Si absent:
pnpm add framer-motion

# Solution 2: Force high profile
<GlassContainer performanceProfile="high">
  <SendButton />
</GlassContainer>

# Solution 3: Test sans prefers-reduced-motion
# DevTools > Rendering > Emulate CSS media feature prefers-reduced-motion: no-preference
```

```typescript
// Solution 4: Vérifier variants
import { motion } from 'framer-motion';

const buttonVariants = {
  hidden: { scale: 0, rotate: 15, opacity: 0 },
  visible: {
    scale: [0, 1.15, 1],
    rotate: [15, -3, 0],
    opacity: 1,
    transition: { duration: 0.6 },
  },
};

<motion.button
  variants={buttonVariants}
  initial="hidden"
  animate="visible"
>
  Send
</motion.button>
```

**Debug**:
```typescript
// Vérifier config
const config = useAnimationConfig();
console.log({
  enableRotation: config.enableRotation, // Should be true for high profile
  transitionType: config.transitionType, // Should be 'spring' for high
});

// Vérifier prefers-reduced-motion
console.log(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
// Should be false
```

---

### ❌ ToolbarButtons apparaissent simultanément

**Symptômes**:
- Pas de stagger, les 2 boutons apparaissent ensemble
- No sequential reveal
- Animation simultanée

**Causes possibles**:

1. **Performance profile = "low"**
   - staggerDelay = 0 (simultaneous)

2. **containerVariants mal configuré**
   - staggerChildren manquant ou = 0

3. **Buttons pas wrapped dans motion.div**
   - Container statique au lieu de motion

**Solutions**:

```typescript
// Solution 1: Force higher profile
<GlassContainer performanceProfile="medium">
  <ToolbarButtons />
</GlassContainer>

// Solution 2: Vérifier containerVariants
const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: config.staggerDelay, // Doit être > 0
    },
  },
};

// Solution 3: Verify motion wrapper
<motion.div
  variants={containerVariants}
  initial="hidden"
  animate="visible"
>
  <motion.button variants={buttonVariants}>Mic</motion.button>
  <motion.button variants={buttonVariants}>Attachment</motion.button>
</motion.div>
```

**Debug**:
```typescript
const config = useAnimationConfig();
console.log({
  staggerDelay: config.staggerDelay,
  // High: 50, Medium: 80, Low: 0
});

// Should be > 0 for stagger effect
```

---

### ❌ Tests E2E échouent

**Symptômes**:
- Playwright tests timeout
- Tests failed dans CI
- "Element not found" errors

**Causes possibles**:

1. **Auth middleware bloque `/test-composer`**
   - Route nécessite authentication
   - Test user pas créé

2. **Port 3000 pas disponible**
   - Another process using port
   - Dev server pas démarré

3. **Chrome/Chromium pas installé**
   - Playwright browsers manquants

4. **Timeouts trop courts**
   - Slow CI environment
   - Animations prennent plus de temps

**Solutions**:

```bash
# Solution 1: Désactiver auth pour test routes
# Voir apps/web/e2e/README.md pour config

# Solution 2: Vérifier port
lsof -i :3000
# Si occupé:
kill -9 <PID>

# Solution 3: Installer browsers
pnpm exec playwright install chromium

# Solution 4: Augmenter timeouts
# playwright.config.ts
export default defineConfig({
  timeout: 60000, // 60s instead of 30s
});
```

**Debug**:
```bash
# Run tests avec debug mode
pnpm test:e2e -- --debug

# Run avec headed browser (voir l'UI)
pnpm test:e2e -- --headed

# Run specific test
pnpm test:e2e -- --grep "SendButton bounce"

# Generate trace
pnpm test:e2e -- --trace on
# Then open trace:
pnpm exec playwright show-trace trace.zip
```

---

### ❌ Performance metrics échouent

**Symptômes**:
- FPS < 30 dans tests
- Memory > 10MB
- Jank > 20%

**Causes possibles**:

1. **Dev mode (non-optimized)**
   - Source maps
   - React DevTools overhead
   - No minification

2. **Trop d'extensions browser**
   - AdBlockers
   - DevTools extensions
   - Performance overhead

3. **Device trop lent**
   - CI runner low-spec
   - VM with limited resources

4. **Concurrent animations**
   - Multiple animating components
   - Heavy re-renders

**Solutions**:

```bash
# Solution 1: Test en production build
pnpm build
pnpm start
pnpm test:e2e

# Solution 2: Utiliser Incognito mode
# playwright.config.ts
use: {
  launchOptions: {
    args: ['--incognito'],
  },
},

# Solution 3: Force low profile dans tests
// test-composer.tsx
<GlassContainer performanceProfile="low">
```

**Debug**:
```typescript
// Mesurer performance manuellement
const start = performance.now();
// ... trigger animation
const end = performance.now();
console.log(`Animation took ${end - start}ms`);

// Check memory
console.log((performance as any).memory?.usedJSHeapSize);
```

---

### ❌ Animations ne s'arrêtent pas

**Symptômes**:
- Animations continuent indéfiniment
- Memory usage augmente
- Battery drain

**Causes possibles**:

1. **Timers pas nettoyés**
   - useEffect sans cleanup
   - setInterval sans clearInterval

2. **Animation loop sans condition d'arrêt**
   - Infinite requestAnimationFrame
   - CSS animation-iteration-count: infinite

3. **State updates pendant animation**
   - Re-renders trigger new animations

**Solutions**:

```typescript
// Solution 1: Cleanup timers
useEffect(() => {
  const timer = setTimeout(() => {
    setIsTyping(false);
  }, 2000);

  return () => clearTimeout(timer); // ✅ Cleanup
}, [isTyping]);

// Solution 2: Conditional animation
<motion.div
  animate={isAnimating ? 'visible' : 'hidden'}
  variants={variants}
/>

// Solution 3: Memoize pour éviter re-renders
const MemoizedComponent = memo(AnimatedComponent);
```

---

## Debug Tips

### Visualiser les Animations

**Chrome DevTools Performance Tab**:

1. Ouvrir DevTools (F12)
2. Navigate to Performance tab
3. Click Record (red circle)
4. Trigger animations (type, click, etc.)
5. Stop recording
6. Analyser:
   - FPS graph (green = 60fps, red = jank)
   - Main thread activity
   - Compositor thread (animations should be here)

**Inspect Specific Frames**:
- Hover over FPS graph
- Click on frame for details
- Look for long tasks (yellow/red bars)

### Inspecter CSS Variables

**DevTools Console**:
```javascript
// DynamicGlow variables
const el = document.querySelector('[data-testid="dynamic-glow"]');
console.log({
  glowColor: getComputedStyle(el).getPropertyValue('--glow-color'),
  glowIntensity: getComputedStyle(el).getPropertyValue('--glow-intensity'),
  pulseDuration: getComputedStyle(el).getPropertyValue('--pulse-duration'),
});

// GlassContainer variables
const glass = document.querySelector('.glassContainer');
console.log({
  blurAmount: getComputedStyle(glass).getPropertyValue('--blur-amount'),
  theme: glass.getAttribute('data-theme'),
  performance: glass.getAttribute('data-performance'),
});
```

### Vérifier Framer Motion Variants

**React DevTools**:

1. Installer React DevTools extension
2. Open DevTools > Components tab
3. Sélectionner motion.div dans tree
4. Inspect Props:
   - variants: Check object structure
   - initial: Should be defined
   - animate: Should match variant key
   - transition: Check timing config

**Console Debugging**:
```typescript
// Log variants
const buttonVariants = {
  hidden: { scale: 0 },
  visible: { scale: 1 },
};

console.log('Button variants:', buttonVariants);

// Log current state
<motion.button
  variants={buttonVariants}
  onAnimationStart={() => console.log('Animation started')}
  onAnimationComplete={() => console.log('Animation complete')}
/>
```

### Performance Profiling

**Measure Animation Duration**:
```typescript
useEffect(() => {
  console.time('animation-duration');

  return () => {
    console.timeEnd('animation-duration');
  };
}, []);
```

**Track Re-renders**:
```typescript
// useWhyDidYouUpdate hook
function useWhyDidYouUpdate(name, props) {
  const previousProps = useRef();

  useEffect(() => {
    if (previousProps.current) {
      const allKeys = Object.keys({ ...previousProps.current, ...props });
      const changedProps = {};

      allKeys.forEach((key) => {
        if (previousProps.current[key] !== props[key]) {
          changedProps[key] = {
            from: previousProps.current[key],
            to: props[key],
          };
        }
      });

      if (Object.keys(changedProps).length) {
        console.log('[why-did-you-update]', name, changedProps);
      }
    }

    previousProps.current = props;
  });
}

// Usage
useWhyDidYouUpdate('SendButton', { disabled, isLoading });
```

### Network Inspection

**Check Animation Assets**:
```javascript
// DevTools Network tab
// Filter by "Other" or "All"
// Look for:
// - fonts (Inter, etc.)
// - images (icons, etc.)
// - CSS files

// Slow requests (>100ms) can delay animations
```

### Accessibility Testing

**prefers-reduced-motion**:
```javascript
// Check current setting
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
console.log('Reduced motion:', reducedMotion);

// Emulate in DevTools
// Rendering > Emulate CSS media feature prefers-reduced-motion
```

**Keyboard Navigation**:
```bash
# Test with keyboard only:
# 1. Tab to focus elements
# 2. Enter/Space to activate
# 3. Verify focus visible (outline)
```

**Screen Reader**:
```bash
# macOS VoiceOver: Cmd+F5
# Windows Narrator: Win+Ctrl+Enter
# Verify ARIA labels announced correctly
```

## Logs et Diagnostics

### Enable Debug Logs

```typescript
// apps/web/lib/animations/debug.ts
const DEBUG = process.env.NODE_ENV === 'development';

export function debugLog(component: string, message: string, data?: any) {
  if (DEBUG) {
    console.log(`[${component}]`, message, data);
  }
}

// Usage dans composants
debugLog('GlassContainer', 'Rendering with profile', performanceProfile);
debugLog('DynamicGlow', 'Glow state changed', { shouldGlow, glowColor });
```

### Performance Logs

```typescript
// Log FPS
let frameCount = 0;
let lastTime = performance.now();

function measureFPS() {
  frameCount++;
  const now = performance.now();

  if (now >= lastTime + 1000) {
    console.log(`FPS: ${frameCount}`);
    frameCount = 0;
    lastTime = now;
  }

  requestAnimationFrame(measureFPS);
}

measureFPS();
```

### Error Boundaries

```typescript
// Catch animation errors
class AnimationErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Animation error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div>Animation failed to load. Using fallback UI.</div>;
    }

    return this.props.children;
  }
}

// Usage
<AnimationErrorBoundary>
  <MessageComposer />
</AnimationErrorBoundary>
```

## Support et Aide

### Documentation

- [Architecture](./ARCHITECTURE.md) - Comprendre le système
- [Usage Guide](./USAGE.md) - Exemples d'utilisation
- [Performance](./PERFORMANCE.md) - Optimisations et budgets

### Issues GitHub

Si le problème persiste après ces étapes, créer une issue avec:

**Template**:
```markdown
## Description
[Brief description of the issue]

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
[What you expected to happen]

## Actual Behavior
[What actually happened]

## Environment
- Browser: Chrome 120
- OS: macOS 14.2
- Device: MacBook Pro M1
- Performance Profile: high/medium/low

## Console Errors
[Screenshot or copy-paste of console errors]

## Performance Metrics
- FPS: 45fps (expected 60fps)
- Memory: 8MB (expected <5MB)
- Load Time: 1.5s (expected <1s)

## Screenshots
[If applicable, add screenshots]

## Additional Context
[Any other relevant information]
```

### Common Error Messages

**Error**: `Cannot read property 'backdropFilter' of undefined`
**Cause**: CSS property accessed before element mounted
**Fix**: Add null check or useEffect

**Error**: `Maximum update depth exceeded`
**Cause**: State update inside render causing infinite loop
**Fix**: Move state update to useEffect or useCallback

**Error**: `Memory limit exceeded`
**Cause**: Memory leak (timers not cleaned)
**Fix**: Add cleanup functions in useEffect

**Error**: `Failed to execute 'animate' on 'Element'`
**Cause**: Invalid animation keyframes
**Fix**: Verify CSS animation syntax

## Quick Fixes Checklist

Avant de créer une issue, vérifier:

- [ ] Framer Motion installé (`pnpm list framer-motion`)
- [ ] Performance profile approprié (pas de low sur bon device)
- [ ] Browser supporte backdrop-filter
- [ ] prefers-reduced-motion désactivé (si test animations)
- [ ] Console errors vérifiés
- [ ] useEffect cleanups présents
- [ ] Z-index correct (glow = 0, container = 1)
- [ ] Props required fournis (isTyping, currentLength, etc.)
- [ ] Tests E2E passent localement
- [ ] Production build testé (pas seulement dev)

Si tout est vérifié et problème persiste, créer une issue détaillée.
