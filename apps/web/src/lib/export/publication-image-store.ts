import type { MessageCardSubject } from './message-card-subject';
import type { SceneExportSubject } from './scene/scene-export-subject';

/**
 * **UN SEUL ATELIER POUR « IMAGER »** (#16393, #16166) — un post, un réel, une
 * story ou le média d'un commentaire s'imagent dans l'atelier de carte, celui
 * d'un message. La demande porte la carte (texte servi, auteur, médias) et,
 * pour une œuvre composée, la scène dont le RENDU devient le média de la
 * carte : le moteur d'export de scène produit le fichier, l'atelier le pose.
 * L'export de scène ne s'ouvre jamais pour « Imager ».
 *
 * L'hôte unique (`publication-image-host.tsx`, monté par le chrome différé)
 * lit ce magasin : chaque surface n'a qu'à appeler `openPublicationImage`.
 * Module LÉGER : les demandes se composent dans `publication-image.ts`.
 */
export type PublicationImageRequest = {
  readonly key: string;
  readonly subject: MessageCardSubject;
  /** La scène à rendre en média de la carte — sans filigrane ni emballage : la carte signe elle-même. */
  readonly scene: SceneExportSubject | null;
};

type Listener = () => void;

let current: PublicationImageRequest | null = null;
const listeners = new Set<Listener>();

const emit = () => listeners.forEach((listener) => listener());

export const publicationImageRequest = (): PublicationImageRequest | null => current;

export function subscribePublicationImage(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function openPublicationImage(request: PublicationImageRequest): void {
  current = request;
  emit();
}

export function closePublicationImage(): void {
  if (current === null) return;
  current = null;
  emit();
}
