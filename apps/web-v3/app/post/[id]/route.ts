import { COMMENTAIRE_POSTE, COMMENTAIRES_SERVIS } from '@/app/connecte/commentaires-porte';

/**
 * `/post/:id` — une publication et ses commentaires.
 *
 * UNE SEULE ADRESSE POUR LES TROIS SOURCES. Un post, un réel et une story
 * s'ouvrent ici : ce sont trois genres d'une même table, et leur donner trois
 * routes ferait trois lecteurs à tenir d'accord — ce que le critère de fin
 * interdit précisément.
 *
 * LE `POST` EST LE GESTE DE L'ÉCRAN (#5091) : écrire un commentaire, en
 * Post/Redirect/Get — le formulaire vit dans la vue du lecteur CONNECTÉ, et
 * l'anonyme reçoit l'invitation, au POST comme au GET.
 */

type Contexte = { readonly params: Promise<{ id: string }> };

export const GET = async (requete: Request, contexte: Contexte): Promise<Response> =>
  COMMENTAIRES_SERVIS({ requete, id: (await contexte.params).id });

export const POST = async (requete: Request, contexte: Contexte): Promise<Response> =>
  COMMENTAIRE_POSTE({ requete, id: (await contexte.params).id });

export const dynamic = 'force-dynamic';
