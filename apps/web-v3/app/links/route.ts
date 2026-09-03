import { CARNET_DE_LIENS } from '@/app/connecte/liens-porte';

/**
 * `/links` — les liens de partage du lecteur connecté.
 *
 * PAS DE `POST` ICI, et c'est une décision : la création vit dans la feuille
 * `sheet:link`, un écran de la matrice que la v3 ne sert pas encore. Poser un
 * verbe d'écriture qu'aucun formulaire n'atteint ferait une surface ouverte
 * sans lecteur.
 */

export const GET = (requete: Request): Promise<Response> => CARNET_DE_LIENS(requete);

export const dynamic = 'force-dynamic';
