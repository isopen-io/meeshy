/**
 * Aides PARTAGÉES par les surfaces de `conversations/messages*.ts` (issue
 * #4284 — découpage de `messages.ts`, 2945 lignes, en fichiers frères par
 * responsabilité). Contient uniquement ce qui est utilisé par PLUSIEURS des
 * fichiers extraits ; un helper utilisé par un seul fichier part avec lui.
 * Voir `messages.ts` pour le composeur (`registerMessagesRoutes`).
 */
// `performanceLogger` n'a aucun lecteur dans ce fichier ni dans le reste du
// module éclaté — déjà le cas dans `messages.ts` avant ce découpage (import
// mort pré-existant sur la même ligne que `enhancedLogger`, qui lui EST
// utilisé ci-dessous). Conservé tel quel, non ré-exporté : rien n'importait
// `performanceLogger` depuis `messages.ts`.
import { enhancedLogger, performanceLogger } from '../../utils/logger-enhanced';

// Logger dédié pour messages
export const logger = enhancedLogger.child({ module: 'messages' });
