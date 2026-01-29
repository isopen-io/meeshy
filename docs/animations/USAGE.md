# Guide d'Utilisation

## Installation

Les composants d'animation sont déjà intégrés dans le MessageComposer. Aucune installation supplémentaire n'est nécessaire.

## Utilisation Basique

### MessageComposer avec Animations

```typescript
import MessageComposer from '@/components/common/message-composer';

function MyPage() {
  return (
    <div>
      <h1>Ma Conversation</h1>
      <MessageComposer />
    </div>
  );
}
```

Toutes les animations sont automatiquement activées avec:
- Détection adaptative de la performance
- Support dark mode via `prefers-color-scheme`
- Respect de `prefers-reduced-motion`
- Accessibilité WCAG 2.1 AA

## Utilisation Avancée

### GlassContainer Standalone

Utilisez GlassContainer pour ajouter l'effet glassmorphisme à n'importe quel composant.

```typescript
import { GlassContainer } from '@/components/common/message-composer/GlassContainer';

function MyComponent() {
  return (
    <GlassContainer theme="dark" performanceProfile="high">
      <div className="my-content">
        <h2>Content with glassmorphisme</h2>
        <p>Beautiful frosted glass effect</p>
      </div>
    </GlassContainer>
  );
}
```

**Props**:
- `children`: React.ReactNode (required)
- `className`: string (optional) - Custom CSS classes
- `theme`: 'light' | 'dark' (optional) - Force theme, defaults to prefers-color-scheme
- `performanceProfile`: 'high' | 'medium' | 'low' (optional) - Force profile, defaults to auto-detection

**Exemples**:

```typescript
// Auto-détection (recommandé)
<GlassContainer>
  <MyContent />
</GlassContainer>

// Force dark theme
<GlassContainer theme="dark">
  <MyContent />
</GlassContainer>

// Force low performance pour devices lents
<GlassContainer performanceProfile="low">
  <MyContent />
</GlassContainer>

// Custom styling
<GlassContainer className="my-custom-glass">
  <MyContent />
</GlassContainer>
```

### DynamicGlow Standalone

Ajoutez le glow progressif à n'importe quel textarea ou input.

```typescript
import { DynamicGlow } from '@/components/common/message-composer/DynamicGlow';
import { useState, useEffect } from 'react';

function MyTextArea() {
  const [text, setText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const MAX_LENGTH = 1000;

  // Detect typing inactivity
  useEffect(() => {
    if (isTyping) {
      const timer = setTimeout(() => setIsTyping(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isTyping, text]);

  return (
    <div style={{ position: 'relative' }}>
      <DynamicGlow
        currentLength={text.length}
        maxLength={MAX_LENGTH}
        isTyping={isTyping}
      />
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setIsTyping(true);
        }}
        maxLength={MAX_LENGTH}
        style={{ position: 'relative', zIndex: 1 }}
      />
    </div>
  );
}
```

**Props**:
- `currentLength`: number (required) - Current character count
- `maxLength`: number (required) - Maximum character limit
- `isTyping`: boolean (required) - Whether user is currently typing

