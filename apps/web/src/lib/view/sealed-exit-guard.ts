import { contentExitLaw } from '@meeshy/shared/utils/content-exit-law';

import type { ExitMessage } from './content-exit';

/**
 * LES SORTIES NATIVES DU NAVIGATEUR (#9573) — ce que les boutons de Meeshy
 * n'offrent plus, le navigateur l'offre encore de lui-même : sélectionner le
 * texte d'une flamme et le copier, glisser sa photo vers le bureau, ouvrir
 * « Enregistrer l'image sous… » par le menu contextuel natif. La rangée d'un
 * contenu qui disparaît est SCELLÉE (`data-exit-sealed`, la nature lue par la
 * loi partagée), et ces gestes y sont annulés.
 *
 * CE N'EST PAS UNE CLÔTURE. Le fichier est servi au navigateur : les outils de
 * développement, l'onglet réseau et la capture d'écran restent hors de portée
 * d'une page web (la capture relève de #9574). Ce module retire les gestes
 * ordinaires, pas l'accès d'un lecteur décidé.
 */
export const SEALED_ROW_ATTRIBUTE = 'data-exit-sealed';

const SEALED_SELECTOR = `[${SEALED_ROW_ATTRIBUTE}]`;

/** L'attribut d'une rangée dont le contenu disparaît — rien pour un message ordinaire. */
export function sealedRowProps(message: ExitMessage): { readonly [SEALED_ROW_ATTRIBUTE]?: '' } {
  return contentExitLaw(message).nature === 'ordinary' ? {} : { [SEALED_ROW_ATTRIBUTE]: '' };
}

const elementOf = (node: EventTarget | Node | null): Element | null => {
  if (node === null || !('nodeType' in node)) return null;
  return node.nodeType === 1 ? (node as Element) : (node as Node).parentElement;
};

const inSealedRow = (node: EventTarget | Node | null): boolean => elementOf(node)?.closest(SEALED_SELECTOR) != null;

/** Les nœuds que la sélection courante touche — ses bornes, et chaque rangée scellée qu'elle traverse. */
function selectedNodes(doc: Document): readonly Node[] {
  const selection = doc.getSelection?.();
  if (selection == null || selection.isCollapsed) return [];
  const crossed = [...doc.querySelectorAll(SEALED_SELECTOR)].filter((row) => selection.containsNode(row, true));
  return [selection.anchorNode, selection.focusNode, ...crossed].filter((node): node is Node => node !== null);
}

export function installSealedExitGuard(doc: Document, selected: () => readonly Node[] = () => selectedNodes(doc)): () => void {
  const onClipboard = (event: Event): void => {
    if (inSealedRow(event.target) || selected().some(inSealedRow)) event.preventDefault();
  };
  const onDrag = (event: Event): void => {
    if (inSealedRow(event.target)) event.preventDefault();
  };
  const onContextMenu = (event: Event): void => {
    const media = elementOf(event.target)?.closest('img, video, audio, canvas');
    if (media != null && inSealedRow(media)) event.preventDefault();
  };
  doc.addEventListener('copy', onClipboard, true);
  doc.addEventListener('cut', onClipboard, true);
  doc.addEventListener('dragstart', onDrag, true);
  doc.addEventListener('contextmenu', onContextMenu, true);
  return () => {
    doc.removeEventListener('copy', onClipboard, true);
    doc.removeEventListener('cut', onClipboard, true);
    doc.removeEventListener('dragstart', onDrag, true);
    doc.removeEventListener('contextmenu', onContextMenu, true);
  };
}
