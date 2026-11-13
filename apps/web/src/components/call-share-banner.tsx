import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { callActions } from '@/lib/calls/call-actions';
import { HeldSwap } from '@/lib/calls/use-pill-motion';
import { translate } from '@/lib/i18n-catalog';
import type { CallMember } from '@/lib/calls/call-store';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LE BANDEAU « VOUS PARTAGEZ VOTRE ÉCRAN · ARRÊTER »** (P16.4 à P16.12, #17746 ; `CallScreenShareBanner`
 * d'iOS) — un bandeau de verre rouge pâle, 52 px, posé sous l'en-tête dans la pile des bandeaux
 * (`call-top-banners.ts`) : l'icône d'écran, la phrase, et « Arrêter » en bouton blanc de 44 px. Il
 * entre par le haut et repart vers le haut, comme l'en-tête (`HeldSwap`, forme `top`), et un toucher
 * qui range les commandes le range avec elles (`data-call-stow="top"`).
 *
 * Chunk à part (`budgets.json` › `call_top_banners`) : un appel qui ne partage pas ne le paie pas.
 */
export default function CallScreenShareBanner({ sharing, language, hidden }: { readonly sharing: boolean; readonly language: InterfaceLanguage; readonly hidden: boolean }) {
  return (
    <HeldSwap value={sharing ? true : null} shape="top" className="w-full px-3" data-call-screen-share-banner="">
      {() => (
        <div className="glass-call-danger flex min-h-[3.25rem] items-center justify-between gap-2 rounded-full py-1 pe-1 ps-4 text-body" role="status" data-call-stow="top" aria-hidden={hidden ? true : undefined}>
          <span className="flex min-w-0 items-center gap-2 font-semibold">
            <GlyphSvg glyph={CALL_SCREEN_GLYPHS.monitorArrowUp} size={18} />
            <span className="truncate">{translate(language, 'call.screen.sharing')}</span>
          </span>
          <button
            type="button"
            onClick={callActions.toggleScreen}
            aria-label={translate(language, 'call.screen.stop')}
            className="min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-body font-bold"
            style={{ background: 'var(--color-on-media)', color: 'var(--ios-error-dark)' }}
            data-call-screen-share-stop=""
          >
            {translate(language, 'call.screen.stopShort')}
          </button>
        </div>
      )}
    </HeldSwap>
  );
}

/**
 * La capsule de capture (R1, loi 13) : rouge, 44 px, posée UNE fois sous
 * l'en-tête, en audio comme en vidéo. Elle ne suit pas le chrome : une capture
 * ne se cache pas (iOS `CallCaptureAlertLayer`). Elle vit dans le chunk des
 * bandeaux du haut (`call_top_banners`), que l'appel vivant précharge : elle
 * ne paraît qu'avec une capture, et l'écran d'appel n'en paie que l'`import()`.
 */
export function CallCaptureAlerts({ members, language }: { readonly members: Readonly<Record<string, CallMember>>; readonly language: InterfaceLanguage }) {
  return (
    <div className="pointer-events-none flex max-w-full flex-col items-center gap-1 px-4" aria-live="assertive" data-call-capture-row="">
      {Object.values(members)
        .filter((member) => member.capturing)
        .map((member) => (
          <span key={`capture-${member.userId}`} role="alert" className="inline-flex h-11 max-w-full items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold leading-none" style={{ background: 'color-mix(in srgb, var(--ios-error-strong) 85%, transparent)', color: 'var(--color-ios-on-brand)' }} data-call-alert="capturing">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full border-2 border-current" data-call-alert-dot=""></span>
            <span className="truncate">{translate(language, 'call.alert.capturing', { name: member.name })}</span>
          </span>
        ))}
    </div>
  );
}
