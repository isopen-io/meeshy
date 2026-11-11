import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { PeerAvatar } from '@/components/peer-avatar';
import { callActions } from '@/lib/calls/call-actions';
import type { WaitingCall } from '@/lib/calls/call-store';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';

/**
 * **UN SECOND APPEL ARRIVE PENDANT LE PREMIER** (`CallWaitingBannerView.swift`) —
 * qui appelle, et ses deux réponses. Son propre chunk (#17499) : il ne paraît
 * que si un autre appel sonne pendant celui-ci, donc l'écran d'appel n'en paie
 * que l'`import()`, et l'appel vivant le précharge quand le navigateur souffle.
 */

const PILL_BG = 'color-mix(in srgb, var(--color-media-backdrop) 92%, transparent)';

export function CallWaitingBanner({ waiting }: { readonly waiting: WaitingCall }) {
  const language = currentInterfaceLanguage();
  return (
    <div
      role="alertdialog"
      aria-label={translate(language, 'call.waiting.from', { caller: waiting.callerName })}
      className="fixed inset-x-3 z-[210] mx-auto flex max-w-md items-center gap-3 rounded-card p-3 shadow-lg"
      style={{ background: PILL_BG, color: 'var(--color-on-media)', top: 'calc(env(safe-area-inset-top) + 3.75rem)' }}
      data-call-waiting=""
    >
      <PeerAvatar presenceKey={waiting.callerKey ?? undefined} initials={initialsOf(waiting.callerName)} color={colorForName(waiting.callerName)} size={40} {...(waiting.callerAvatar === null ? {} : { src: waiting.callerAvatar })} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold">{waiting.title}</p>
        <p className="truncate text-mini" style={{ color: 'var(--color-on-media-3)' }}>
          {translate(language, 'call.waiting.from', { caller: waiting.callerName })}
        </p>
      </div>
      <button type="button" onClick={callActions.declineWaiting} className="min-h-11 rounded-full px-3 text-body font-semibold" style={{ background: 'var(--ios-error-strong)' }}>
        {translate(language, 'call.waiting.decline')}
      </button>
      <button type="button" onClick={callActions.answerWaiting} className="min-h-11 rounded-full px-3 text-body font-semibold" style={{ background: 'var(--ios-success)' }}>
        {translate(language, 'call.waiting.answer')}
      </button>
    </div>
  );
}
