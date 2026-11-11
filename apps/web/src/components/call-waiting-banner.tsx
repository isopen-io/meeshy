import { useEffect } from 'react';

import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { PeerAvatar } from '@/components/peer-avatar';
import { callActions } from '@/lib/calls/call-actions';
import { callStore, type WaitingCall } from '@/lib/calls/call-store';
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

/**
 * **UN APPEL EST DÉJÀ EN COURS** — le refus d'en composer un second, dit 2,5 s puis retiré. Il vit ici,
 * avec le bandeau du second appel qui arrive : l'écran d'appel n'en paie que l'`import()`, et l'appel
 * vivant précharge ce chunk (`call-screen.tsx` › PREFETCH) bien avant qu'on tente un second appel.
 */
function CallBusyNotice() {
  const language = currentInterfaceLanguage();
  useEffect(() => {
    const handle = setTimeout(() => callStore.setState({ notice: null }), 2500);
    return () => clearTimeout(handle);
  }, []);
  return (
    <div role="status" className="fixed inset-x-0 z-[210] mx-auto w-fit rounded-full px-4 py-2 text-body shadow-lg" style={{ background: PILL_BG, color: 'var(--color-on-media)', bottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}>
      {translate(language, 'call.notice.alreadyInCall')}
    </div>
  );
}

/** Le second appel : celui qui sonne pendant le premier, et le refus d'en composer un — montés ensemble par la couche d'appel, une seule attente de chunk. */
export function SecondCallLayer({ waiting, busy }: { readonly waiting: WaitingCall | null; readonly busy: boolean }) {
  return (
    <>
      {waiting === null ? null : <CallWaitingBanner waiting={waiting} />}
      {busy ? <CallBusyNotice /> : null}
    </>
  );
}
