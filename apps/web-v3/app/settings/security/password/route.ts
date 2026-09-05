import { CHANGE_LE_MOT_DE_PASSE, MOT_DE_PASSE } from '@/app/connecte/reglages-porte';

/**
 * `/settings/security/password` — le changement de mot de passe.
 *
 * LE SUCCÈS REDIRIGE, LE REFUS RE-SERT LE DOCUMENT. Rien n'a été écrit en cas
 * de refus, donc il n'y a rien à protéger du rejeu ; et le motif que la
 * passerelle donne (« Current password is incorrect ») ne peut pas voyager dans
 * une URL sans finir dans l'historique du navigateur.
 */
export const GET = (requete: Request): Promise<Response> => MOT_DE_PASSE(requete);
export const POST = (requete: Request): Promise<Response> => CHANGE_LE_MOT_DE_PASSE(requete);

export const dynamic = 'force-dynamic';
