import { RoundButton } from '@/components/call-round-button';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { FLOATING_GLYPHS } from '@/components/glyphs-floating';
import { callActions } from '@/lib/calls/call-actions';
import type { ActiveCall } from '@/lib/calls/call-store';
import { canRetry } from '@/lib/calls/call-view';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { appSettingsOpener } from '@/lib/view/settings-recovery';

/**
 * **LES RÉPONSES DE L'ÉCRAN DE FIN** (#6382) — Fermer, Réessayer quand l'appel
 * peut être recomposé, et, sur un refus définitif du micro, les réglages de
 * l'app (#9033, comme le composeur #8882) : dans la coque Android, il ne se
 * redemande plus. Chargées à part (#17650) : un appel qui vit ne les paie pas,
 * et l'écran les précharge quand le navigateur souffle.
 */
export function CallEndedControls({ call, language }: { readonly call: ActiveCall; readonly language: InterfaceLanguage }) {
  const openAppSettings = appSettingsOpener();
  return (
    <div className="flex items-start justify-center gap-10 px-8" data-call-ended-controls="">
      <RoundButton label={translate(language, 'call.close')} caption={translate(language, 'call.close')} size={60} glyph={<GlyphSvg glyph={CALL_SCREEN_GLYPHS.arrowsInSimple} size={24} />} onPress={callActions.dismiss} />
      {canRetry(call) ? <RoundButton label={translate(language, 'call.retry')} caption={translate(language, 'call.retry')} tone="accept" size={60} glyph={<Glyph name="phone" size={26} />} onPress={callActions.retry} /> : null}
      {call.phase.kind === 'ended' && call.phase.reason === 'permission' && openAppSettings !== null ? (
        <RoundButton label={translate(language, 'call.openSettings')} caption={translate(language, 'call.openSettings')} size={60} glyph={<GlyphSvg glyph={FLOATING_GLYPHS.gear} size={24} />} onPress={openAppSettings} />
      ) : null}
    </div>
  );
}
