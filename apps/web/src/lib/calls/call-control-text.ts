import type { CallControlErrorCode } from '@meeshy/shared/types/call-control-law';

import { translateCallControls as t } from '@/lib/i18n-call-controls-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import type { CallControlNotice } from './call-control-state';

/**
 * **LE MOT QU'UN CONTRÔLE D'APPEL DOIT À L'UTILISATEUR** (#8433, #8438) — qui a
 * coupé mon micro, et pourquoi une invitation, une coupure, un retrait ou ma
 * caméra (#9095) n'a pas abouti. Le code de l'accusé choisit la phrase ; un code sans phrase
 * propre retombe sur « Impossible de … », jamais sur le code brut.
 */

type Failure = 'callControls.error.invite' | 'callControls.error.mute' | 'callControls.error.remove';

function failureText(language: InterfaceLanguage, code: CallControlErrorCode, name: string, fallback: Failure): string {
  switch (code) {
    case 'NOT_A_CONTACT':
      return t(language, 'callControls.error.notContact', { name });
    case 'ALREADY_IN_CALL':
      return t(language, 'callControls.error.alreadyIn', { name });
    case 'MAX_PARTICIPANTS_REACHED':
      return t(language, 'callControls.error.full');
    case 'RATE_LIMITED':
      return t(language, 'callControls.error.rateLimited');
    case 'PERMISSION_DENIED':
      return t(language, 'callControls.error.denied');
    case 'CALL_NOT_ACTIVE':
      return t(language, 'callControls.error.notActive');
    case 'TARGET_NOT_IN_CALL':
      return t(language, 'callControls.error.gone', { name });
    default:
      return t(language, fallback, { name });
  }
}

export function controlNoticeText(language: InterfaceLanguage, notice: CallControlNotice, nameOf: (userId: string) => string | null): string {
  switch (notice.kind) {
    case 'muted-by':
      return t(language, 'callControls.mutedBy', { name: nameOf(notice.byUserId) ?? t(language, 'callControls.someone') });
    case 'invite-failed':
      return failureText(language, notice.code, notice.name, 'callControls.error.invite');
    case 'mute-failed':
      return failureText(language, notice.code, notice.name, 'callControls.error.mute');
    case 'remove-failed':
      return t(language, 'callControls.error.remove', { name: notice.name });
    case 'invite-declined':
      return t(language, 'callControls.invite.declined', { name: notice.name });
    case 'invite-unanswered':
      return t(language, 'callControls.invite.unanswered', { name: notice.name });
    case 'camera-failed':
      return t(language, notice.failure === 'permission' ? 'callControls.camera.denied' : 'callControls.camera.failed');
  }
}

const SPOKEN: ReadonlySet<CallControlNotice['kind']> = new Set(['muted-by', 'invite-declined', 'invite-unanswered']);

/** Ce que les autres ont fait se DIT (statut) ; un échec de mon geste s'ANNONCE (alerte). */
export const noticeRole = (notice: CallControlNotice): 'status' | 'alert' => (SPOKEN.has(notice.kind) ? 'status' : 'alert');
