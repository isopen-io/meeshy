import { CONFIDENTIALITE } from '@/app/connecte/reglages-details-porte';

/**
 * `/settings/privacy` — les quatre bascules de confidentialité EXPOSÉES
 * (§ 0 de la spécification `reglages-details`) et les liens vers l'export et
 * la suppression de compte.
 */
export const GET = (requete: Request): Promise<Response> => CONFIDENTIALITE(requete);

export const POST = (requete: Request): Promise<Response> => CONFIDENTIALITE(requete);

export const dynamic = 'force-dynamic';
