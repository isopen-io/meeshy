import type { SystemRow } from './message-badges';

/**
 * « DIS-LUI SALUT » (#16338) — l'avis d'arrivée invite à saluer, et son toucher
 * écrit la mention de chaque arrivant dans le composeur. Une mention suppose un
 * pseudo : un visiteur sans compte (`ano_…`, identifiant technique jamais
 * montré) n'en a pas, une ligne d'arrivées écrite avant que le pseudo y voyage
 * non plus. Le lecteur ne se salue pas lui-même. Personne à mentionner ⇒ pas
 * d'invite (loi 4).
 */
export type ArrivalGreeting = {
  readonly mentions: readonly string[];
  /** « Dis-leur » plutôt que « dis-lui ». */
  readonly plural: boolean;
};

const usernamesOf = (row: SystemRow): readonly string[] => {
  if (row.kind === 'join') return row.isAnonymous || row.username === undefined ? [] : [row.username];
  if (row.kind === 'arrivals') return row.notice.arrivals.flatMap((arrival) => (arrival.username === undefined ? [] : [arrival.username]));
  return [];
};

export function arrivalGreetingOf(row: SystemRow, viewerUsername: string | null | undefined): ArrivalGreeting | null {
  const mentions = usernamesOf(row)
    .filter((username) => username !== viewerUsername)
    .map((username) => `@${username}`);
  if (mentions.length === 0) return null;
  return { mentions, plural: mentions.length > 1 };
}

/** Ce que le composeur reçoit : les mentions, et l'espace où le message commence. */
export const greetingInsertion = (greeting: ArrivalGreeting): string => `${greeting.mentions.join(' ')} `;

/**
 * La phrase d'une ligne d'arrivées FINIT par son invite (« … — dis-leur salut »,
 * sept langues, `conversation-preview-strings.ts`) : quand l'invite se dessine
 * en bouton, la phrase la perd, une seule invite reste à l'écran.
 */
export function withoutTrailingInvite(text: string): string {
  const cut = text.lastIndexOf(' — ');
  return cut <= 0 ? text : text.slice(0, cut);
}
