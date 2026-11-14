import { GlyphSvg } from '@/components/glyph';
import { MeeshyGlass } from '@/components/kit/meeshy-glass-tone';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { callActions } from '@/lib/calls/call-actions';
import { callServicePills, servicePillBanners, servicePillSignalsOf, type ServicePills, type WebVideoNotice } from '@/lib/calls/call-service-pills';
import type { PresentBanners } from '@/lib/calls/call-top-banners';
import { HeldSwap } from '@/lib/calls/use-pill-motion';
import { translate } from '@/lib/i18n-catalog';
import { pipOpenStore, shellPipStore } from '@/lib/calls/call-pip';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
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

/**
 * Les alertes d'un pair (`call:quality-alert`, #8047) : son lien instable, dit poliment dans une région
 * vivante, sous l'en-tête, sur le verre partagé du kit (loi 18.1). Elles vivent avec les bandeaux du haut (`call_top_banners`), que l'appel vivant
 * précharge : l'écran d'appel n'en paie que l'`import()`.
 */
export function CallPeerAlerts({ members, language }: { readonly members: Readonly<Record<string, CallMember>>; readonly language: InterfaceLanguage }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4" aria-live="polite">
      {Object.values(members)
        .filter((member) => member.weakNetwork)
        .map((member) => (
          <MeeshyGlass as="span" key={`network-${member.userId}`} density="dense" className="rounded-full px-3 py-1 text-mini text-on-media" data-call-alert="weak-network">
            {translate(language, 'call.alert.weakNetwork', { name: member.name })}
          </MeeshyGlass>
        ))}
    </div>
  );
}

const VIDEO_NOTICE_KEY = { reduced: 'call.video.frozen', paused: 'call.video.suspended' } as const;

/**
 * « Vidéo réduite » (E4, #18227 ; `CallVideoNoticePill` d'Android) : ma vidéo gelée puis mise en pause
 * par un réseau faible, dite dans une capsule du verre partagé, maillon de la pile du haut. Annoncée
 * poliment (`role="status"`), deux lignes au plus dans ses 44 px : la phrase tient en allemand ou en
 * arabe. Quand elle se montre, c'est la loi des pastilles de service qui le dit.
 */
export function CallVideoNoticePill({ notice, language }: { readonly notice: WebVideoNotice; readonly language: InterfaceLanguage }) {
  return (
    <MeeshyGlass role="status" density="dense" className="flex min-h-11 max-w-full items-center rounded-full px-4 py-1.5 text-center text-mini font-semibold leading-4 text-on-media" data-call-video-notice={notice}>
      <span className="line-clamp-2">{translate(language, VIDEO_NOTICE_KEY[notice])}</span>
    </MeeshyGlass>
  );
}

/**
 * La loi des pastilles de service (E3 · E4), lue ici et nulle part ailleurs. L'image dans l'image (fenêtre
 * du navigateur ou de la coque) se lit au rendu : le relevé de qualité, qui seul allume l'avis, rend
 * l'écran à chaque mesure.
 */
const pillsOf = (call: ActiveCall): ServicePills<WebVideoNotice> => callServicePills(servicePillSignalsOf(call, pipOpenStore.getState().open || shellPipStore.getState().active));

/** Les maillons que les pastilles posent dans la pile : ma vignette descend sous eux (`selfTileClearance`) — rien tant que l'appel ne vit pas. */
export const servicePresence = (call: ActiveCall, live: boolean): PresentBanners => Object.fromEntries(servicePillBanners(pillsOf(call)).map((banner) => [banner, live]));

/**
 * La capsule de capture puis « Vidéo réduite », voisines dans la pile (capture · En attente · Vidéo réduite) :
 * chacune entre par le haut et repart vers le haut (`HeldSwap`, forme `top` ; un fondu seul sous Réduire les
 * animations), toujours montée à son rang pour se retenir le temps de repartir. Aucune ne se range avec les
 * commandes : une capture ne se cache pas (R1), et l'avis dit pourquoi l'image change. « En attente » ne
 * s'allume pas sur le web : son moteur n'expose aucun état d'attente.
 */
export function CallServiceBanners({ call, capturing, language }: { readonly call: ActiveCall; readonly capturing: boolean; readonly language: InterfaceLanguage }) {
  const notice = pillsOf(call).videoNotice;
  return (
    <>
      <HeldSwap value={capturing ? call.members : null} shape="top" className="flex w-full justify-center" data-call-capture-slot="">
        {(held) => <CallCaptureAlerts members={held} language={language} />}
      </HeldSwap>
      <HeldSwap value={notice === 'none' ? null : notice} shape="top" className="flex w-full justify-center px-3" data-call-video-notice-slot="">
        {(held) => <CallVideoNoticePill notice={held} language={language} />}
      </HeldSwap>
    </>
  );
}
