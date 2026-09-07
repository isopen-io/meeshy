import { EXPORT } from '@/app/connecte/reglages-details-porte';

/** `/settings/privacy/export` — relaie `GET /me/export` en pièce téléchargeable (§ 2.4). */
export const GET = (requete: Request): Promise<Response> => EXPORT(requete);

export const POST = (requete: Request): Promise<Response> => EXPORT(requete);

export const dynamic = 'force-dynamic';
