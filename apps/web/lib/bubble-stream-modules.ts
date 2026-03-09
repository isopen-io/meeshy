/**
 * Index pour exporter tous les modules réutilisables du bubble-stream
 * Facilite les imports partout dans le projet
 */

// Constants et types - use shared types as base, override with local types
export * from '@meeshy/shared/types';
// BubbleStreamMessage and UserLanguageConfig are re-exported from shared types above
// Local overrides from bubble-stream (excluding duplicates)
export { type BubbleStreamMessageV2, type BubbleStreamPageProps, type LanguageChoice } from '@/types/bubble-stream';

// Composants UI
export { FoldableSection } from '@/components/ui/foldable-section';
export { LanguageIndicators } from '@/components/language/language-indicators';
export { SidebarLanguageHeader } from '@/components/language/sidebar-language-header';

// Utilitaires
export * from '@/utils/user-language-preferences';

// Composant principal BubbleMessage (déjà existant)
export { BubbleMessage } from '@/components/common/BubbleMessage';
