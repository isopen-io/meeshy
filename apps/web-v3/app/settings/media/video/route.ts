import { STUB_VIDEO } from '@/app/connecte/reglages-details-porte';

/** `/settings/media/video` — régime 3 : état dessiné, aucun réglage obéi par la passerelle. */
export const GET = (requete: Request): Promise<Response> => STUB_VIDEO(requete);

export const dynamic = 'force-dynamic';
