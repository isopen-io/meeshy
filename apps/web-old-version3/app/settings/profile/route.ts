import { PROFIL } from '@/app/connecte/reglages-porte';

/**
 * `/settings/profile` — la fiche du lecteur, telle que `GET /auth/me` la sert.
 *
 * Elle se LIT ; ce qui s'y change passe par `/settings/profile/edit`, qui est
 * une autre adresse parce que c'est un autre geste : on relit son profil bien
 * plus souvent qu'on ne le modifie, et servir un formulaire à qui vient
 * vérifier son identifiant lui ferait payer 83 langues d'options pour rien.
 */
export const GET = (requete: Request): Promise<Response> => PROFIL(requete);

export const dynamic = 'force-dynamic';
