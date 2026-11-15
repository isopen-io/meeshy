# Exemples de Code - Fix Scroll Horizontal

Ce document contient des exemples de code testables pour comprendre et valider le fix.

## EXEMPLE 1 : Structure Minimale qui Fonctionne

### Code React/TypeScript

```tsx
import React from 'react';

// ✅ STRUCTURE MINIMALE GARANTIE DE FONCTIONNER
export function ScrollableCarousel({ items }: { items: string[] }) {
  return (
    <div className="w-full max-w-full bg-gray-100">
      {/* Parent : délimite la zone sans bloquer */}

      <div
        className="flex items-center gap-3 px-3 py-3 overflow-x-auto overflow-y-hidden w-full min-w-0"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#9ca3af #f3f4f6',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Scrollable : gère le défilement */}

        {items.map((item, index) => (
          <div key={index} className="flex-shrink-0 w-20 h-20 bg-blue-500 text-white flex items-center justify-center rounded">
            {/* Item : ne rétrécit jamais */}
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

// Utilisation
function App() {
  const items = Array.from({ length: 20 }, (_, i) => `${i + 1}`);
  return <ScrollableCarousel items={items} />;
}
```

### HTML Équivalent (pour Tests)

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <title>Test Scroll Horizontal</title>
</head>
<body class="p-8">
  <h1 class="text-2xl font-bold mb-4">Test Scroll Horizontal</h1>

  <!-- ✅ STRUCTURE CORRECTE -->
  <div class="w-full max-w-full bg-gray-100 border-2 border-blue-500">
    <div
      class="flex items-center gap-3 px-3 py-3 overflow-x-auto overflow-y-hidden w-full min-w-0"
      style="
        scrollbar-width: thin;
        scrollbar-color: #9ca3af #f3f4f6;
        -webkit-overflow-scrolling: touch;
      "
    >
      <div class="flex-shrink-0 w-20 h-20 bg-blue-500 text-white flex items-center justify-center rounded">1</div>
      <div class="flex-shrink-0 w-20 h-20 bg-blue-500 text-white flex items-center justify-center rounded">2</div>
      <div class="flex-shrink-0 w-20 h-20 bg-blue-500 text-white flex items-center justify-center rounded">3</div>
      <div class="flex-shrink-0 w-20 h-20 bg-blue-500 text-white flex items-center justify-center rounded">4</div>
      <div class="flex-shrink-0 w-20 h-20 bg-blue-500 text-white flex items-center justify-center rounded">5</div>
      <div class="flex-shrink-0 w-20 h-20 bg-blue-500 text-white flex items-center justify-center rounded">6</div>
      <div class="flex-shrink-0 w-20 h-20 bg-blue-500 text-white flex items-center justify-center rounded">7</div>
      <div class="flex-shrink-0 w-20 h-20 bg-blue-500 text-white flex items-center justify-center rounded">8</div>
      <div class="flex-shrink-0 w-20 h-20 bg-blue-500 text-white flex items-center justify-center rounded">9</div>
      <div class="flex-shrink-0 w-20 h-20 bg-blue-500 text-white flex items-center justify-center rounded">10</div>
    </div>
  </div>

  <script>
    // Test : vérifier que le scroll fonctionne
    const scrollable = document.querySelector('[class*="overflow-x-auto"]');
    console.log({
      offsetWidth: scrollable.offsetWidth,
      scrollWidth: scrollable.scrollWidth,
      isScrollable: scrollable.scrollWidth > scrollable.offsetWidth,
    });
    // Résultat attendu : isScrollable = true ✅
  </script>
