/**
 * LES SORTIES NATIVES DU NAVIGATEUR (#9573) — ce que les boutons de Meeshy
 * n'offrent plus, le navigateur l'offre encore de lui-même : sélectionner le
 * texte d'une flamme et le copier, glisser sa photo vers le bureau, ouvrir
 * « Enregistrer l'image sous… » ou « Enregistrer la cible du lien sous… » par
 * le menu contextuel natif, ouvrir le fichier dans un onglet au clic milieu.
 * Une surface qui rend un contenu qui ne sort pas est SCELLÉE
 * (`data-exit-sealed`, posé par `sealedProps` de `content-exit.ts` — le même
 * verdict que les boutons), et ces gestes y sont annulés, quel que soit ce
 * qu'elle rend : texte, image, vidéo, lien de fichier, svg, fond. L'appui
 * long, la sélection et l'impression sont fermés en CSS
 * (`styles/sealed-exit.css`). La garde s'installe UNE fois, sur le document
 * (`main.tsx`) : elle vaut pour toute surface qui porte l'attribut.
 *
 * CE N'EST PAS UNE CLÔTURE. Le fichier est servi au navigateur : les outils de
 * développement, l'onglet réseau et la capture d'écran restent hors de portée
 * d'une page web (la capture relève de #9574). Ce module retire les gestes
 * ordinaires, pas l'accès d'un lecteur décidé.
 */
export const SEALED_ROW_ATTRIBUTE = 'data-exit-sealed';

const SEALED_SELECTOR = `[${SEALED_ROW_ATTRIBUTE}]`;

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
  const onSealedGesture = (event: Event): void => {
    if (inSealedRow(event.target)) event.preventDefault();
  };
  const GESTURES = ['dragstart', 'contextmenu', 'auxclick'] as const;
  doc.addEventListener('copy', onClipboard, true);
  doc.addEventListener('cut', onClipboard, true);
  GESTURES.forEach((type) => doc.addEventListener(type, onSealedGesture, true));
  return () => {
    doc.removeEventListener('copy', onClipboard, true);
    doc.removeEventListener('cut', onClipboard, true);
    GESTURES.forEach((type) => doc.removeEventListener(type, onSealedGesture, true));
  };
}
