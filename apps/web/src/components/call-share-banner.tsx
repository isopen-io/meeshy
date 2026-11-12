import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { callActions } from '@/lib/calls/call-actions';
import { HeldSwap } from '@/lib/calls/use-pill-motion';
import { translate } from '@/lib/i18n-catalog';
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
