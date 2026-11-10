import { lazy, Suspense, useState, type ReactNode } from 'react';

import { CallButton } from '@/components/call-glass-button';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { callActions } from '@/lib/calls/call-actions';
import { PILL_TEXT_WIDTH_CLASS, type CallPillText } from '@/lib/calls/call-pill-text';
import type { CallPanels } from '@/lib/calls/call-screen-layer';
import type { CallRowsKit } from '@/components/call-control-actions';
import type { CallFamilyRow } from '@/lib/calls/call-controls-disposition';
import type { ActiveCall } from '@/lib/calls/call-store';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LA PILULE DE VERRE** (#8391, #8550, #17327) — la même en audio, en vidéo et
 * en groupe : `(…)` · Micro · Sortie · Fin. `(…)` est devant le micro : il
 * bascule l'affichage des actions (`aria-expanded`). Ce qu'il sort dépend du
 * nombre de participants (`call-controls-disposition.ts`) : à deux, deux rails
 * sur les bords (`call-screen.tsx`) et la pilule NE GRANDIT PAS ; à plusieurs,
 * elle GRANDIT vers le haut — sa ligne de commandes reste en bas, et au-dessus
 * d'elle, dans le MÊME cadre de verre, UNE chose : les rangées des familles
 * (`call-control-actions.tsx`) OU le panneau ouvert, qui les REMPLACE (#8578) —
 * jamais les deux empilés. Un panneau la fait grandir à deux comme à plusieurs.
 *
 * LE TEXTE DE LA PILULE (#17343, `call-pill-text.ts`) : au repos, les sous-titres
 * vivent DANS son verre, au-dessus de sa rangée de base, en duo comme en groupe ;
 * le journal s'ouvre à leur place, et la rangée de base reste touchable ; `(…)`
 * les range tous deux et refermer les actions les rend. Le verre qui porte du
 * texte tient en 560 px, quelle que soit la fenêtre.
 *
 * Chaque bouton de la pilule porte son DISQUE de verre dessiné (#17345 —
 * `CallButton`, ton `disc`, `.glass-call-disc`) : un voile et un liseré, sans
 * flou à eux. Le seul `backdrop-filter` du groupe est celui de la pilule.
 *
 * « Sortie » ouvre la feuille des appareils (caméra, micro, sortie audio —
 * `call-devices-sheet.tsx`, chunk à part chargé au premier geste).
 *
 * Un toucher qui manque la pilule de peu reste à elle (#8735) : un débord
 * transparent autour d'elle garde les commandes au lieu de les effacer.
 */

const CallActionRows = lazy(() => import('./call-control-actions').then((module) => ({ default: module.CallActionRows })));

const CallDevicesSheet = lazy(() => import('./call-devices-sheet').then((module) => ({ default: module.CallDevicesSheet })));

type PillProps = {
  readonly call: ActiveCall;
  readonly language: InterfaceLanguage;
  /** Les rangées légendées que la pilule déplie : vide à deux, où les actions sont sur les rails. */
  readonly rows: readonly CallFamilyRow[];
  /** `(…)` est ouvert : un menu, un panneau. */
  readonly expanded: boolean;
  /** La pilule a grandi : un panneau, ou — à plusieurs — les rangées (`unfoldsPill`). */
  readonly grown: boolean;
  readonly onToggle: () => void;
  readonly prominent: boolean;
  /** Ce que la pilule porte de texte au-dessus de sa rangée de base. */
  readonly text: CallPillText;
  /** Les sous-titres, posés dans le verre de la pilule au repos (`text === 'captions'`). */
  readonly captions: ReactNode;
  readonly panels: CallPanels;
  /** Ce que les rangées, chargées à part, reçoivent de l'écran d'appel. */
  readonly kit: CallRowsKit;
  /** Le panneau ouvert, À LA PLACE des rangées. */
  readonly panel: ReactNode;
};

export function CallControlPill({ call, language, rows, expanded, grown, onToggle, prominent, text, captions, panels, kit, panel }: PillProps) {
  const [devicesOpen, setDevicesOpen] = useState(false);
  return (
    <>
      <div
        className={`${prominent ? 'glass-call-prominent' : 'glass-call'} relative isolate mx-auto flex flex-col rounded-sheet p-1.5 before:absolute before:-inset-2 before:-z-10 before:rounded-[34px] ${text !== 'none' ? PILL_TEXT_WIDTH_CLASS : grown ? 'w-[min(calc(100%-1.5rem),26rem)]' : 'w-fit'}`}
        data-call-control-pill={grown ? 'grown' : 'pill'}
        data-call-chrome-keep=""
      >
        {grown ? (
          <>
            <div className="flex max-h-[calc(100dvh-13rem)] min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain pt-1.5" data-call-deck="">
              {panel === null ? (
                <Suspense fallback={null}>
                  <CallActionRows call={call} rows={rows} language={language} panels={panels} kit={kit} />
                </Suspense>
              ) : (
                <div data-call-pill-text={text === 'journal' ? 'journal' : undefined}>{panel}</div>
              )}
            </div>
            <hr className="mx-2 my-2 border-0 border-t border-media-hairline" />
          </>
        ) : text === 'captions' ? (
          <>
            <div className="pt-1" data-call-pill-text="captions" data-call-pill-captions="">
              {captions}
            </div>
            <hr className="mx-2 my-1 border-0 border-t border-media-hairline" />
          </>
        ) : null}
        <div className="flex items-center justify-center gap-2">
          <CallButton
            label={translate(language, 'call.more')}
            glyph={<GlyphSvg glyph={CALL_VIEW_GLYPHS.dotsThree} size={24} />}
            onPress={onToggle}
            tone={expanded ? 'active' : 'disc'}
            expanded={expanded}
            controls={kit.actionsId}
            data={{ 'data-call-more': '' }}
          />
          <CallButton
            label={translate(language, call.micMuted ? 'call.mic.unmute' : 'call.mic.mute')}
            glyph={call.micMuted ? <GlyphSvg glyph={CALL_SCREEN_GLYPHS.microphoneSlash} size={22} /> : <Glyph name="microphone" size={22} />}
            onPress={callActions.toggleMic}
            tone={call.micMuted ? 'active' : 'disc'}
            pressed={call.micMuted}
          />
          <CallButton
            label={translate(language, 'call.devices.open')}
            glyph={<GlyphSvg glyph={CALL_VIEW_GLYPHS.speakerHigh} size={22} />}
            onPress={() => setDevicesOpen(true)}
            popup
            expanded={devicesOpen}
            data={{ 'data-call-devices-open': '' }}
          />
          <CallButton label={translate(language, 'call.hangup')} glyph={<GlyphSvg glyph={CALL_SCREEN_GLYPHS.phoneDisconnect} size={24} />} onPress={callActions.hangup} tone="danger" />
        </div>
      </div>
      {devicesOpen ? (
        <Suspense fallback={null}>
          <CallDevicesSheet onClose={() => setDevicesOpen(false)} />
        </Suspense>
      ) : null}
    </>
  );
}
