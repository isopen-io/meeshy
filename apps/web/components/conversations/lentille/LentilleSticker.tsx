/**
 * `LentilleSticker` — en-tête de section sticky (WL-103, LWS-10).
 *
 * `position: sticky` (pas de portail ni de mesure JS), cotes par les tokens
 * (§4.3 : `10.5` poids `800`, `letter-spacing .1em`, majuscules, padding
 * `4/13`, jamais en dur — garde R15).
 *
 * `aria-hidden="true"` — l'information de section vit dans l'ORDRE du DOM
 * (chaque rang suit son sticker, un lecteur d'écran linéaire la restitue
 * sans qu'un en-tête décoratif la répète). Contrat LWS-10, critère
 * d'acceptation : « pilule et stickers `aria-hidden` ».
 */
'use client';

export interface LentilleStickerProps {
  readonly label: string;
}

export function LentilleSticker({ label }: LentilleStickerProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="lentille-sticker"
      className="sticky top-0 z-10 uppercase text-muted-foreground bg-card/95 backdrop-blur-sm"
      style={{
        fontSize: 'var(--lentille-list-sticker-size)',
        fontWeight: 'var(--lentille-list-sticker-weight)',
        letterSpacing: 'var(--lentille-list-sticker-letter-spacing)',
        padding: 'var(--lentille-list-sticker-padding-vertical) var(--lentille-list-sticker-padding-horizontal)',
      }}
    >
      {label}
    </div>
  );
}

export default LentilleSticker;
