/**
 * ⚠️ DEPRECATED: N'utilisez PAS ce fichier barrel pour les imports UI
 *
 * Les barrel imports empêchent le tree-shaking et augmentent le bundle size.
 * shadcn/ui est conçu pour être importé composant par composant.
 *
 * ✅ CORRECT - Import direct depuis le composant:
 * import { Button } from '@/components/ui/button';
 * import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog';
 * import { Card, CardContent, CardHeader } from '@/components/ui/card';
 *
 * ❌ À ÉVITER - Barrel import:
 * import { Button, Dialog, Card } from '@/components/ui';
 *
 * Pourquoi?
 * - L'import depuis ui/index.ts charge TOUS les composants UI (~50 composants)
 * - Cela ajoute ~50-80 KB de code non utilisé
 * - Les imports directs permettent au bundler de ne charger que ce qui est utilisé
 *
 * Ce fichier est conservé pour compatibilité mais NE DOIT PAS être utilisé.
 */

// ❌ NE PAS utiliser ces exports - Utilisez des imports directs
// Conservés temporairement pour compatibilité
export * from './alert';
export * from './avatar';
export * from './badge';
export * from './button';
export * from './card';
export * from './checkbox';
export * from './command';
export * from './dialog';
export * from './dropdown-menu';
export * from './input';
export * from './label';
export * from './online-indicator';
export * from './popover';
export * from './progress';
export * from './scroll-area';
export * from './select';
export * from './separator';
export * from './sheet';
export * from './slider';
export * from './sonner';
export * from './switch';
export * from './tabs';
export * from './textarea';
export * from './tooltip';
