import { useEffect } from 'react';
import { useStore } from 'zustand/react';

import { controlNoticeText, noticeRole } from '@/lib/calls/call-control-text';
import { callNoticeStore, callReactionStore, dismissNotice, REACTION_LIFETIME_MS, type CallReactionBurst } from '@/lib/calls/call-control-state';
import { translateCallControls as t } from '@/lib/i18n-call-controls-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **CE QUE LES CONTRÔLES D'UN APPEL MONTRENT PAR-DESSUS LA SCÈNE** (#8439,
 * #8438, #8433) — les réactions qui montent et s'effacent, et le mot bref d'un
 * contrôle (« Nadia a coupé votre micro », « Impossible d'inviter Bruno »).
 *
 * Une réaction monte, grossit puis s'efface en `REACTION_LIFETIME_MS` ; sous
 * `prefers-reduced-motion`, elle apparaît et s'efface sur place. Le nombre
 * affiché à la fois est borné par le magasin (`REACTION_MAX_SHOWN`). Chacune
 * est dite au lecteur d'écran (« Nadia a réagi 👍 ») par une région polie.
 * Le mot d'un contrôle s'efface seul après `NOTICE_MS`.
 *
 * Chunk à part (`budgets.json` › `call_control_feedback`), posé par
 * `call-control-slots.tsx` ; il n'importe rien de `call_overlay`.
 */

export const NOTICE_MS = 4_000;

const KEYFRAMES = `@keyframes call-reaction-rise{0%{opacity:0;transform:translate(-50%,0) scale(.6)}12%{opacity:1;transform:translate(-50%,-4vh) scale(1.25)}70%{opacity:1}100%{opacity:0;transform:translate(-50%,-38vh) scale(1.05)}}@keyframes call-reaction-fade{0%{opacity:0}15%{opacity:1}75%{opacity:1}100%{opacity:0}}[data-call-reaction]{animation:call-reaction-rise ${REACTION_LIFETIME_MS}ms ease-out forwards}@media (prefers-reduced-motion:reduce){[data-call-reaction]{animation-name:call-reaction-fade;transform:translate(-50%,-12vh)}}`;

type NameOf = (userId: string) => string | null;

const spoken = (language: InterfaceLanguage, burst: CallReactionBurst, nameOf: NameOf): string =>
  burst.userId === null ? t(language, 'callControls.react.mine', { emoji: burst.emoji }) : t(language, 'callControls.react.from', { name: nameOf(burst.userId) ?? t(language, 'callControls.someone'), emoji: burst.emoji });

export function CallReactionBursts({ language, nameOf }: { readonly language: InterfaceLanguage; readonly nameOf: NameOf }) {
  const bursts = useStore(callReactionStore, (state) => state.bursts);
  const latest = bursts.at(-1);
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" data-call-reactions="">
      <style>{KEYFRAMES}</style>
      {bursts.map((burst) => (
        <div key={burst.id} aria-hidden className="absolute bottom-[28%] flex flex-col items-center gap-1" style={{ left: `${burst.lane * 100}%` }} data-call-reaction={burst.emoji}>
          <span className="text-[3.5rem] leading-none drop-shadow-lg">{burst.emoji}</span>
          <span className="glass-call max-w-[8rem] truncate rounded-full px-2 py-0.5 text-mini font-semibold text-on-media">
            {burst.userId === null ? t(language, 'callControls.people.you') : (nameOf(burst.userId) ?? t(language, 'callControls.someone'))}
          </span>
        </div>
      ))}
      <p className="sr-only" role="status" aria-live="polite">
        {latest === undefined ? '' : spoken(language, latest, nameOf)}
      </p>
    </div>
  );
}

export function CallControlToast({ language, nameOf }: { readonly language: InterfaceLanguage; readonly nameOf: NameOf }) {
  const { notice, seq } = useStore(callNoticeStore);
  useEffect(() => {
    if (notice === null) return undefined;
    const timer = setTimeout(() => dismissNotice(callNoticeStore), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice, seq]);
  if (notice === null) return null;
  return (
    <div className="pointer-events-none absolute inset-x-4 z-30 flex justify-center" style={{ top: 'calc(env(safe-area-inset-top) + 4.5rem)' }}>
      <p role={noticeRole(notice)} className="glass-call-prominent max-w-sm rounded-full px-4 py-2 text-center text-mini font-semibold text-on-media" data-call-control-notice={notice.kind}>
        {controlNoticeText(language, notice, nameOf)}
      </p>
    </div>
  );
}

export function CallControlFeedback({ language, nameOf, live }: { readonly language: InterfaceLanguage; readonly nameOf: NameOf; readonly live: boolean }) {
  return (
    <>
      {live ? <CallReactionBursts language={language} nameOf={nameOf} /> : null}
      <CallControlToast language={language} nameOf={nameOf} />
    </>
  );
}