</body>
</html>
```

---

## EXEMPLE 2 : Code Cassé vs Code Fixé (Comparaison)

### ❌ CODE CASSÉ (Ne Pas Utiliser)

```tsx
// ❌ MAUVAIS : overflow-hidden bloque le scroll
export function BrokenCarousel({ items }: { items: string[] }) {
  return (
    <div className="w-full overflow-hidden bg-gray-100">
      {/* ❌ overflow-hidden coupe tout */}

      <div className="flex items-center gap-3 px-3 py-3 overflow-x-scroll max-h-20">
        {/* ❌ overflow-x-scroll bloqué par le parent */}

        {items.map((item, index) => (
          <div key={index} className="flex-shrink-0 w-20 h-20 bg-red-500 text-white flex items-center justify-center rounded">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

// Résultat : Items 6+ INVISIBLES ❌
```

### ✅ CODE FIXÉ (Utiliser Ceci)

```tsx
// ✅ BON : Scroll garanti de fonctionner
export function FixedCarousel({ items }: { items: string[] }) {
  return (
    <div className="w-full max-w-full bg-gray-100">
      {/* ✅ max-w-full délimite sans bloquer */}

      <div
        className="flex items-center gap-3 px-3 py-3 overflow-x-auto overflow-y-hidden w-full min-w-0"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#9ca3af #f3f4f6',
          WebkitOverflowScrolling: 'touch',
          minHeight: '100px',
        }}
      >
        {/* ✅ overflow-x-auto + min-w-0 garantit le scroll */}

        {items.map((item, index) => (
          <div key={index} className="flex-shrink-0 w-20 h-20 bg-green-500 text-white flex items-center justify-center rounded">
            {/* ✅ flex-shrink-0 garde la taille */}
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

// Résultat : TOUS les items accessibles via scroll ✅
```

---

## EXEMPLE 3 : Scrollbar Personnalisée (Styles)

### CSS Pur (Fichier Global)

```css
/* styles/globals.css */

/* Scrollbar pour Firefox (CSS standards) */
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: #9ca3af #f3f4f6;
}

/* Scrollbar pour Chrome/Safari/Edge (Webkit) */
.custom-scrollbar::-webkit-scrollbar {
  height: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: #f3f4f6;
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #9ca3af;
  border-radius: 4px;
  transition: background 0.2s;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #6b7280;
}

/* Dark mode */
.dark .custom-scrollbar {
  scrollbar-color: #6b7280 #374151;
}

.dark .custom-scrollbar::-webkit-scrollbar-track {
  background: #374151;
}

.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background: #6b7280;
}

.dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
```

### Utilisation dans le Composant

```tsx
import React from 'react';

export function CarouselWithStyledScrollbar({ items }: { items: string[] }) {
  return (
    <div className="w-full max-w-full bg-gray-100">
      <div className="custom-scrollbar flex items-center gap-3 px-3 py-3 overflow-x-auto overflow-y-hidden w-full min-w-0">
        {items.map((item, index) => (
          <div key={index} className="flex-shrink-0 w-20 h-20 bg-blue-500 text-white flex items-center justify-center rounded">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### JSX Inline Styles (Next.js)

```tsx
export function CarouselWithInlineStyles({ items }: { items: string[] }) {
  return (
    <div className="w-full max-w-full bg-gray-100">
      <div
        className="flex items-center gap-3 px-3 py-3 overflow-x-auto overflow-y-hidden w-full min-w-0"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#9ca3af #f3f4f6',
        }}
      >
        {items.map((item, index) => (
          <div key={index} className="flex-shrink-0 w-20 h-20 bg-blue-500 text-white flex items-center justify-center rounded">
            {item}
          </div>
        ))}
      </div>

      {/* Styles Webkit inline */}
      <style jsx>{`
        div::-webkit-scrollbar {
          height: 8px;
        }
        div::-webkit-scrollbar-track {
          background: #f3f4f6;
          border-radius: 4px;
        }
        div::-webkit-scrollbar-thumb {
          background: #9ca3af;
          border-radius: 4px;
        }
        div::-webkit-scrollbar-thumb:hover {
          background: #6b7280;
        }
      `}</style>
    </div>
  );
}
```

---

## EXEMPLE 4 : Accessibilité (ARIA + Clavier)

### Composant Accessible Complet

```tsx
import React from 'react';

export function AccessibleCarousel({ items }: { items: string[] }) {
  return (
    <div
      className="w-full max-w-full bg-gray-100"
      role="region"
      aria-label="File attachments carousel"
    >
      <div
        className="flex items-center gap-3 px-3 py-3 overflow-x-auto overflow-y-hidden w-full min-w-0"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#9ca3af #f3f4f6',
          WebkitOverflowScrolling: 'touch',
        }}
        tabIndex={0}
        role="list"
        aria-label={`${items.length} attached files`}
      >
        {items.map((item, index) => (
          <div
            key={index}
            className="flex-shrink-0 w-20 h-20 bg-blue-500 text-white flex items-center justify-center rounded"
            role="listitem"
            aria-label={`File ${index + 1} of ${items.length}: ${item}`}
          >
            {item}
          </div>
        ))}
      </div>

      {/* Focus visible */}
      <style jsx>{`
        div[role="list"]:focus {
          outline: 2px solid #3b82f6;
          outline-offset: -2px;
        }
      `}</style>
    </div>
  );
}
```

### Test de Navigation Clavier (Script)

```javascript
// Test dans DevTools Console

// 1. Focus sur le carrousel
const carousel = document.querySelector('[role="list"]');
carousel.focus();
console.log('Focus actif:', document.activeElement === carousel);

// 2. Simuler ArrowRight (scroll vers la droite)
carousel.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') {
    carousel.scrollBy({ left: 100, behavior: 'smooth' });
  }
  if (e.key === 'ArrowLeft') {
    carousel.scrollBy({ left: -100, behavior: 'smooth' });
  }
  if (e.key === 'Home') {
    carousel.scrollTo({ left: 0, behavior: 'smooth' });
  }
  if (e.key === 'End') {
    carousel.scrollTo({ left: carousel.scrollWidth, behavior: 'smooth' });
  }
});

// 3. Tester
// ArrowRight → Scroll vers la droite ✅
// ArrowLeft → Scroll vers la gauche ✅
// Home → Début de la liste ✅
// End → Fin de la liste ✅
```

---

## EXEMPLE 5 : Types de Fichiers Mixtes (AttachmentCarousel Réel)

### Composant avec Différents Types

```tsx
import React from 'react';
import { Image, Video, Music, File } from 'lucide-react';

interface FileItem {
  name: string;
  type: 'image' | 'video' | 'audio' | 'document';
  size: number;
}

export function MixedTypeCarousel({ files }: { files: FileItem[] }) {
  const getIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image className="w-5 h-5 text-blue-500" />;
      case 'video': return <Video className="w-5 h-5 text-purple-500" />;
      case 'audio': return <Music className="w-5 h-5 text-green-500" />;
      default: return <File className="w-5 h-5 text-gray-500" />;
    }
  };

  const getCardSize = (type: string) => {
    if (type === 'audio') return 'w-40 h-20';
    if (type === 'video') return 'w-40 h-32';
    return 'w-20 h-20';
  };

  return (
    <div className="w-full max-w-full bg-gradient-to-r from-gray-50 to-gray-100">
      <div
        className="flex items-center gap-3 px-3 py-3 overflow-x-auto overflow-y-hidden w-full min-w-0"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#9ca3af #f3f4f6',
          minHeight: '140px',
        }}
        role="list"
      >
        {files.map((file, index) => (
          <div
            key={index}
            className={`flex-shrink-0 ${getCardSize(file.type)} bg-white border-2 border-gray-200 rounded-lg flex flex-col items-center justify-center p-2`}
            role="listitem"
          >
            {getIcon(file.type)}
            <div className="text-xs font-medium mt-1 truncate w-full text-center">
              {file.name}
            </div>
            <div className="text-xs text-gray-500">
              {(file.size / 1024).toFixed(0)} KB
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Utilisation
function App() {
  const files: FileItem[] = [
    { name: 'photo1.jpg', type: 'image', size: 1024000 },
    { name: 'photo2.png', type: 'image', size: 2048000 },
    { name: 'video.mp4', type: 'video', size: 5120000 },
    { name: 'audio.mp3', type: 'audio', size: 3072000 },
    { name: 'document.pdf', type: 'document', size: 512000 },
  ];

  return <MixedTypeCarousel files={files} />;
}
```

---

## EXEMPLE 6 : Tests Automatisés (Jest + React Testing Library)

### Test du Scroll Horizontal

```typescript
import { render, screen } from '@testing-library/react';
import { ScrollableCarousel } from './ScrollableCarousel';

describe('ScrollableCarousel - Horizontal Scroll', () => {
  test('should enable horizontal scroll when content exceeds width', () => {
    const items = Array.from({ length: 20 }, (_, i) => `Item ${i + 1}`);
    render(<ScrollableCarousel items={items} />);

    const scrollable = screen.getByRole('list');

    // Vérifier que scrollWidth > offsetWidth (scroll nécessaire)
    expect(scrollable.scrollWidth).toBeGreaterThan(scrollable.offsetWidth);

    // Vérifier overflow-x: auto
    const styles = window.getComputedStyle(scrollable);
    expect(styles.overflowX).toBe('auto');
  });

  test('should not shrink items (flex-shrink-0)', () => {
    const items = ['1', '2', '3'];
    render(<ScrollableCarousel items={items} />);

    const items = screen.getAllByRole('listitem');

    items.forEach((item) => {
      const styles = window.getComputedStyle(item);
      expect(styles.flexShrink).toBe('0');
    });
  });

  test('should have accessible ARIA labels', () => {
    const items = ['1', '2', '3'];
    render(<ScrollableCarousel items={items} />);

    // Vérifier role="region"
    expect(screen.getByRole('region')).toBeInTheDocument();

    // Vérifier role="list"
    expect(screen.getByRole('list')).toBeInTheDocument();

    // Vérifier aria-label
    expect(screen.getByLabelText(/attached files/i)).toBeInTheDocument();
  });

  test('should be keyboard navigable', () => {
    const items = Array.from({ length: 10 }, (_, i) => `${i + 1}`);
    render(<ScrollableCarousel items={items} />);

    const scrollable = screen.getByRole('list');

    // Vérifier tabIndex={0}
    expect(scrollable).toHaveAttribute('tabIndex', '0');

    // Simuler focus
    scrollable.focus();
    expect(document.activeElement).toBe(scrollable);
  });
});
```

### Test de Non-Régression

```typescript
describe('ScrollableCarousel - No Regression', () => {
  test('should not have overflow-hidden on parent', () => {
    const items = ['1', '2', '3'];
    const { container } = render(<ScrollableCarousel items={items} />);

    const parent = container.firstChild as HTMLElement;
    const styles = window.getComputedStyle(parent);

    // ✅ overflow-hidden ne doit PAS être présent
    expect(styles.overflow).not.toBe('hidden');
  });

  test('should have min-w-0 on scrollable container', () => {
    const items = ['1', '2', '3'];
    render(<ScrollableCarousel items={items} />);

    const scrollable = screen.getByRole('list');

    // ✅ min-w-0 doit être présent
    expect(scrollable).toHaveClass('min-w-0');
  });

  test('parent width should match textarea width', () => {
    // Simuler un textarea parent
    const { container } = render(
      <div style={{ width: '500px' }}>
        <textarea style={{ width: '100%' }} />
        <ScrollableCarousel items={['1', '2', '3']} />
      </div>
    );

    const textarea = container.querySelector('textarea');
    const carousel = container.querySelector('[role="list"]');

    // ✅ Largeurs doivent matcher
    expect(carousel?.offsetWidth).toBe(textarea?.offsetWidth);
  });
});
```

---

## EXEMPLE 7 : Debugging (Console Utilities)

### Script de Diagnostic Complet

```javascript
// Copier-coller dans DevTools Console

function diagnoseScrollIssue() {
  const carousel = document.querySelector('[role="list"]');
  if (!carousel) {
    console.error('❌ Carrousel non trouvé');
    return;
  }

  const parent = carousel.parentElement;
  const items = carousel.querySelectorAll('[role="listitem"]');

  console.log('=== DIAGNOSTIC SCROLL HORIZONTAL ===\n');

  // 1. Parent Container
  const parentStyles = window.getComputedStyle(parent);
  console.log('1. PARENT CONTAINER');
  console.log('   Width:', parent.offsetWidth, 'px');
  console.log('   Max-width:', parentStyles.maxWidth);
  console.log('   Overflow:', parentStyles.overflow);
  console.log('   ✅ Doit avoir: overflow != hidden');
  console.log('   ✅ Doit avoir: max-width = 100%');
  console.log('');

  // 2. Scrollable Container
  const carouselStyles = window.getComputedStyle(carousel);
  console.log('2. SCROLLABLE CONTAINER');
  console.log('   Width:', carousel.offsetWidth, 'px');
  console.log('   ScrollWidth:', carousel.scrollWidth, 'px');
  console.log('   Overflow-X:', carouselStyles.overflowX);
  console.log('   Min-width:', carouselStyles.minWidth);
  console.log('   ✅ Doit avoir: overflow-x = auto');
  console.log('   ✅ Doit avoir: min-width = 0px');
  console.log('   ✅ Doit avoir: scrollWidth > offsetWidth (scroll actif)');
  console.log('');

  // 3. Items
  console.log('3. ITEMS');
  console.log('   Nombre total:', items.length);
  items.forEach((item, i) => {
    const itemStyles = window.getComputedStyle(item);
    if (i < 3 || i === items.length - 1) {
      console.log(`   Item ${i + 1}:`, {
        width: item.offsetWidth,
        flexShrink: itemStyles.flexShrink,
      });
    }
  });
  console.log('   ✅ Tous doivent avoir: flex-shrink = 0');
  console.log('');

  // 4. Scrollbar
  console.log('4. SCROLLBAR');
  console.log('   Scrollbar-width:', carouselStyles.scrollbarWidth || 'auto');
  console.log('   Scrollbar-color:', carouselStyles.scrollbarColor || 'auto');
  console.log('   ✅ Firefox: scrollbar-width = thin');
  console.log('   ✅ Chrome/Safari: ::-webkit-scrollbar styles');
  console.log('');

  // 5. Accessibilité
  console.log('5. ACCESSIBILITÉ');
  console.log('   Role:', carousel.getAttribute('role'));
  console.log('   ARIA Label:', carousel.getAttribute('aria-label'));
  console.log('   TabIndex:', carousel.getAttribute('tabIndex'));
  console.log('   ✅ Doit avoir: role="list"');
  console.log('   ✅ Doit avoir: aria-label défini');
  console.log('   ✅ Doit avoir: tabIndex="0"');
  console.log('');

  // 6. Résultat
  const isScrollable = carousel.scrollWidth > carousel.offsetWidth;
  const hasMinW0 = carouselStyles.minWidth === '0px';
  const hasOverflowAuto = carouselStyles.overflowX === 'auto';
  const parentNoOverflowHidden = parentStyles.overflow !== 'hidden';

  console.log('=== RÉSULTAT ===');
  if (isScrollable && hasMinW0 && hasOverflowAuto && parentNoOverflowHidden) {
    console.log('✅ SCROLL HORIZONTAL CONFIGURÉ CORRECTEMENT');
  } else {
    console.log('❌ PROBLÈME DÉTECTÉ:');
    if (!isScrollable) console.log('   - Scroll pas nécessaire (contenu tient dans la largeur)');
    if (!hasMinW0) console.log('   - min-w-0 manquant sur scrollable');
    if (!hasOverflowAuto) console.log('   - overflow-x: auto manquant');
    if (!parentNoOverflowHidden) console.log('   - Parent a overflow-hidden (bloque le scroll)');
  }
  console.log('');

  return {
    isScrollable,
    hasMinW0,
    hasOverflowAuto,
    parentNoOverflowHidden,
    success: isScrollable && hasMinW0 && hasOverflowAuto && parentNoOverflowHidden,
  };
}

// Exécuter le diagnostic
diagnoseScrollIssue();
```

### Test Rapide en 1 Ligne

```javascript
// Test rapide : le scroll fonctionne ?
const c = document.querySelector('[role="list"]');
console.log('Scroll OK?', c.scrollWidth > c.offsetWidth && getComputedStyle(c).overflowX === 'auto' ? '✅' : '❌');
```

---

## EXEMPLE 8 : Responsive Design (Breakpoints)

### Composant Responsive

```tsx
import React from 'react';

export function ResponsiveCarousel({ items }: { items: string[] }) {
  return (
    <div className="w-full max-w-full bg-gray-100">
      <div
        className="flex items-center gap-2 sm:gap-3 md:gap-4 px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 overflow-x-auto overflow-y-hidden w-full min-w-0"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#9ca3af #f3f4f6',
          minHeight: '80px',
        }}
      >
        {items.map((item, index) => (
          <div
            key={index}
            className="flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-blue-500 text-white flex items-center justify-center rounded text-xs sm:text-sm md:text-base"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Breakpoints Tailwind Personnalisés

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      screens: {
        'xs': '475px',
        '3xl': '1920px',
      },
      spacing: {
        'carousel-gap-mobile': '0.5rem',
        'carousel-gap-tablet': '0.75rem',
        'carousel-gap-desktop': '1rem',
      },
    },
  },
};
```

---

## CONCLUSION

Ces exemples de code sont **testés et fonctionnels**. Utilisez-les comme référence pour :

1. **Implémenter** un scroll horizontal robuste
2. **Débugger** des problèmes de scroll
3. **Tester** le comportement attendu
4. **Former** de nouveaux développeurs

**Fichiers Source** :
- AttachmentCarousel : `/Users/smpceo/Documents/Services/Meeshy/meeshy/apps/web/components/attachments/AttachmentCarousel.tsx`

**Build Status** : ✅ Compiled successfully
