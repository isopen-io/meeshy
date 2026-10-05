import { accentPaletteOf } from '@/lib/accent';
import type { Conversation } from '@/lib/api/types';

import type { ActiveCall } from './call-store';
import type { FramePerson, FrameTexts } from './frames/frame-text';

/**
 * **QUI UN CADRE MONTRE, ET CE QU'IL ÉCRIT** (#8743, spec § 2, § 4.5 et
 * § 5.6) — les PERSONNES de l'appel, moi compris : les autres dans leur
 * ordre d'arrivée, puis moi. Qui sonne sans avoir décroché n'y est pas
 * encore ; caméra coupée, on y est quand même (le cadre peint l'initiale).
 * Les noms sont ceux que l'appel montre déjà ; le @pseudo, celui que la
 * conversation en cache connaît — jamais inventé. Le nom du groupe ne
 * s'écrit qu'en groupe, l'accent est celui de la conversation
 * (`accentPaletteOf`, la loi partagée), `null` sans elle : le cadre retombe
 * alors sur l'indigo Meeshy.
 */

export type MontageCall = Pick<ActiveCall, 'conversationId' | 'isGroup' | 'title' | 'members'>;

export type MontageViewer = { readonly id: string | null; readonly handle: string | null; readonly displayName: string };

export type CircleConversation = Pick<Conversation, 'id' | 'title' | 'identifier' | 'type' | 'participants'>;

export type MontageCircle = { readonly people: readonly FramePerson[]; readonly texts: FrameTexts };

/** Mon identifiant de personne quand la session n'en porte pas. */
export const SELF_PERSON = 'self';

const filled = (value: string | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
};

function handleIn(conversation: CircleConversation | undefined, userId: string): string | null {
  const participant = conversation?.participants.find((entry) => entry.userId === userId || entry.user?.id === userId);
  return filled(participant?.user?.username);
}

type CircleInput = {
  readonly call: MontageCall;
  readonly viewer: MontageViewer;
  readonly conversation: CircleConversation | undefined;
  readonly date: string;
};

export function montageCircle({ call, viewer, conversation, date }: CircleInput): MontageCircle {
  const peers = Object.values(call.members)
    .filter((member) => member.link !== 'ringing')
    .map((member): FramePerson => ({ id: member.userId, name: member.name, handle: handleIn(conversation, member.userId), isSelf: false }));
  const me: FramePerson = { id: viewer.id ?? SELF_PERSON, name: viewer.displayName, handle: filled(viewer.handle ?? undefined), isSelf: true };
  const palette = conversation === undefined ? null : accentPaletteOf(conversation);
  return {
    people: [...peers, me],
    texts: {
      groupName: call.isGroup ? (filled(conversation?.title) ?? filled(call.title)) : null,
      isGroup: call.isGroup,
      date,
      accent: palette === null ? null : { primary: palette.primary, secondary: palette.secondary },
    },
  };
}

/** La date du jour, au format court de la langue (spec § 4.5). */
export function frameDate(at: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(at);
  } catch {
    return at.toDateString();
  }
}
