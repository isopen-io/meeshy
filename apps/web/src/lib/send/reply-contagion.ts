import {
  contaminateReplyProtection,
  imposedReplyProtection,
  type ImposedReplyProtection,
  type ProtectionColumns,
} from '@meeshy/shared/utils/reply-protection-contagion';

import { EPHEMERAL_AFTER_READ_SECONDS, type ComposeProtection, type ProtectionFields } from './compose-protection';

/**
 * LA CONTAGION D'UNE RÉPONSE, CÔTÉ WEB (#8557) — deux PROJECTIONS de la loi
 * partagée (`@meeshy/shared/utils/reply-protection-contagion`), jamais une
 * seconde règle :
 *
 * - `contaminatedComposeProtection` : ce que le COMPOSEUR montre et envoie —
 *   l'état de l'utilisateur, recouvert par ce que la citation impose. L'état
 *   de l'utilisateur n'est jamais réécrit : retirer la citation le rend tel
 *   quel, et la préférence collante (#8306) ne voit que lui.
 * - `contaminatedProtectionFieldsOf` : ce que la BULLE OPTIMISTE et le corps
 *   du POST portent, par `contaminateReplyProtection` — les mêmes bits que la
 *   passerelle écrira.
 */
export const NO_IMPOSED_PROTECTION: ImposedReplyProtection = { blurred: false, ephemeral: null };

export type ImposedLocks = { readonly blurred: boolean; readonly ephemeral: boolean };

export function imposedLocksOf(imposed: ImposedReplyProtection): ImposedLocks {
  return { blurred: imposed.blurred, ephemeral: imposed.ephemeral !== null };
}

function imposedSecondsOf(imposed: ImposedReplyProtection): number | undefined {
  if (imposed.ephemeral === null) return undefined;
  return imposed.ephemeral.kind === 'after-read' ? EPHEMERAL_AFTER_READ_SECONDS : imposed.ephemeral.seconds;
}

export function contaminatedComposeProtection(
  protection: ComposeProtection,
  imposed: ImposedReplyProtection,
): ComposeProtection {
  const seconds = imposedSecondsOf(imposed);
  if (!imposed.blurred && seconds === undefined) return protection;
  return {
    ...protection,
    ...(seconds === undefined ? {} : { ephemeralSeconds: seconds }),
    ...(imposed.blurred ? { blurred: true } : {}),
  };
}

export function contaminatedProtectionFieldsOf(
  fields: ProtectionFields,
  quoted: ProtectionColumns | null | undefined,
  now: number,
): ProtectionFields {
  const imposed = imposedReplyProtection(quoted);
  if (!imposed.blurred && imposed.ephemeral === null) return fields;
  const contaminated = contaminateReplyProtection({
    requested: { effectFlags: fields.effectFlags, isBlurred: fields.isBlurred },
    quoted,
  });
  const expiresAt =
    imposed.ephemeral === null
      ? fields.expiresAt
      : contaminated.ephemeralDuration === null
        ? undefined
        : new Date(now + contaminated.ephemeralDuration * 1000);
  return {
    isBlurred: contaminated.isBlurred,
    isViewOnce: fields.isViewOnce,
    effectFlags: contaminated.effectFlags,
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
}
