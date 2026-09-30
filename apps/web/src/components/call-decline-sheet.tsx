import { useEffect, useRef, useState } from 'react';

import { DECLINE_REPLY_KEYS, DECLINE_REPLY_MAX_LENGTH, declineWithReply, type DeclineReplyDeps } from '@/lib/calls/decline-reply';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';

/**
 * **REFUSER AVEC UN MESSAGE** (#8065) — la feuille qui monte de l'écran
 * entrant au toucher de « Message » : quatre réponses rapides, puis un champ
 * libre. Un toucher suffit pour la réponse nominale (refus + message) ;
 * « Annuler » rend la sonnerie intacte. Mêmes teintes et même clavier que la
 * feuille des périphériques (`call-devices-sheet.tsx`) : Échap ferme, le
 * focus revient à « Message ».
 */

type SheetCall = Parameters<typeof declineWithReply>[0]['call'];

const INK_2 = 'rgba(255,255,255,0.72)';
const ROW = 'rgba(255,255,255,0.10)';

export function CallDeclineSheet({
  call,
  language,
  deps,
  onClose,
}: {
  readonly call: SheetCall;
  readonly language: InterfaceLanguage;
  readonly deps: DeclineReplyDeps;
  readonly onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  useBackDismiss(onClose);
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('[data-call-decline-reply]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      opener?.focus?.();
    };
  }, [onClose]);

  const reply = (text: string) => {
    if (declineWithReply({ call, text, language, deps })) onClose();
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center sm:items-center" data-call-decline="">
      <button type="button" aria-label={translate(language, 'callDecline.cancel')} tabIndex={-1} onClick={onClose} className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="call-decline-title"
        className="relative flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-card p-4 pb-safe sm:rounded-card"
        style={{ background: '#1c1a24', color: '#fff' }}
      >
        <h2 id="call-decline-title" className="text-body font-semibold">
          {translate(language, 'callDecline.title')}
        </h2>
        <ul className="flex flex-col gap-2">
          {DECLINE_REPLY_KEYS.map((key) => {
            const text = translate(language, key);
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => reply(text)}
                  className="flex min-h-11 w-full items-center rounded-card px-3 text-start text-body"
                  style={{ background: ROW, color: '#fff' }}
                  data-call-decline-reply={key}
                >
                  {text}
                </button>
              </li>
            );
          })}
        </ul>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            reply(draft);
          }}
        >
          <label className="text-mini" style={{ color: INK_2 }} htmlFor="call-decline-custom">
            {translate(language, 'callDecline.custom.label')}
          </label>
          <input
            id="call-decline-custom"
            type="text"
            value={draft}
            onInput={(event) => setDraft(event.currentTarget.value)}
            placeholder={translate(language, 'callDecline.custom.placeholder')}
            maxLength={DECLINE_REPLY_MAX_LENGTH}
            enterKeyHint="send"
            className="min-h-11 w-full rounded-card px-3 text-body"
            style={{ background: ROW, color: '#fff' }}
            data-call-decline-custom=""
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="min-h-11 rounded-full px-4 text-body" style={{ color: INK_2 }}>
              {translate(language, 'callDecline.cancel')}
            </button>
            <button
              type="submit"
              disabled={draft.trim().length === 0}
              className="min-h-11 rounded-full px-4 text-body font-semibold disabled:opacity-40"
              style={{ background: '#ef4444', color: '#fff' }}
            >
              {translate(language, 'callDecline.custom.send')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
