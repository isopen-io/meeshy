import { COMMENTAIRES_SERVIS } from '@/app/connecte/commentaires-porte';

/**
 * `/post/:id` — une publication et ses commentaires.
 *
 * UNE SEULE ADRESSE POUR LES TROIS SOURCES. Un post, un réel et une story
 * s'ouvrent ici : ce sont trois genres d'une même table, et leur donner trois
 * routes ferait trois lecteurs à tenir d'accord — ce que le critère de fin
 * interdit précisément.
 *
 * PAS DE `POST`. Écrire un commentaire est un geste d'écriture que la v3 ne
 * sert pas encore ; poser le verbe sans le formulaire ferait une surface
 * ouverte sans lecteur.
 */

type Contexte = { readonly params: Promise<{ id: string }> };

export const GET = async (requete: Request, contexte: Contexte): Promise<Response> =>
  COMMENTAIRES_SERVIS({ requete, id: (await contexte.params).id });

export const dynamic = 'force-dynamic';
