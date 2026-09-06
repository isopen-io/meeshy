import { STUB_AUDIO } from '@/app/connecte/reglages-details-porte';

/** `/settings/media/audio` — régime 3 : état dessiné, aucun réglage obéi par la passerelle. */
export const GET = (requete: Request): Promise<Response> => STUB_AUDIO(requete);

export const dynamic = 'force-dynamic';
