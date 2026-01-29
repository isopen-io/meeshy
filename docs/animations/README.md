# MessageComposer Animations

> Système d'animations vibrantes et adaptatives pour le MessageComposer avec glassmorphisme premium.

## 🎯 Fonctionnalités

- **Glassmorphisme Premium**: Effet verre dépoli avec gradient border animé
- **Glow Dynamique**: Feedback visuel progressif (blue → violet → pink → red)
- **Animations Staggerées**: Révélation séquentielle des éléments UI
- **Profils Adaptatifs**: 3 niveaux de performance (high/medium/low)
- **Accessibility**: WCAG 2.1 AA compliant avec prefers-reduced-motion
- **Dark Mode**: Support natif via prefers-color-scheme

## 📊 Performance Budgets

- ✅ 60fps entrance animations
- ✅ <1s load time
- ✅ <5MB memory usage
- ✅ <8% jank (frame drops)

## 🏗️ Architecture

### Composants

- **GlassContainer**: Glassmorphisme wrapper avec blur adaptatif
- **DynamicGlow**: Overlay avec glow progressif basé sur typing
- **ToolbarButtons**: Boutons Mic + Attachment avec stagger
- **SendButton**: Bouton d'envoi avec bounce + rotation

### Hooks

- **useAnimationConfig**: Détection profil performance et config adaptative
- **useTypingGlow**: Calcul couleur basé sur currentLength/maxLength

## 🚀 Quick Start

```typescript
import MessageComposer from '@/components/common/message-composer';

function MyPage() {
  return <MessageComposer />;
}
```

Toutes les animations sont automatiquement activées avec détection adaptative de la performance.

## 📚 Documentation

- [Architecture détaillée](./ARCHITECTURE.md) - Composants, hooks, flows d'animation
- [Guide d'utilisation](./USAGE.md) - Exemples d'utilisation, customisation, accessibility
- [Performance & Optimisations](./PERFORMANCE.md) - Budgets, profiling, optimisations GPU
- [Troubleshooting](./TROUBLESHOOTING.md) - Problèmes courants, debug tips, solutions

## 🧪 Tests

### Unit Tests

```bash
cd apps/web
pnpm test
```

**Couverture**: 47 tests unitaires
- GlassContainer: Props, themes, data attributes
- DynamicGlow: Hook integration, color progression
- SendButton: Variants, loading states
- ToolbarButtons: Stagger, interactions
- Hooks: useAnimationConfig, useTypingGlow

### E2E Performance Tests

```bash
cd apps/web
pnpm test:e2e
```

**Couverture**: 11 tests E2E Playwright
- Performance budgets (FPS, load, memory, jank)
- Visual regression
- Accessibility (ARIA, keyboard navigation)
- Animation flows (entrance, typing, near-limit)

Voir [E2E README](../../apps/web/e2e/README.md) pour plus de détails.

## 🔧 Technologies

- **Framer Motion**: Orchestration d'animations complexes (bounce, stagger)
- **CSS Animations**: Effets visuels performants (glassmorphisme, glow, pulse)
- **React Hooks**: State management (useAnimationConfig, useTypingGlow)
- **TypeScript**: Type safety pour props et configs
- **CSS Modules**: Styles scoped et optimisés

## 📈 Performance

Le système est optimisé pour:
- **GPU acceleration**: transform, opacity sur compositor thread
- **CSS-first approach**: Animations CSS pour effets visuels simples
- **Adaptive rendering**: Profils high/medium/low basés sur device capabilities
- **Memory efficiency**: Cleanup de timers et listeners, memoization

## 🎨 Design System

Les animations suivent le design system Meeshy:
- **Colors**: Blue (#3B82F6) → Violet (#8B5CF6) → Pink (#EC4899) → Red (#EF4444)
- **Timing**: Spring physics (stiffness 400, damping 25) pour high profile
- **Easing**: Tween avec ease-out pour medium/low profiles
- **Spacing**: Stagger 50ms/80ms/0ms selon profil

## 🌐 Browser Support

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support (backdrop-filter depuis 14+)
- Mobile: ✅ iOS Safari 14+, Chrome Android

## 📝 Changelog

### v1.0.0 (2026-01-29)

- Initial release
- GlassContainer avec glassmorphisme adaptatif
- DynamicGlow avec progression de couleur
- SendButton avec bounce + rotation
- ToolbarButtons avec stagger
- Hooks useAnimationConfig et useTypingGlow
- Tests unitaires (47) et E2E (11)
- Documentation complète

## 🤝 Contributing

Pour contribuer aux animations:

1. Lire [ARCHITECTURE.md](./ARCHITECTURE.md) pour comprendre le système
2. Suivre les [performance budgets](./PERFORMANCE.md)
3. Ajouter des tests (unit + E2E)
4. Tester avec prefers-reduced-motion activé
5. Vérifier sur profils high/medium/low

## 📄 License

Voir LICENSE dans le root du projet.
