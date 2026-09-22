import { useEffect } from 'react';

import { acquirePublicationRoom } from '@/lib/api/publication-rooms';

/**
 * **L'ÉCRAN QUI MONTRE UNE PUBLICATION EN TIENT LA SALLE** (#7395) — tant
 * qu'il est monté sur `postId`, et pas une image de plus.
 *
 * Rejoindre à l'ouverture, quitter en sortant ou en changeant de publication :
 * l'effet rend la libération, React l'appelle au démontage comme au changement
 * d'identifiant. Le compte, le rejeu à la reconnexion et le silence hors
 * connexion vivent dans `api/publication-rooms.ts` ; ce hook ne fait que tenir.
 *
 * `undefined` ou `''` ne tient rien : un écran qui n'a pas encore d'identifiant
 * (un lecteur de Réels vide, une adresse sans publication) n'a pas de salle.
 */
export function usePublicationRoom(postId: string | undefined): void {
  useEffect(() => (postId === undefined || postId === '' ? undefined : acquirePublicationRoom(postId)), [postId]);
}
