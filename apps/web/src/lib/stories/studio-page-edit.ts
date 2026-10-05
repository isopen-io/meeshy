import type { StudioPage } from './studio-page';

/**
 * L'ÉCRITURE de la page COURANTE que l'hôte remet à une plaque à la demande
 * (#8518) — un geste d'historique ; `key` fusionne une frappe continue en un
 * seul pas. La plaque ne compose que des changements de PAGE
 * (`pageWithVisualAlt`, `pageWithVisualFilter`) : importer la loi du
 * brouillon (`studio.ts`) depuis un chunk à la demande en ferait sortir
 * `studio-page` et `studio-timeline` en chunks partagés, que le budget
 * `story_studio` ne mesure plus (mesuré : 23,13 Ko « verts » par omission).
 */
export type StudioPageEdit = (change: (page: StudioPage) => StudioPage, key?: string | null) => void;
