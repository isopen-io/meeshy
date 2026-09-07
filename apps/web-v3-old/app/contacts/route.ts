import { CARNET, REPONDRE } from '@/app/connecte/contacts-porte';

/**
 * `/contacts` — le carnet du lecteur connecté, et les deux gestes qui répondent
 * à une demande.
 *
 * DEUX VERBES SUR UNE SEULE ADRESSE, comme `/notifications` : `GET` sert la
 * liste, `POST` répond et redirige vers `GET`. Les formulaires de la vue n'ont
 * donc aucun attribut `action` — le défaut du navigateur est l'adresse
 * courante, et il suit la route quoi qu'il arrive.
 */

export const GET = (requete: Request): Promise<Response> => CARNET(requete);
export const POST = (requete: Request): Promise<Response> => REPONDRE(requete);

export const dynamic = 'force-dynamic';
