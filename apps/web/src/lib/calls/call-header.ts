import type { CallQuality } from './call-store';

/**
 * **L'EN-TÊTE DE L'APPEL, EN RÈGLES** (#17329, #17341) — miroir de
 * `CallHeaderRule.swift`. Les boutons, de début à fin : Réduire · Image dans
 * l'image · Conversation. Et la capsule de droite : vidéo « nom donné · durée »,
 * audio le réseau dégradé seul, groupe « nom · nombre · durée » — le réseau ne
 * paraît jamais que dégradé. Un écran reçu en duo (P15.4) remplace le nom et la durée
 * par « Écran de X » et l'icône d'écran. `call-screen-header.tsx` ne fait que les dessiner.
 */

export type CallHeaderAction = 'minimize' | 'pip' | 'conversation';

export type CallHeaderContext = {
  /** Une vidéo peut flotter (`shouldOfferPip`). */
  readonly pipEligible: boolean;
  /** La fenêtre flotte déjà : le bouton sert à en sortir. */
  readonly pipActive: boolean;
  /** Un appel réveillé sans conversation n'a pas de porte vers elle. */
  readonly hasConversation: boolean;
};

export function callHeaderActions({ pipEligible, pipActive, hasConversation }: CallHeaderContext): readonly CallHeaderAction[] {
  return ['minimize', ...(pipEligible || pipActive ? (['pip'] as const) : []), ...(hasConversation ? (['conversation'] as const) : [])];
}

/** Moyen ou faible : le seul état où le réseau mérite une place dans l'en-tête. */
export function isNetworkDegraded(quality: Pick<CallQuality, 'level'> | null): boolean {
  return quality !== null && (quality.level === 'fair' || quality.level === 'poor');
}

export type CallHeaderCapsuleLayout = 'audio' | 'video' | 'group';

export type CallHeaderCapsuleInput = {
  readonly layout: CallHeaderCapsuleLayout;
  readonly established: boolean;
  readonly degraded: boolean;
  readonly givenName: string | null;
  readonly displayName: string | null;
  readonly groupName: string | null;
  readonly participantCount: number;
  /** P15.4 — l'écran du correspondant tient la scène du duo. */
  readonly receivesScreen?: boolean;
};

export type CallHeaderCapsule = {
  readonly title: string | null;
  readonly participantCount: number | null;
  readonly duration: boolean;
  readonly network: boolean;
  /** P15.4 — `title` est alors le NOM de qui partage : la capsule dit « Écran de X », avec l'icône d'écran, sans durée. */
  readonly receivedScreen?: true;
};

const meaningful = (text: string | null | undefined): string | null => {
  const trimmed = text?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

export function callHeaderCapsule(input: CallHeaderCapsuleInput): CallHeaderCapsule | null {
  if (!input.established) return null;
  if (input.layout === 'audio') return input.degraded ? { title: null, participantCount: null, duration: false, network: true } : null;
  if (input.layout === 'video') {
    const title = meaningful(input.givenName) ?? meaningful(input.displayName);
    return input.receivesScreen === true ? { title, participantCount: null, duration: false, network: input.degraded, receivedScreen: true } : { title, participantCount: null, duration: true, network: input.degraded };
  }
  return { title: meaningful(input.groupName), participantCount: input.participantCount > 0 ? input.participantCount : null, duration: true, network: input.degraded };
}

export type CallHeaderNames = { readonly givenName: string | null; readonly groupName: string | null };

type NamedConversation = { readonly type: string; readonly title?: string | null | undefined; readonly customName: string | undefined };

/**
 * Les noms que la conversation en cache donne à la capsule : le nom que j'ai
 * donné à la personne en direct, le nom du groupe en groupe (le mien, sinon son
 * titre, sinon celui que l'appel connaît).
 */
export function callHeaderNames(conversation: NamedConversation | undefined, knownTitle: string | null): CallHeaderNames {
  if (conversation === undefined) return { givenName: null, groupName: meaningful(knownTitle) };
  const customName = meaningful(conversation.customName);
  if (conversation.type === 'direct') return { givenName: customName, groupName: null };
  return { givenName: null, groupName: customName ?? meaningful(conversation.title) ?? meaningful(knownTitle) };
}

export type ReducedTitleInput = { readonly givenName: string | null; readonly groupName: string | null; readonly displayName: string | null };

/**
 * L'appel réduit dit « nom · durée » (P18.5, miroir de `CallReducedRule.swift`) : en groupe le nom du
 * groupe, sinon le nom que j'ai donné à la personne, sinon son nom d'affichage — les noms de la capsule
 * de l'en-tête. `null` : aucun nom connu, la durée seule.
 */
export function reducedTitle({ givenName, groupName, displayName }: ReducedTitleInput): string | null {
  return meaningful(groupName) ?? meaningful(givenName) ?? meaningful(displayName);
}

export function reducedCaption(title: string | null, duration: string): string {
  return title === null ? duration : `${title} · ${duration}`;
}
