import { lazy, Suspense, useRef, useState, type ReactNode } from 'react';

import { CallButton } from '@/components/call-glass-button';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { callActions } from '@/lib/calls/call-actions';
import { PILL_TEXT_WIDTH_CLASS, type CallPillText } from '@/lib/calls/call-pill-text';
import { usePillGlass } from '@/lib/calls/use-pill-motion';
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
 * UN SEUL VERRE, QUI SE DÉFORME (#17536, loi 17) : le verre est un élément à lui
 * (`data-call-pill-skin`), seul mis à l'échelle (`use-pill-motion.ts`). Il s'allonge et
 * grandit pour contenir une option, un panneau ou les rangées d'un groupe, puis reprend
 * sa forme ; ce qui le quitte y repart en fondu depuis sa place. Rangée d'un toucher
 * (`stowed`), la pilule qui porte des sous-titres NE s'efface PAS et ne laisse pas un
 * second verre : ce même verre perd sa rangée de base et se resserre autour d'eux.
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

/* Ce que la pilule qui a grandi porte — les rangées ou le panneau, et le double qui en repart en fondu — vit dans son chunk, préchargé avec l'appel (`call-screen.tsx`). */
export const loadDeck = () => import('./call-deck-motion');
const Deck = lazy(() => loadDeck().then((module) => ({ default: module.Deck })));

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
  /** Les sous-titres allumés, posés dans le verre de la pilule au repos (`text === 'captions'`) ; ils y repartent en fondu d'eux-mêmes (#17406). */
  readonly captions: ReactNode;
  readonly panels: CallPanels;
  /** Ce que les rangées, chargées à part, reçoivent de l'écran d'appel. */
  readonly kit: CallRowsKit;
  /** Le panneau ouvert, À LA PLACE des rangées. */
  readonly panel: ReactNode;
  /** Les commandes sont rangées (un toucher sur la scène) et la pilule porte des sous-titres (`pillStaysWhenChromeStowed`) : elle reste, resserrée autour d'eux. */
  readonly stowed?: boolean;
};

export function CallControlPill({ call, language, rows, expanded, grown, onToggle, prominent, text, captions, panels, kit, panel, stowed = false }: PillProps) {
  const [devicesOpen, setDevicesOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const skin = useRef<HTMLSpanElement>(null);
  usePillGlass(box, skin, stowed);
  const away = { 'data-call-pill-rest': '', inert: stowed || undefined, 'aria-hidden': stowed || undefined };
  return (
    <>
      <div
        ref={box}
        className={`relative isolate mx-auto flex flex-col rounded-sheet p-1.5 before:absolute before:-inset-2 before:-z-10 before:rounded-[34px] ${text !== 'none' ? PILL_TEXT_WIDTH_CLASS : grown ? 'w-[min(calc(100%-1.5rem),26rem)]' : 'w-fit'}`}
        data-call-control-pill={grown ? 'grown' : 'pill'}
        data-call-pill-stowed={stowed ? '' : undefined}
        data-call-chrome-keep=""
      >
        <span ref={skin} aria-hidden="true" className={`${prominent ? 'glass-call-prominent' : 'glass-call'} absolute inset-0 -z-10 rounded-sheet`} data-call-pill-skin="" />
        {grown ? (
          <Suspense fallback={null}>
            <Deck call={call} language={language} rows={rows} panels={panels} kit={kit} panel={panel} text={text} box={box} away={away} />
          </Suspense>
        ) : null}
        {grown && !stowed ? null : captions}
        <div className="flex items-center justify-center gap-2" {...away}>
          <CallButton
            label={translate(language, expanded ? 'call.more.hide' : 'call.more.show')}
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
