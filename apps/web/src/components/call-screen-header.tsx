import { CallButton } from '@/components/call-glass-button';
import { CallQualityChip } from '@/components/call-quality';
import { GlyphSvg } from '@/components/glyph';
import { CALL_DEVICES_GLYPHS } from '@/components/glyphs-call-devices';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { callActions } from '@/lib/calls/call-actions';
import { browserPipSupport, requestCallPip, shouldOfferPip } from '@/lib/calls/call-pip';
import type { ActiveCall } from '@/lib/calls/call-store';
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
 */

function openConversation(conversationId: string): void {
  callActions.minimize();
  navigate(href('thread', { conversation: conversationId }));
}

type HeaderProps = {
  readonly call: ActiveCall;
  readonly language: InterfaceLanguage;
  readonly clock: string | null;
  readonly prominent: boolean;
};

export function CallScreenHeader({ call, language, clock, prominent }: HeaderProps) {
  const live = call.phase.kind !== 'ended' && call.phase.kind !== 'incoming';
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
