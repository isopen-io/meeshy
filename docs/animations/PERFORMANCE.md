# Performance & Optimisations

## Performance Budgets

Les animations respectent des budgets stricts validés par tests E2E Playwright:

| Métrique | Budget | Mesure | Status |
|----------|--------|--------|--------|
| FPS | >= 60fps | Entrance animations | ✅ Passing |
| Load Time | < 1000ms | Component mount | ✅ Passing |
| Memory | < 5MB | JS heap size | ✅ Passing |
| Jank | < 8% | Frame drops (% frames <58fps) | ✅ Passing |

Ces budgets sont automatiquement validés dans les tests E2E:

```bash
cd apps/web
pnpm test:e2e -- --grep "performance"
```

## Profils de Performance

Le système détecte automatiquement les capabilities du device et adapte les animations.

### High Performance Profile

**Détection**:
- CPU: 8+ cores (`navigator.hardwareConcurrency >= 8`)
- Memory: 4GB+ (`navigator.deviceMemory >= 4`)
- GPU: High-tier WebGL renderer

**Configuration**:
```typescript
{
  enableBlur: true,
  blurAmount: 20,           // Maximum blur
  enableShimmer: true,      // Gradient shimmer on border
  enableRotation: true,     // Rotation in bounce animation
  staggerDelay: 50,         // 50ms delay between elements
  transitionType: 'spring', // Spring physics
  springConfig: {
    stiffness: 400,
    damping: 25,
  },
}
```

**Effets Visuels**:
- Glassmorphisme full blur (20px)
- Gradient border avec shimmer animation
- SendButton avec bounce + rotation (15° → -3° → 0°)
- ToolbarButtons stagger rapide (50ms)
- Spring physics pour animations fluides

**Performance Target**: 60fps, <1s load, <3MB memory

### Medium Performance Profile

**Détection**:
- CPU: 4-6 cores
- Memory: 2-4GB
- GPU: Mid-tier WebGL renderer

**Configuration**:
```typescript
{
  enableBlur: true,
  blurAmount: 16,           // Reduced blur
  enableShimmer: false,     // No shimmer
  enableRotation: false,    // No rotation
  staggerDelay: 80,         // 80ms delay (slower)
  transitionType: 'tween',  // Tween instead of spring
  springConfig: null,
}
```

**Effets Visuels**:
- Glassmorphisme avec blur réduit (16px)
- Gradient border statique (pas de shimmer)
- SendButton avec bounce seulement (pas de rotation)
- ToolbarButtons stagger plus lent (80ms)
- Tween transitions (0.3s ease-out)

**Performance Target**: 55-60fps, <1s load, <4MB memory

### Low Performance Profile

**Détection**:
- CPU: <4 cores
- Memory: <2GB
- GPU: Low-tier ou software renderer

**Configuration**:
```typescript
{
  enableBlur: true,
  blurAmount: 8,            // Minimal blur
  enableShimmer: false,     // No shimmer
  enableRotation: false,    // No rotation
  staggerDelay: 0,          // No stagger (simultaneous)
  transitionType: 'tween',  // Fast tween
  springConfig: null,
}
```

**Effets Visuels**:
- Glassmorphisme avec blur minimal (8px)
- Gradient border statique
- SendButton avec scale simple (pas de bounce/rotation)
- ToolbarButtons apparaissent simultanément (pas de stagger)
- Tween rapide (0.2s)

**Performance Target**: 50-60fps, <1s load, <5MB memory

## Optimisations GPU

### Transform Acceleration

Force GPU acceleration pour smooth rendering:

```css
.animated-element {
  transform: translateZ(0);
  backface-visibility: hidden;
  perspective: 1000px;
}
```

**Rationale**: Force création d'un compositing layer sur GPU, évite main thread blocking.

**Propriétés GPU-accelerated**:
- `transform` (translate, scale, rotate)
- `opacity`
- `filter` (blur, brightness, etc.)
- `backdrop-filter` (glassmorphisme)

