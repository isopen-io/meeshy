import { CARNET_DE_LIENS, CREE_UN_LIEN } from '@/app/connecte/liens-porte';

/**
 * `/links` — les liens de partage du lecteur connecté, et leur création.
 *
 * DEUX VERBES SUR UNE SEULE ADRESSE : `GET` sert le carnet — et, dans l'état
 * `?nouveau`, la feuille de création par-dessus —, `POST` crée le lien puis
 * redirige vers `GET`. Le formulaire de la feuille n'a donc aucun attribut
 * `action` : le défaut du navigateur est l'adresse courante, et il suit la
 * route quoi qu'il arrive.
 *
 * Le `POST` n'existait pas quand cet écran a été livré, faute de feuille pour
 * l'atteindre — un verbe d'écriture sans formulaire est une surface ouverte
 * sans lecteur. `sheet:link` (#5071) lui donne le sien.
 */

export const GET = (requete: Request): Promise<Response> => CARNET_DE_LIENS(requete);
export const POST = (requete: Request): Promise<Response> => CREE_UN_LIEN(requete);

export const dynamic = 'force-dynamic';
