import { useDecodedSwap, type ImageDecode } from '@/lib/media/decoded-swap';
import type { StudioFloor } from '@/lib/stories/studio-floor';

/**
 * **LE SOL** — peint SOUS tout le reste, sur l'écran entier : la carte se
 * pose dessus, la barre haute et le socle flottent au-dessus. Une image
 * basse résolution étirée ne tient que floutée ; le voile sombre garde le
 * verre des contrôles lisible sur un sol clair.
 *
 * CHARGÉ À LA DEMANDE (#8534) : il n'existe qu'avec un média posé, et sa
 * bascule décodée ne pèse pas sur le chunk du studio.
 */
const isTint = (floor: StudioFloor): boolean => floor.kind === 'tint';

export function StudioFloorLayer({ floor, decode }: { readonly floor: StudioFloor | null; readonly decode?: ImageDecode }) {
  // LA BASCULE IMPERCEPTIBLE (#8534) : l'image locale floutée ne cède la place
  // au thumbhash qu'une fois celui-ci DÉCODÉ, et reste dessous le temps d'un fondu.
  // Une TEINTE (Cadre) n'a rien à décoder : elle passe aussitôt.
  const { shown, leaving } = useDecodedSwap(floor, decode, isTint);
  if (shown === null) return null;
  if (shown.kind === 'tint') {
    return <span aria-hidden="true" data-story-studio-floor="tint" className="pointer-events-none absolute inset-0 block" style={{ backgroundColor: shown.src }} />;
  }
  return (
    <span aria-hidden="true" data-story-studio-floor={shown.kind} className="pointer-events-none absolute inset-0 block overflow-hidden">
      {[...(leaving !== null && leaving.kind !== 'tint' && leaving.src !== shown.src ? [leaving] : []), shown].map((layer) => (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img
          key={layer.src}
          src={layer.src}
          alt=""
          aria-hidden="true"
          className={`absolute inset-0 size-full object-cover ${layer === shown && leaving !== null ? 'studio-floor-in' : ''}`}
          style={{ filter: layer.kind === 'hash' ? 'blur(18px)' : 'blur(36px) saturate(1.2)', transform: 'scale(1.2)' }}
        />
      ))}
      <span className="absolute inset-0 block" style={{ backgroundColor: 'rgba(0,0,0,0.28)' }} />
    </span>
  );
}
