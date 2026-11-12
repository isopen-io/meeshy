import { useEffect, useState } from 'react';

import { useStore } from 'zustand/react';

import { CallButton } from '@/components/call-glass-button';
import { CallQualityChip } from '@/components/call-quality';
import { GlyphSvg } from '@/components/glyph';
import { GLYPHS } from '@/components/glyphs';
import { CALL_DEVICES_GLYPHS } from '@/components/glyphs-call-devices';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { callActions } from '@/lib/calls/call-actions';
import { participantCountOf } from '@/lib/calls/call-controls-disposition';
import { callHeaderActions, callHeaderCapsule, isNetworkDegraded, type CallHeaderCapsuleLayout } from '@/lib/calls/call-header';
import { cachedCallNames } from '@/lib/calls/call-header-names';
import { browserPipSupport, pipOpenStore, requestCallPip, requestCallPipExit, shouldOfferPip } from '@/lib/calls/call-pip';
import { elapsedSeconds, formatCallClock, type ActiveCall } from '@/lib/calls/call-store';
import { callLayout } from '@/lib/calls/call-view';
import { HeldSwap } from '@/lib/calls/use-pill-motion';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { href, navigate } from '@/routes/route-table';

/**
 * **L'EN-TÊTE DE L'ÉCRAN D'APPEL** (#8046, #8391, #8436, #17329) — à gauche,
 * Réduire (un chevron), puis Image dans l'image (si le navigateur le permet et
 * que l'appel y est éligible, ou pour en sortir), puis « Conversation » (le SEUL
 * chemin vers la conversation de l'appel : il réduit l'appel et ouvre le fil) ;
 * à droite, la capsule que décide `call-header.ts` (#17341), qui ouvre le détail
 * au toucher. Les réglages d'appareils ont rejoint « Sortie » dans la pilule.
 * Chaque bouton flotte seul : il porte son verre.
 *
 * L'HORLOGE vit ici (#8735) : la durée qui avance chaque seconde ne rend que
 * la puce qui l'affiche (et la ligne d'état d'un appel vocal, `CallClock`),
 * jamais tout l'écran d'appel — un rendu complet par seconde coûtait des
 * images en plein glissé.
 */

/** L'instant, relu chaque seconde tant que `active`. */
function useSecondTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, [active]);
  return now;
}

/** La durée de l'appel, `null` avant la connexion. */
export function useCallClock(call: Pick<ActiveCall, 'connectedAt'>, active: boolean): string | null {
  const now = useSecondTick(active && call.connectedAt !== null);
  return call.connectedAt === null ? null : formatCallClock(elapsedSeconds(call, now));
}

/** La durée seule, en texte : elle se rend sans rendre son hôte. */
export function CallClock({ call, active }: { readonly call: Pick<ActiveCall, 'connectedAt'>; readonly active: boolean }) {
  return <>{useCallClock(call, active)}</>;
}

function openConversation(conversationId: string): void {
  callActions.minimize();
  navigate(href('thread', { conversation: conversationId }));
}

type HeaderProps = {
  readonly call: ActiveCall;
  readonly language: InterfaceLanguage;
  /** L'appel est rejoint : la puce porte sa durée. */
  readonly joined: boolean;
  readonly prominent: boolean;
};

const CAPSULE_LAYOUT: Readonly<Record<ReturnType<typeof callLayout>, CallHeaderCapsuleLayout>> = { portrait: 'audio', 'video-duo': 'video', screen: 'video', grid: 'group' };

export function CallScreenHeader({ call, language, joined, prominent }: HeaderProps) {
  const live = call.phase.kind !== 'ended' && call.phase.kind !== 'incoming';
  const ticking = useCallClock(call, live && joined);
  const clock = joined ? ticking : null;
  const pipActive = useStore(pipOpenStore, (state) => state.open);
  if (!live) return <div className="min-h-11" />;
  const actions = callHeaderActions({ pipEligible: shouldOfferPip(call, browserPipSupport()), pipActive, hasConversation: call.conversationId !== '' });
  const layout = callLayout(call);
  const names = cachedCallNames(call);
  const capsule = callHeaderCapsule({
    layout: CAPSULE_LAYOUT[layout],
    established: clock !== null,
    degraded: isNetworkDegraded(call.quality),
    givenName: names.givenName,
    displayName: call.title,
    groupName: names.groupName,
    participantCount: participantCountOf(call, layout),
    receivesScreen: layout === 'screen',
  });
  return (
    <div className="flex min-h-11 items-center justify-between gap-2 px-4" data-call-header="">
      <div className="flex shrink-0 items-center gap-2">
        {actions.map((action) =>
          action === 'minimize' ? (
            <CallButton key={action} label={translate(language, 'call.minimize')} glyph={<GlyphSvg glyph={GLYPHS.caretDown} size={20} />} onPress={callActions.minimize} tone="glass" prominent={prominent} size={44} />
          ) : action === 'pip' ? (
            <CallButton
              key={action}
              label={translate(language, pipActive ? 'call.pip.exit' : 'call.pip.enter')}
              glyph={<GlyphSvg glyph={CALL_DEVICES_GLYPHS.pictureInPicture} size={20} />}
              onPress={pipActive ? requestCallPipExit : requestCallPip}
              tone="glass"
              prominent={prominent}
              size={44}
              data={{ 'data-call-pip': '' }}
            />
          ) : (
            <CallButton
              key={action}
              label={translate(language, 'call.conversation.header')}
              glyph={<GlyphSvg glyph={CALL_SCREEN_GLYPHS.chatCircleText} size={20} />}
              onPress={() => openConversation(call.conversationId)}
              tone="glass"
              prominent={prominent}
              size={44}
              data={{ 'data-call-conversation': '' }}
            />
          ),
        )}
      </div>
      {/* LA CAPSULE ENTRE ET SORT PAR UNE MISE À L'ÉCHELLE ANCRÉE À DROITE (P9.8, #17509) : celle que
          décide `call-header.ts` reste à sa place le temps de son départ, inerte, puis se démonte. */}
      <HeldSwap value={capsule} data-call-capsule="">
        {(held) => <CallQualityChip capsule={held} clock={clock} quality={call.quality} language={language} prominent={prominent} />}
      </HeldSwap>
    </div>
  );
}
