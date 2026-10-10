import type { SendPayload } from '@/lib/send/send-sheet-plan';
import type { StudioSeed } from '@/lib/stories/studio-seed';

const joinLines = (parts: readonly (string | undefined)[]): string =>
  parts.map((part) => part?.trim() ?? '').filter((part) => part !== '').join('\n');

/**
 * **« MODIFIER AVANT DE PUBLIER »** (#9286) — ce qu'un partage ENTRANT sème
 * dans le studio, miroir de l'extension de partage iOS : les fichiers (une
 * scène chacun) et un corps fait de la légende tapée dans la feuille puis du
 * texte et de l'adresse partagés, dans l'ordre où le plan d'envoi les pose
 * (`send-sheet-plan.ts`). Seules les deux formes d'un partage entrant
 * (`payloadOfIncomingShare`) se recomposent : ce qui vient déjà de Meeshy a
 * ses propres gestes (« Composer », republier).
 */
export function studioSeedOfShare(payload: SendPayload, caption: string): StudioSeed | null {
  switch (payload.kind) {
    case 'files':
      return { files: payload.files, text: caption.trim() };
    case 'text':
      return { files: [], text: joinLines([caption, payload.text, payload.url]) };
    default:
      return null;
  }
}
