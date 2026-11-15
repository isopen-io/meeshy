import type { ReactNode } from 'react';

/**
 * **LE BOUTON ROND DE L'APPEL ENTRANT ET DE L'ÉCRAN DE FIN** (#6382) — neutre,
 * il porte le verre d'appel comme tout bouton qui flotte seul (#8432) ;
 * Refuser est rouge, Accepter vert. Sa légende se lit sous lui ; son nom
 * accessible peut en dire plus (« Répondre sans vidéo » sous « Sans vidéo »).
 */

const INK = 'var(--color-on-media)';
const INK_2 = 'var(--color-on-media-3)';
const HANGUP = 'var(--ios-error-strong)';
const ANSWER = 'var(--ios-success)';

/* Refuser et Accepter gardent leur couleur de signal ; le neutre prend le verre d'appel. */
const SIGNAL_TONE = { danger: { background: HANGUP, color: INK }, accept: { background: ANSWER, color: INK } } as const;

export function RoundButton({
  label,
  glyph,
  onPress,
  tone = 'plain',
  size = 56,
  caption,
  popup = false,
  control,
  data,
}: {
  readonly label: string;
  readonly glyph: ReactNode;
  readonly onPress: () => void;
  readonly tone?: 'plain' | 'danger' | 'accept';
  readonly size?: number;
  readonly caption?: string;
  readonly popup?: boolean;
  readonly control?: string;
  /** Le nom par lequel un témoin, une capture ou un style le trouve. */
  readonly data?: Readonly<Record<`data-${string}`, string>>;
}) {
  const glass = tone === 'plain';
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        aria-label={label}
        {...(popup ? { 'aria-haspopup': 'dialog' as const } : {})}
        {...(control === undefined ? {} : { 'data-call-control': control })}
        {...data}
        onClick={onPress}
        className={`${glass ? 'glass-call ' : ''}grid place-items-center rounded-full transition-transform active:scale-95 motion-reduce:transition-none`}
        style={tone === 'plain' ? { width: size, height: size } : { width: size, height: size, ...SIGNAL_TONE[tone] }}
      >
        {glyph}
      </button>
      {caption === undefined ? null : (
        <span className="text-mini" style={{ color: INK_2 }}>
          {caption}
        </span>
      )}
    </div>
  );
}

