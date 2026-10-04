import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, SyntheticEvent } from 'react';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { flag } from '@/lib/languages';
import { spokenLanguageName } from '@/lib/view/language-name';
import type { AudioOnDemandNotice } from '@/lib/view/use-audio-on-demand';

import { Glyph } from './glyph';

/**
 * LES DEUX DEMANDES DE LA PAGE AUDIO (#9256) — « Transcrire » sous
 * « Aucune transcription », et « Traduire », qui déplie les langues qu'on
 * peut demander : miroir de `transcriptionEmptyState` et de la feuille de
 * traduction d'`AudioFullscreenView` iOS. Extraites de `viewer-audio-page.tsx`
 * pour le garder sous budget ; l'état vit dans `useAudioOnDemand`.
 *
 * Comme les autres commandes de la page, elles COUPENT leurs événements : un
 * toucher n'y bascule pas le plateau, Espace y active le bouton sous le focus.
 */
const contain = (event: SyntheticEvent): void => event.stopPropagation();

const containKeys = (event: ReactKeyboardEvent): void => {
  if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
};

const actionStyle: CSSProperties = {
  minHeight: 44,
  backgroundColor: 'color-mix(in srgb, var(--accent) 70%, transparent)',
};

const chipStyle = (pending: boolean): CSSProperties => ({
  minHeight: 44,
  backgroundColor: 'color-mix(in srgb, var(--color-on-media) 10%, transparent)',
  opacity: pending ? 0.6 : 0.85,
});

export function TranscribeAction({ language, busy, onTranscribe }: { readonly language: InterfaceLanguage; readonly busy: boolean; readonly onTranscribe: () => void }) {
  return (
    <button
      type="button"
      data-viewer-audio-transcribe
      aria-busy={busy}
      disabled={busy}
      className="mx-auto flex items-center gap-2 rounded-full px-4 text-check font-bold"
      style={actionStyle}
      onClick={(event) => {
        contain(event);
        onTranscribe();
      }}
      onPointerDown={contain}
      onKeyDown={containKeys}
    >
      <Glyph name="microphone" size={16} />
      <span>{translate(language, busy ? 'media.audio.transcribing' : 'media.audio.transcribe')}</span>
    </button>
  );
}

export function TranslateOffers({
  language,
  offers,
  pending,
  expanded,
  onToggle,
  onRequest,
}: {
  readonly language: InterfaceLanguage;
  readonly offers: readonly string[];
  readonly pending: readonly string[];
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly onRequest: (code: string) => void;
}) {
  if (offers.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-2" onClick={contain} onPointerDown={contain} onKeyDown={containKeys}>
      <button
        type="button"
        data-viewer-audio-translate
        aria-expanded={expanded}
        className="flex items-center gap-1 rounded-full px-3 text-mini font-semibold"
        style={chipStyle(false)}
        onClick={onToggle}
      >
        <Glyph name="translate" size={16} />
        <span>{translate(language, 'media.audio.translate')}</span>
      </button>
      {expanded ? (
        <div role="group" aria-label={translate(language, 'media.audio.translate')} className="flex flex-wrap justify-center gap-2">
          {offers.map((code) => {
            const isPending = pending.includes(code);
            const name = spokenLanguageName(code);
            return (
              <button
                key={code}
                type="button"
                lang={code}
                data-viewer-audio-translate-to={code}
                aria-busy={isPending}
                aria-label={translate(language, 'media.audio.translate_to', { language: name })}
                className="flex items-center gap-1 rounded-full px-3 text-mini font-semibold"
                style={chipStyle(isPending)}
                onClick={() => onRequest(code)}
              >
                <span aria-hidden>{flag(code)}</span>
                <span>{isPending ? translate(language, 'media.audio.translating') : name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function OnDemandNotice({ language, notice }: { readonly language: InterfaceLanguage; readonly notice: AudioOnDemandNotice | null }) {
  return (
    <p role="status" className="text-center text-mini opacity-80" {...(notice !== null ? { 'data-viewer-audio-notice': true } : {})}>
      {notice !== null ? translate(language, notice) : null}
    </p>
  );
}
