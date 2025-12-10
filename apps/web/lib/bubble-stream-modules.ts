/**
 * Index pour exporter tous les modules réutilisables du bubble-stream
 * Facilite les imports partout dans le projet
 */

// Constants et types
export * from '@meeshy/shared/types';
export * from '@/types/bubble-stream';

// Composants UI
export { FoldableSection } from '@/components/ui/foldable-section';
export { LanguageIndicators } from '@/components/language/language-indicators';
export { SidebarLanguageHeader } from '@/components/language/sidebar-language-header';

// Utilitaires
export * from '@/utils/user-language-preferences';

// Composant principal BubbleMessage (déjà existant)
export { BubbleMessage } from '@/components/common/BubbleMessage';
