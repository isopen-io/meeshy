/**
 * ⚠️ DEPRECATED: N'utilisez PAS ce fichier barrel pour les imports
 *
 * Les barrel imports causent des problèmes de bundle size et empêchent le tree-shaking.
 * Utilisez plutôt des imports directs :
 *
 * ✅ CORRECT:
 * import { ErrorBoundary } from '@/components/common/ErrorBoundary';
 * import { Button } from '@/components/ui/button';
 *
 * ❌ À ÉVITER:
 * import { ErrorBoundary, Button } from '@/components/common';
 *
 * Ce fichier est conservé pour compatibilité mais NE DOIT PAS être utilisé.
 */

// Exports maintenus pour compatibilité uniquement - UTILISEZ DES IMPORTS DIRECTS
export { ErrorBoundary } from './ErrorBoundary';
export { LoadingSpinner, LoadingState, LoadingSkeleton, LoadingCard } from './LoadingStates';
export { UserSelector } from './user-selector';
export { BubbleStreamPage } from './bubble-stream-page';
export { BubbleMessage } from './BubbleMessage';
export { MessagesDisplay } from './messages-display';
export { LanguageSwitcher } from './language-switcher';
export { TranslationProvider } from './translation-provider';