**Propriétés NON-accelerated** (à éviter):
- `top`, `left`, `right`, `bottom`
- `width`, `height`
- `margin`, `padding`
- `background-position` (sans GPU hint)

### Will-Change Hint

Prépare le navigateur pour les changements à venir:

```css
.animating {
  will-change: transform, opacity;
}

/* Remove after animation completes */
.animated {
  will-change: auto;
}
```

**Usage**:
```typescript
useEffect(() => {
  const element = ref.current;

  // Apply will-change before animation
  element.style.willChange = 'transform, opacity';

  // Cleanup after animation
  return () => {
    element.style.willChange = 'auto';
  };
}, []);
```

**Caution**:
- Overuse consomme beaucoup de mémoire
- Appliquer seulement pendant animation active
- Limiter à 2-3 propriétés max

### Compositor Thread

Les animations CSS (transform, opacity) tournent sur le compositor thread:

```
Main Thread:          JS → Layout → Paint
                                    ↓
Compositor Thread:                 Composite → Display
                                    ↑ (animations run here)
```

**Avantages**:
- No main thread blocking
- Smooth 60fps même avec JS busy
- Lower latency
- Better battery life

**CSS qui run sur compositor**:
```css
/* ✅ Compositor thread */
@keyframes glowPulse {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.02); opacity: 0.6; }
}

/* ❌ Main thread (avoid) */
@keyframes badAnimation {
  0% { width: 100px; }
  100% { width: 200px; }
}
```

## Optimisations Mémoire

### No Memory Leaks

Tous les timers et listeners sont nettoyés dans cleanup functions:

```typescript
// ✅ Good: Cleanup timer
useEffect(() => {
  const timer = setTimeout(() => {
    setIsTyping(false);
  }, 2000);

  return () => clearTimeout(timer); // Cleanup
}, [isTyping]);

// ✅ Good: Cleanup listener
useEffect(() => {
  const handleResize = () => {
    updateLayout();
  };

  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize); // Cleanup
}, []);

// ❌ Bad: No cleanup
useEffect(() => {
  setInterval(() => {
    updateState();
  }, 1000);
  // Memory leak! Interval continues après unmount
}, []);
```

### Minimal Re-renders

Optimisations pour éviter re-renders inutiles:

```typescript
// ✅ Memoization
const config = useMemo(() => calculateConfig(profile), [profile]);

// ✅ Stable refs
const callbackRef = useRef(callback);

// ✅ memo() pour composants
const MemoizedButton = memo(SendButton, (prev, next) => {
  return prev.disabled === next.disabled &&
         prev.isLoading === next.isLoading;
});

// ✅ useCallback pour handlers
const handleClick = useCallback(() => {
  sendMessage(message);
}, [message]);
```

### Virtual DOM Optimizations

```typescript
// ✅ Key props pour listes
{buttons.map((button) => (
  <Button key={button.id} {...button} />
))}

// ✅ Conditional rendering
{shouldRenderGlow && <DynamicGlow />}

// ❌ Avoid inline object creation
// Bad: Creates new object every render
<Button style={{ color: 'blue' }} />

// Good: Stable object reference
const buttonStyle = { color: 'blue' };
<Button style={buttonStyle} />
```

## Bundle Size

### Framer Motion

**Import size**: ~30KB gzipped

**Tree-shaking**: Importe seulement ce qui est utilisé

```typescript
// ✅ Tree-shakable imports
import { motion, AnimatePresence } from 'framer-motion';

// ❌ Import complet (avoid)
import * as FramerMotion from 'framer-motion';
```

**Impact**: Marginal pour les bénéfices (orchestration complexe impossible en CSS seul)

**Alternatives considérées**:
- **react-spring**: Similar size, less intuitive API
- **anime.js**: Larger bundle, overkill pour nos besoins
- **CSS only**: Impossible pour stagger + bounce synchronisé

### CSS Modules

**Build-time**: Scoped CSS généré pendant build

**Runtime**: Zero overhead (classes transformées en static strings)

**Compression**: Excellent (répétitions compressent bien)

