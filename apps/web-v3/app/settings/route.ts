import { CARREFOUR } from '@/app/connecte/reglages-porte';

/**
 * `/settings` — le carrefour des réglages du lecteur connecté.
 *
 * PAS DE `POST` : cet écran ne change rien, il ORIENTE. Une route qui accepte
 * un verbe qu'aucun formulaire n'emploie est une surface offerte pour rien.
 */
export const GET = (requete: Request): Promise<Response> => CARREFOUR(requete);

export const dynamic = 'force-dynamic';
