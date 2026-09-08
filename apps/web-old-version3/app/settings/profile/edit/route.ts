import { EDITION, ENREGISTRE } from '@/app/connecte/reglages-porte';

/**
 * `/settings/profile/edit` — le formulaire du profil, et son écriture.
 *
 * DEUX VERBES SUR UNE SEULE ADRESSE : `GET` sert le formulaire, `POST` écrit
 * puis redirige vers `GET`. Le formulaire de la vue n'a donc aucun attribut
 * `action` — le défaut du navigateur est l'adresse courante.
 */
export const GET = (requete: Request): Promise<Response> => EDITION(requete);
export const POST = (requete: Request): Promise<Response> => ENREGISTRE(requete);

export const dynamic = 'force-dynamic';