```css
/* Source: 5KB */
.glassContainer { backdrop-filter: blur(20px); }
.glassContainer[data-theme="dark"] { background: rgba(0,0,0,0.1); }

/* Compressed: ~1KB gzipped */
.a{backdrop-filter:blur(20px)}.a[data-theme=dark]{background:rgba(0,0,0,.1)}
```

### Code Splitting

```typescript
// Lazy load animations pour faster initial load
import dynamic from 'next/dynamic';

const DynamicGlow = dynamic(
  () => import('@/components/common/message-composer/DynamicGlow'),
  { ssr: false }
);

// Load only when needed
{shouldShowGlow && <DynamicGlow />}
```

**Trade-offs**:
- **Pro**: Faster initial page load
- **Con**: Slight delay on first use
- **Recommendation**: Use pour composants rarement utilisés

## Monitoring

### Web Vitals

Métriques suivies dans tests E2E:

```typescript
// FCP (First Contentful Paint)
// Target: < 1.8s
// Mesure: Time to first pixel

// LCP (Largest Contentful Paint)
// Target: < 2.5s
// Mesure: Time to main content

// CLS (Cumulative Layout Shift)
// Target: < 0.1
// Mesure: Visual stability

// FID (First Input Delay)
// Target: < 100ms
// Mesure: Interactivity delay
```

**Test**:
```bash
pnpm test:e2e -- --grep "web vitals"
```

### Custom Metrics

FPS tracking dans tests E2E:

```typescript
// Measure FPS during animation
const fps = await page.evaluate(() => {
  return new Promise((resolve) => {
    const frames = [];
    let lastTime = performance.now();

    const measureFrame = () => {
      const now = performance.now();
      const delta = now - lastTime;
      frames.push(1000 / delta); // FPS
      lastTime = now;

      if (frames.length < 60) {
        requestAnimationFrame(measureFrame);
      } else {
        const avgFps = frames.reduce((a, b) => a + b) / frames.length;
        resolve(avgFps);
      }
    };

    requestAnimationFrame(measureFrame);
  });
});

expect(fps).toBeGreaterThanOrEqual(60);
```

Memory tracking:

```typescript
// Measure JS heap size
const memory = await page.evaluate(() => {
  return (performance as any).memory?.usedJSHeapSize || 0;
});

const memoryMB = memory / (1024 * 1024);
expect(memoryMB).toBeLessThan(5);
```

## Benchmarking

### Lancer les Benchmarks

```bash
cd apps/web

# All performance tests
pnpm test:e2e -- --grep "performance"

# Specific metrics
pnpm test:e2e -- --grep "FPS"
pnpm test:e2e -- --grep "memory"
pnpm test:e2e -- --grep "load time"
```

### Interpréter les Résultats

**FPS < 55**:
- Device trop lent pour profil actuel
- Solution: Force low profile
- Vérifier: GPU capabilities avec WebGL report

**Memory > 5MB**:
- Possible memory leak
- Vérifier: useEffect cleanups
- Vérifier: Event listener removals

**Jank > 8%**:
- Trop d'animations simultanées
- Solution: Réduire complexité ou étaler dans le temps
- Vérifier: Main thread blocking (DevTools Performance)

**Load Time > 1s**:
- Bundle trop gros
- Solution: Code splitting, lazy loading
- Vérifier: Network tab pour bottlenecks

### Performance Profiling (Chrome DevTools)

**Step 1: Open DevTools**:
- F12 ou Cmd+Opt+I
- Navigate to Performance tab

**Step 2: Record**:
- Click Record button (or Cmd+E)
- Trigger animations (type, click, etc.)
- Stop recording after 5-10s

**Step 3: Analyze**:
- **FPS graph**: Should be green (60fps). Red = jank
- **Main thread**: Look for long tasks (>50ms)
- **Compositor thread**: Should show animation activity
- **Memory**: Should be stable, no growing trend

**Step 4: Identify Bottlenecks**:
- Long tasks: Optimize JavaScript
- Layout/Paint: Avoid CSS properties that trigger reflow
- Memory growth: Check for leaks

### Real User Monitoring (RUM)

Production monitoring avec Web Vitals API:

