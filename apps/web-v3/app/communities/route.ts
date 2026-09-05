import { COMMUNAUTES_DU_LECTEUR, CREE_UNE_COMMUNAUTE } from '@/app/connecte/communautes-porte';

/**
 * `/communities` — les communautés du lecteur (§ « MeeshyComposer » de
 * `CLAUDE.md` : issue matrice `#communities`, ordre 45, milestone L7).
 *
 * DEUX VERBES SUR UNE SEULE ADRESSE, le patron `/links` : `GET` sert la liste
 * — et, dans l'état `?ouverte=<id>`, la surimpression de ses conversations ;
 * dans `?nouvelle`, la feuille de création — `POST` crée une communauté et
 * (sur succès) redirige vers `GET`. Aucun autre verbe : rejoindre, quitter,
 * inviter, administrer une communauté sont HORS périmètre de cet écran (aucune
 * ligne de la matrice ne les porte).
 */
export const GET = (requete: Request): Promise<Response> => COMMUNAUTES_DU_LECTEUR(requete);
export const POST = (requete: Request): Promise<Response> => CREE_UNE_COMMUNAUTE(requete);

export const dynamic = 'force-dynamic';
