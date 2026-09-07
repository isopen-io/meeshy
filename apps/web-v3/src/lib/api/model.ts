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

export type Language = string;

/** Une traduction disponible pour un contenu, telle que le prisme la consomme. */
export type Translation = {
  readonly language: Language;
  readonly text: string;
};

export type Attachment =
  | { readonly kind: 'image'; readonly url: string; readonly width: number; readonly height: number; readonly description: string }
  | { readonly kind: 'video'; readonly poster: string; readonly duration: number; readonly width: number; readonly height: number }
  | { readonly kind: 'voice'; readonly duration: number; readonly transcript?: string; readonly waves: readonly number[] }
  | { readonly kind: 'file'; readonly name: string; readonly bytes: number };

export type Author = {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  /** 1..4 — l'index dans la palette categorielle d'avatars de la table de jetons. */
  readonly tint: 1 | 2 | 3 | 4;
  readonly presence: 'online' | 'away' | 'idle' | 'offline';
};

export type Status = 'pending' | 'sent' | 'delivered' | 'read';

export type Message = {
  readonly id: string;
  readonly author: Author;
  readonly isMine: boolean;
  readonly content: string;
  readonly originalLanguage: Language;
  readonly translations: readonly Translation[];
  readonly sentAt: string;
  readonly status: Status;
  readonly repliesTo?: { readonly id: string; readonly author: string; readonly excerpt: string };
  readonly attachments?: readonly Attachment[];
  readonly reactions?: readonly { readonly glyph: string; readonly count: number; readonly isMine: boolean }[];
};

export type Conversation = {
  readonly id: string;
  readonly title: string;
  readonly initials: string;
  readonly tint: 1 | 2 | 3 | 4;
  readonly isGrouped: boolean;
  readonly participants: number;
  readonly presence: Author['presence'];
  readonly lastMessage: {
    readonly content: string;
    readonly originalLanguage: Language;
    readonly translations: readonly Translation[];
    readonly author: string;
    readonly at: string;
  };
  readonly unread: number;
  readonly muted: boolean;
};
