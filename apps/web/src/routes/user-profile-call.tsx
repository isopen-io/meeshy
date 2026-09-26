import { memo, useCallback, useState } from 'react';

import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALLS_GLYPHS } from '@/components/glyphs-calls';
import { createDirectConversation } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import { callActions } from '@/lib/calls/call-actions';
import { startCallWithPerson, type CallPerson } from '@/lib/calls/call-starter';
import type { CallMedia } from '@/lib/calls/call-store';
import { primeTones } from '@/lib/calls/call-tones';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **APPELER DEPUIS UNE FICHE** (A7) — la fiche `/u/:username` a une PERSONNE,
 * pas une conversation : le direct s'ouvre (ou se retrouve) puis l'appel part
 * dedans, par la même règle que le pavé (`startCallWithPerson`, miroir
 * `CallStarter.swift`). La rangée n'est montrée qu'à un lecteur connecté,
 * jamais sur sa propre fiche ni sur un compte bloqué — l'hôte en décide.
 */

const BRAND = 'var(--color-ios-brand)';

export const ProfileCallButtons = memo(function ProfileCallButtons({
  language,
  name,
  disabled,
  onCall,
}: {
  readonly language: InterfaceLanguage;
  readonly name: string;
  readonly disabled: boolean;
  readonly onCall: (media: CallMedia) => void;
}) {
  return (
    <div data-profile-call className="flex gap-2">
      {(['audio', 'video'] as const).map((media) => (
        <button
          key={media}
          type="button"
          data-profile-call-media={media}
          disabled={disabled}
          aria-label={translate(language, media === 'video' ? 'keypad.call.video.named' : 'keypad.call.audio.named', { name })}
          onClick={() => onCall(media)}
          className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-card px-3 text-body font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
          style={{ backgroundColor: 'var(--ios-indigo-600)', outlineColor: BRAND }}
        >
          {media === 'video' ? <GlyphSvg glyph={CALLS_GLYPHS.videoCamera} size={18} /> : <Glyph name="phone" size={18} />}
          <span aria-hidden="true">{translate(language, media === 'video' ? 'call.action.video' : 'call.action.audio')}</span>
        </button>
      ))}
    </div>
  );
});

export function ProfileCall({
  language,
  person,
  online,
  onFailed,
}: {
  readonly language: InterfaceLanguage;
  readonly person: CallPerson;
  readonly online: boolean;
  readonly onFailed: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const onCall = useCallback(
    (media: CallMedia) => {
      setPending(true);
      void startCallWithPerson({
        person,
        media,
        prime: primeTones,
        openDirect: async (participantId) => {
          const opened = await createDirectConversation(apiDeps, participantId);
          return opened.ok ? { ok: true, data: { id: opened.data.id } } : opened;
        },
        start: callActions.start,
      }).then((outcome) => {
        setPending(false);
        if (!outcome.ok) onFailed(translate(language, 'keypad.call.failed'));
      });
    },
    [language, onFailed, person],
  );
  return <ProfileCallButtons language={language} name={person.name} disabled={pending || !online} onCall={onCall} />;
}
