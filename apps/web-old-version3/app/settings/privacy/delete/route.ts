import { SUPPRESSION } from '@/app/connecte/reglages-details-porte';

/** `/settings/privacy/delete` — `POST /me/account/deletion`, la route CANONIQUE (§ 2.5). */
export const GET = (requete: Request): Promise<Response> => SUPPRESSION(requete);

export const POST = (requete: Request): Promise<Response> => SUPPRESSION(requete);

export const dynamic = 'force-dynamic';
