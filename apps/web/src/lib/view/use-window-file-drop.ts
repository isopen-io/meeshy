import { useEffect, useRef, useState } from 'react';

/**
 * LE DÉPÔT D'UN FICHIER SUR LA FENÊTRE (#9991) — un glisser venu du Finder
 * qui atteint la page sans gestionnaire est OUVERT par le navigateur à la
 * place de la conversation. Ce crochet capture `dragover`/`drop` au niveau de
 * la fenêtre dès que le glisser porte des fichiers, compte les entrées
 * imbriquées pour dire quand le survol finit, et remet les fichiers au `drop`
 * seulement : Safari laisse `dataTransfer.files` vide tant qu'on survole.
 * Un dépôt déjà traité par une zone dédiée (`defaultPrevented`) est laissé à
 * cette zone ; un glisser de texte ou de lien reste natif.
 */
export const carriesFiles = (transfer: DataTransfer | null | undefined): boolean =>
  transfer !== null && transfer !== undefined && Array.from(transfer.types).includes('Files');

export function useWindowFileDrop(onFiles: (files: readonly File[]) => void): boolean {
  const [hovering, setHovering] = useState(false);
  const latest = useRef(onFiles);
  latest.current = onFiles;

  useEffect(() => {
    let depth = 0;
    const settle = () => {
      depth = 0;
      setHovering(false);
    };
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      depth += 1;
      setHovering(true);
    };
    const over = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy';
    };
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setHovering(false);
    };
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer)) return;
      settle();
      if (event.defaultPrevented) return;
      event.preventDefault();
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) latest.current(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return hovering;
}
