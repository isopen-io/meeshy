import { RECHERCHE_SERVIE } from '@/app/connecte/recherche-porte';

/**
 * `/search` — chercher dans ses conversations et ses contacts.
 *
 * UN SEUL VERBE, ET C'EST `GET`. Une recherche est une LECTURE : son résultat
 * doit être rechargeable, mis en favori, partagé, retrouvé par le bouton
 * « précédent ». Le formulaire de la vue poste donc en `GET` vers cette même
 * adresse, et `?q=` porte la question.
 */

export const GET = (requete: Request): Promise<Response> => RECHERCHE_SERVIE(requete);

export const dynamic = 'force-dynamic';
