/**
 * LE MODELE DE VUE du POC.
 *
 * Ce n'est PAS une seconde source de verite : c'est une PROJECTION etroite de
 * `packages/shared/types/conversation.ts` (`Message`, `Conversation`), reduite
 * a ce que les deux ecrans du POC affichent. Le jour ou ce POC devient un
 * produit, ces types s'effacent au profit d'`import type` depuis
 * `@meeshy/shared` — la regle du depot est « une source, jamais de jumelle »,
 * et une projection documentee comme telle est une etape, pas une exception.
 */

export type Langue = string;

/** Une traduction disponible pour un contenu, telle que le prisme la consomme. */
export type Traduction = {
  readonly langue: Langue;
  readonly texte: string;
};

export type Piece =
  | { readonly genre: 'image'; readonly url: string; readonly largeur: number; readonly hauteur: number; readonly description: string }
  | { readonly genre: 'video'; readonly poster: string; readonly duree: number; readonly largeur: number; readonly hauteur: number }
  | { readonly genre: 'vocal'; readonly duree: number; readonly transcrit?: string; readonly ondes: readonly number[] }
  | { readonly genre: 'fichier'; readonly nom: string; readonly octets: number };

export type Auteur = {
  readonly id: string;
  readonly nom: string;
  readonly initiales: string;
  /** 1..4 — l'index dans la palette categorielle d'avatars de la table de jetons. */
  readonly teinte: 1 | 2 | 3 | 4;
  readonly presence: 'en-ligne' | 'absent' | 'inactif' | 'hors-ligne';
};

export type Etat = 'en-attente' | 'envoye' | 'remis' | 'lu';

export type Message = {
  readonly id: string;
  readonly auteur: Auteur;
  readonly deMoi: boolean;
  readonly contenu: string;
  readonly langueOriginale: Langue;
  readonly traductions: readonly Traduction[];
  readonly envoyeA: string;
  readonly etat: Etat;
  readonly repondA?: { readonly id: string; readonly auteur: string; readonly extrait: string };
  readonly pieces?: readonly Piece[];
  readonly reactions?: readonly { readonly glyphe: string; readonly compte: number; readonly parMoi: boolean }[];
};

export type Conversation = {
  readonly id: string;
  readonly titre: string;
  readonly initiales: string;
  readonly teinte: 1 | 2 | 3 | 4;
  readonly estGroupe: boolean;
  readonly participants: number;
  readonly presence: Auteur['presence'];
  readonly dernierMessage: {
    readonly contenu: string;
    readonly langueOriginale: Langue;
    readonly traductions: readonly Traduction[];
    readonly auteur: string;
    readonly a: string;
  };
  readonly nonLus: number;
  readonly enSourdine: boolean;
};
