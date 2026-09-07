import { CARNET_DE_LIENS, POST_SUR_LES_LIENS } from '@/app/connecte/liens-porte';

/**
 * `/links` — les liens de partage du lecteur connecté, leur création ET leur
 * fermeture (#4933).
 *
 * DEUX VERBES SUR UNE SEULE ADRESSE : `GET` sert le carnet — et, dans l'état
 * `?nouveau`, la feuille de création par-dessus —, `POST` écrit puis (sur
 * succès) redirige vers `GET`. Ni le formulaire de la feuille ni celui du menu
 * d'une ligne n'ont d'attribut `action` : le défaut du navigateur est
 * l'adresse courante, et les deux suivent la route quoi qu'il arrive.
 * `POST_SUR_LES_LIENS` distingue les deux gestes par le champ `geste`.
 *
 * Le `POST` de création n'existait pas quand cet écran a été livré, faute de
 * feuille pour l'atteindre — un verbe d'écriture sans formulaire est une
 * surface ouverte sans lecteur. `sheet:link` (#5071) lui a donné le sien ; le
 * menu de chaque ligne (#4933) donne le sien à la fermeture.
 */

export const GET = (requete: Request): Promise<Response> => CARNET_DE_LIENS(requete);
export const POST = (requete: Request): Promise<Response> => POST_SUR_LES_LIENS(requete);

export const dynamic = 'force-dynamic';