```typescript
// apps/web/lib/monitoring.ts
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

function sendToAnalytics(metric) {
  // Send to your analytics service
  console.log(metric);
}

getCLS(sendToAnalytics);
getFID(sendToAnalytics);
getFCP(sendToAnalytics);
getLCP(sendToAnalytics);
getTTFB(sendToAnalytics);
```

## Dépannage Performance

### Problème: Animations Janky

**Symptômes**: Animations saccadées, frame drops

**Diagnostic**:
```bash
# Check FPS in tests
pnpm test:e2e -- --grep "FPS"

# Profile in Chrome DevTools
# Look for red in FPS graph
```

**Causes possibles**:
1. Device trop lent pour high profile
2. Main thread blocking (long JS tasks)
3. Trop d'animations simultanées

**Solutions**:
```typescript
// Force low profile
<GlassContainer performanceProfile="low">

// Reduce blur amount
const blurAmount = 8; // instead of 20

// Disable rotation/shimmer
config.enableRotation = false;
config.enableShimmer = false;
```

### Problème: High Memory Usage

**Symptômes**: Memory usage > 5MB, browser lag

**Diagnostic**:
```typescript
// Check memory in tests
pnpm test:e2e -- --grep "memory"

// Profile in Chrome DevTools Memory tab
// Take heap snapshots, compare
```

**Causes possibles**:
1. Memory leaks (timers, listeners non-nettoyés)
2. Trop de composants montés simultanément
3. Large images/assets

**Solutions**:
```typescript
// Verify cleanups
useEffect(() => {
  const timer = setTimeout(...);
  return () => clearTimeout(timer); // ✅ Cleanup
}, []);

// Unmount unused components
{shouldRender && <ExpensiveComponent />}

// Lazy load
const Heavy = dynamic(() => import('./Heavy'));
```

### Problème: Slow Load Time

**Symptômes**: Component mount > 1s

**Diagnostic**:
```bash
# Check load time in tests
pnpm test:e2e -- --grep "load time"

# Profile in Chrome DevTools Network tab
# Look for slow requests
```

**Causes possibles**:
1. Bundle trop gros
2. Slow network
3. Blocking resources

**Solutions**:
```typescript
// Code splitting
const DynamicGlow = dynamic(() => import('./DynamicGlow'));

// Preload critical resources
<link rel="preload" href="/fonts/inter.woff2" as="font" />

// Optimize images
// Use WebP, next/image with optimization
```

### Problème: High CPU Usage

**Symptômes**: Laptop fan loud, battery drain

**Diagnostic**:
```javascript
// Monitor CPU in DevTools Performance tab
// Look for hot functions (orange flames)
```

**Causes possibles**:
1. Trop de re-renders
2. Heavy computations pendant animation
3. Inefficient CSS selectors

**Solutions**:
```typescript
// Memoize expensive computations
const result = useMemo(() => heavyComputation(data), [data]);

// Batch updates
startTransition(() => {
  setStateA(a);
  setStateB(b);
});

// Optimize CSS selectors
// ✅ .class (fast)
// ❌ div > div > div > .class (slow)
```

## Best Practices

### Do's ✅

- Use GPU-accelerated properties (transform, opacity)
- Cleanup timers and listeners in useEffect
- Memoize expensive computations
- Profile before optimizing
- Test on low-end devices
- Respect prefers-reduced-motion
- Use CSS animations pour effets simples
- Batch state updates
- Lazy load heavy components

### Don'ts ❌

- Animate width/height/top/left (triggers layout)
- Forget cleanup functions
- Over-optimize prematurely
- Ignore performance budgets
- Use inline styles (creates new objects)
- Create timers without cleanup
- Animate during heavy JS tasks
- Use will-change everywhere
- Block main thread with sync operations

## Ressources

- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
- [Web Vitals](https://web.dev/vitals/)
- [CSS Triggers](https://csstriggers.com/)
- [Framer Motion Performance](https://www.framer.com/motion/guide-reduce-bundle-size/)
- [React Profiler](https://reactjs.org/docs/profiler.html)
