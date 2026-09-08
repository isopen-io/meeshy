import { SORTIE, SORTIE_SANS_EFFET } from '@/app/authentification/deconnexion-porte';

/**
 * `POST /deconnexion` — l'adresse de la sortie (#5095).
 *
 * UN SEUL ARGUMENT, comme toutes les routes de la zone : le second que Next
 * passe est SON contexte (`{ params }`), jamais une dépendance à nous. Ce que
 * le témoin injecte, il l'injecte à `SORTIE` — voir le doc-comment de
 * `app/authentification/deconnexion-porte.ts`.
 */
export const POST = (requete: Request): Promise<Response> => SORTIE(requete);

export const GET = (): Promise<Response> => SORTIE_SANS_EFFET();

export const dynamic = 'force-dynamic';