**Progression de couleur**:
- 0-50%: Blue (#3B82F6) - Normal
- 50-90%: Violet (#8B5CF6) - Getting full
- 90-100%: Pink (#EC4899) - Warning
- >100%: Red (#EF4444) - Over limit

### SendButton Standalone

Utilisez SendButton pour n'importe quel formulaire nécessitant un bouton d'envoi animé.

```typescript
import { SendButton } from '@/components/common/message-composer/SendButton';
import { useState } from 'react';

function MyForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '' });

  const handleSend = async () => {
    setIsLoading(true);
    try {
      await submitForm(formData);
      console.log('Form submitted!');
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const isValid = formData.name && formData.email;

  return (
    <form>
      <input
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        placeholder="Name"
      />
      <input
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        placeholder="Email"
      />
      <SendButton
        onClick={handleSend}
        disabled={!isValid}
        isLoading={isLoading}
        aria-label="Submit form"
      />
    </form>
  );
}
```

**Props**:
- `onClick`: () => void (required) - Click handler
- `disabled`: boolean (required) - Whether button is disabled
- `isLoading`: boolean (required) - Show loading spinner
- `aria-label`: string (optional) - Accessibility label, defaults to "Send message"

**États**:
- **Normal**: Gradient animé, bounce entrance
- **Hover**: Scale up (1.05), box shadow
- **Tap**: Scale down (0.95)
- **Loading**: Spinner rotation (360° loop)
- **Disabled**: Opacity 0.5, no interactions

### ToolbarButtons Standalone

Créez une toolbar avec boutons staggerés.

```typescript
import { ToolbarButtons } from '@/components/common/message-composer/ToolbarButtons';

function MyToolbar() {
  const handleMic = () => {
    console.log('Start recording');
    // Logique d'enregistrement audio
  };

  const handleAttachment = () => {
    console.log('Open file picker');
    // Logique de sélection de fichier
  };

  return (
    <ToolbarButtons
      onMicClick={handleMic}
      onAttachmentClick={handleAttachment}
      disabled={false}
    />
  );
}
```

**Props**:
- `onMicClick`: () => void (required) - Mic button handler
- `onAttachmentClick`: () => void (required) - Attachment button handler
- `disabled`: boolean (required) - Disable all buttons

**Animation**: Stagger entrance (Mic puis Attachment avec delay adaptatif)

## Customisation

### Désactiver les Animations

Les animations s'adaptent automatiquement au profil de performance du device. Pour forcer la désactivation complète:

```typescript
// Option 1: Force low performance profile
<GlassContainer performanceProfile="low">
  {/* Animations minimales */}
</GlassContainer>

// Option 2: CSS override (global)
<style>
  {`
    * {
      animation: none !important;
      transition: none !important;
    }
  `}
</style>
```

### Thème Personnalisé

GlassContainer utilise automatiquement `prefers-color-scheme`, mais vous pouvez forcer le thème:

```typescript
// Force light theme
<GlassContainer theme="light">
  <MyContent />
</GlassContainer>

// Force dark theme
<GlassContainer theme="dark">
  <MyContent />
</GlassContainer>

// Auto-detection (default)
<GlassContainer>
  <MyContent />
</GlassContainer>
```

### Performance Profile Personnalisé

```typescript
// High: Toutes les animations, blur 20px, spring physics
<GlassContainer performanceProfile="high">
  <MyContent />
</GlassContainer>

// Medium: Animations essentielles, blur 16px, tween
<GlassContainer performanceProfile="medium">
  <MyContent />
</GlassContainer>

// Low: Animations minimales, blur 8px, pas de stagger
<GlassContainer performanceProfile="low">
  <MyContent />
</GlassContainer>
```

### Couleurs de Glow Personnalisées

Modifiez les couleurs dans `useTypingGlow`:

```typescript
// Dans votre fork du composant
const customColorMap = {
  safe: 'rgba(34, 197, 94, 0.2)',    // Green
  warning: 'rgba(251, 146, 60, 0.3)', // Orange
  danger: 'rgba(239, 68, 68, 0.4)',   // Red
};

// Appliquer selon zones
if (percentage < 75) {
  glowColor = customColorMap.safe;
} else if (percentage < 95) {
  glowColor = customColorMap.warning;
} else {
  glowColor = customColorMap.danger;
}
```

### Animation Timing Personnalisé

```typescript
// Dans votre fork
const customSpringConfig = {
  stiffness: 300,  // Plus souple (default: 400)
  damping: 20,     // Plus de bounce (default: 25)
};

<motion.div
  variants={buttonVariants}
  transition={{
    type: 'spring',
    ...customSpringConfig,
  }}
/>
```

## Accessibility

### prefers-reduced-motion

Toutes les animations respectent automatiquement `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  .animation {
    animation: none !important;
    transition: none !important;
  }
}
```

**Test**: Activer dans Préférences Système → Accessibilité → Affichage → Réduire les animations

### ARIA Labels

Tous les boutons ont des aria-labels par défaut:

```typescript
// SendButton
<button aria-label="Send message">
  <SendIcon aria-hidden="true" />
</button>

// Mic button
<button aria-label="Record voice message">
  <MicIcon aria-hidden="true" />
</button>

// Attachment button
<button aria-label="Attach file">
  <AttachmentIcon aria-hidden="true" />
</button>
```

**Customisation**:

```typescript
<SendButton aria-label="Submit comment" />
```

### Keyboard Navigation

Tous les boutons sont accessibles au clavier:

```typescript
// Enter ou Space pour activer
<button
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
>
```

**Test**: Utiliser Tab pour naviguer, Enter/Space pour activer

### Focus Management

Focus visible avec outline:

```css
.button:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.8);
  outline-offset: 2px;
}

/* Pas d'outline au clic souris */
.button:focus:not(:focus-visible) {
  outline: none;
}
```

### Screen Readers

Tous les éléments interactifs ont des labels appropriés:

```typescript
// État loading annoncé
<button aria-busy={isLoading} aria-label="Sending message...">
  {isLoading ? <Spinner /> : <SendIcon />}
</button>

// État disabled annoncé
<button aria-disabled={disabled} aria-label="Send message (disabled)">
```

## Intégration avec Forms

### React Hook Form

```typescript
import { useForm } from 'react-hook-form';
import { SendButton } from '@/components/common/message-composer/SendButton';

function MyForm() {
  const { register, handleSubmit, formState: { isSubmitting, isValid } } = useForm();

  const onSubmit = async (data) => {
    await submitData(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('message', { required: true })} />
      <SendButton
        onClick={handleSubmit(onSubmit)}
        disabled={!isValid}
        isLoading={isSubmitting}
      />
    </form>
  );
}
```

### Formik

```typescript
import { useFormik } from 'formik';
import { SendButton } from '@/components/common/message-composer/SendButton';

function MyForm() {
  const formik = useFormik({
    initialValues: { message: '' },
    onSubmit: async (values) => {
      await submitData(values);
    },
  });

  return (
    <form onSubmit={formik.handleSubmit}>
      <input
        name="message"
        value={formik.values.message}
        onChange={formik.handleChange}
      />
      <SendButton
        onClick={formik.handleSubmit}
        disabled={!formik.isValid}
        isLoading={formik.isSubmitting}
      />
    </form>
  );
}
```

## Intégration avec State Management

### Redux

```typescript
import { useDispatch, useSelector } from 'react-redux';
import { SendButton } from '@/components/common/message-composer/SendButton';
import { sendMessage } from '@/store/messageSlice';

function MyComponent() {
  const dispatch = useDispatch();
  const { isLoading, message } = useSelector(state => state.messages);

  const handleSend = () => {
    dispatch(sendMessage(message));
  };

  return (
    <SendButton
      onClick={handleSend}
      disabled={!message}
      isLoading={isLoading}
    />
  );
}
```

### Zustand

```typescript
import { useMessageStore } from '@/store/messageStore';
import { SendButton } from '@/components/common/message-composer/SendButton';

function MyComponent() {
  const { message, isLoading, sendMessage } = useMessageStore();

  return (
    <SendButton
      onClick={sendMessage}
      disabled={!message}
      isLoading={isLoading}
    />
  );
}
```

## Tests

### Unit Tests

```bash
cd apps/web
pnpm test
```

**Tester vos composants personnalisés**:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { SendButton } from '@/components/common/message-composer/SendButton';

describe('SendButton', () => {
  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(
      <SendButton
        onClick={handleClick}
        disabled={false}
        isLoading={false}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('shows spinner when loading', () => {
    render(
      <SendButton
        onClick={() => {}}
        disabled={false}
        isLoading={true}
      />
    );

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });
});
```

### E2E Tests

```bash
cd apps/web
pnpm test:e2e
```

**Tester vos flows personnalisés**:

```typescript
import { test, expect } from '@playwright/test';

test('custom form submission', async ({ page }) => {
  await page.goto('/my-form');

  // Fill form
  await page.fill('[name="message"]', 'Test message');

  // Click send button
  await page.click('[aria-label="Submit form"]');

  // Verify loading state
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();

  // Verify success
  await expect(page.locator('.success-message')).toBeVisible();
});
```

## Performance Tips

### Lazy Loading

```typescript
import dynamic from 'next/dynamic';

// Lazy load animations pour faster initial load
const DynamicGlow = dynamic(
  () => import('@/components/common/message-composer/DynamicGlow'),
  { ssr: false }
);

function MyComponent() {
  return (
    <div>
      <DynamicGlow currentLength={text.length} maxLength={1000} isTyping={isTyping} />
    </div>
  );
}
```

### Memoization

```typescript
import { memo } from 'react';

// Éviter re-renders inutiles
const MemoizedSendButton = memo(SendButton);

function MyComponent() {
  const [message, setMessage] = useState('');

  return (
    <>
      <input value={message} onChange={(e) => setMessage(e.target.value)} />
      <MemoizedSendButton
        onClick={handleSend}
        disabled={!message}
        isLoading={false}
      />
    </>
  );
}
```

### Debouncing

```typescript
import { useDebouncedCallback } from 'use-debounce';

function MyComponent() {
  const [text, setText] = useState('');

  // Debounce typing detection pour réduire re-renders
  const debouncedSetTyping = useDebouncedCallback(
    (value) => setIsTyping(value),
    300
  );

  const handleChange = (e) => {
    setText(e.target.value);
    debouncedSetTyping(true);
  };

  return (
    <textarea value={text} onChange={handleChange} />
  );
}
```

## Troubleshooting

Voir [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) pour les problèmes courants et solutions.

## Ressources

- [Architecture détaillée](./ARCHITECTURE.md)
- [Performance & Optimisations](./PERFORMANCE.md)
- [Framer Motion Docs](https://www.framer.com/motion/)
- [CSS backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
