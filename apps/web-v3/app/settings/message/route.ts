import { MESSAGES } from '@/app/connecte/reglages-details-porte';

/** `/settings/message` — régime 3 : « À DÉFINIR » (planche), aucun contrôle inerte. */
export const GET = (requete: Request): Promise<Response> => MESSAGES(requete);

export const dynamic = 'force-dynamic';
