/**
 * Audio components - Refactored for better performance and maintainability
 *
 * Architecture:
 * - Hooks pour la logique (useAudioPlayback, useAudioTranslation, useAudioEffectsAnalysis)
 * - Composants UI séparés et optimisés avec React.memo
 * - Chargement dynamique pour le panneau d'effets
 */

export { SimpleAudioPlayer, CompactAudioPlayer } from './SimpleAudioPlayer';
export { AudioProgressBar } from './AudioProgressBar';
export { AudioControls } from './AudioControls';
export { AudioEffectIcon } from './AudioEffectIcon';
export { AudioEffectsPanel } from './AudioEffectsPanel';
export { AudioEffectsGraph } from './AudioEffectsGraph';
export { AudioEffectsTimeline } from './AudioEffectsTimeline';
export { AudioEffectsOverview } from './AudioEffectsOverview';
export { AudioTranscriptionPanel } from './AudioTranscriptionPanel';
