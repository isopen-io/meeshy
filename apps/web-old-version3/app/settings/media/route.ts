import { HUB_MEDIAS } from '@/app/connecte/reglages-details-porte';

/** `/settings/media` — le hub : trois rangées-liens, aucun appel passerelle. */
export const GET = (requete: Request): Promise<Response> => HUB_MEDIAS(requete);

export const dynamic = 'force-dynamic';
