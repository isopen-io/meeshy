import { RETIRE_UN_APPAREIL, SECURITE } from '@/app/connecte/reglages-porte';

/**
 * `/settings/security` — le mot de passe et les appareils qui reçoivent les
 * notifications du lecteur.
 *
 * `POST` RETIRE un appareil et redirige : sans le Post/Redirect/Get, un
 * rechargement rejouerait le retrait sur un appareil déjà parti, et le bouton
 * « précédent » ramènerait à un formulaire déjà soumis.
 */
export const GET = (requete: Request): Promise<Response> => SECURITE(requete);
export const POST = (requete: Request): Promise<Response> => RETIRE_UN_APPAREIL(requete);

export const dynamic = 'force-dynamic';
