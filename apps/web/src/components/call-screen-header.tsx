import { useEffect, useState } from 'react';

import { CallButton } from '@/components/call-glass-button';
import { CallQualityChip } from '@/components/call-quality';
import { GlyphSvg } from '@/components/glyph';
import { CALL_DEVICES_GLYPHS } from '@/components/glyphs-call-devices';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { callActions } from '@/lib/calls/call-actions';
import { browserPipSupport, requestCallPip, shouldOfferPip } from '@/lib/calls/call-pip';
import { elapsedSeconds, formatCallClock, type ActiveCall } from '@/lib/calls/call-store';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { href, navigate } from '@/routes/route-table';

/**
 * **L'EN-TÊTE DE L'ÉCRAN D'APPEL** (#8046, #8391, #8436) — à gauche, Réduire,
 * puis « Conversation » (le SEUL chemin vers la conversation de l'appel : il
 * réduit l'appel et ouvre le fil), puis, là où une vidéo peut flotter, l'image
 * dans l'image ; à droite, la puce « Nom ·
 * durée » et ses barres de qualité, qui ouvre le détail au toucher. Les
 * réglages d'appareils ont rejoint « Sortie » dans la pilule, Enregistrer le
 * rail de l'appel. Chaque bouton flotte seul : il porte son verre.
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

export function CallScreenHeader({ call, language, joined, prominent }: HeaderProps) {
  const live = call.phase.kind !== 'ended' && call.phase.kind !== 'incoming';
  const ticking = useCallClock(call, live && joined);
  const clock = joined ? ticking : null;
  if (!live) return <div className="min-h-11" />;
  const offerPip = shouldOfferPip(call, browserPipSupport());
  return (
    <div className="flex min-h-11 items-center justify-between gap-2 px-4" data-call-header="">
      <div className="flex shrink-0 items-center gap-2">
        <CallButton label={translate(language, 'call.minimize')} glyph={<GlyphSvg glyph={CALL_SCREEN_GLYPHS.arrowsInSimple} size={20} />} onPress={callActions.minimize} tone="glass" prominent={prominent} size={44} />
        {call.conversationId === '' ? null : (
          <CallButton
            label={translate(language, 'call.conversation.open')}
            glyph={<GlyphSvg glyph={CALL_SCREEN_GLYPHS.chatCircleText} size={20} />}
            onPress={() => openConversation(call.conversationId)}
            tone="glass"
            prominent={prominent}
            size={44}
            data={{ 'data-call-conversation': '' }}
          />
        )}
        {offerPip ? (
          <CallButton
            label={translate(language, 'call.pip.enter')}
            glyph={<GlyphSvg glyph={CALL_DEVICES_GLYPHS.pictureInPicture} size={20} />}
            onPress={requestCallPip}
            tone="glass"
            prominent={prominent}
            size={44}
            data={{ 'data-call-pip': '' }}
          />
        ) : null}
      </div>
      {clock === null ? null : <CallQualityChip title={call.title} clock={clock} quality={call.quality} language={language} prominent={prominent} />}
    </div>
  );
}
