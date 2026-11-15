import { useId } from 'react';

import { paintUrl, safeUid, tokenVar } from '@/lib/game/materials';

import { PaintDefs } from './paint-defs';
import { SignatureGlyph } from './signature';

/**
 * L'OBJET DU SCEAU (#9386) — un médaillon d'or frappé de la Signature quand le
 * Sceau est possédé ET l'étape atteinte ; la silhouette en pointillé sinon.
 * Cosmétique : il ne change rien au jeu. DÉCORATIF : l'hôte dit l'état.
 */
export function SealMark({ owned, reached, size }: { readonly owned: boolean; readonly reached: boolean; readonly size: number }) {
  const uid = safeUid(useId());
  const lit = owned && reached;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false" data-game-seal-mark={lit ? 'lit' : 'dim'}>
      {lit ? (
        <>
          <defs>
            <PaintDefs uid={uid} paints={['gold']} />
          </defs>
          <circle cx="24" cy="24" r="20" fill={paintUrl(uid, 'gold')} stroke={tokenVar('edge')} strokeOpacity="0.3" />
          <SignatureGlyph cx={24} cy={24} size={26} color="var(--game-gold-ink)" mode="struck" strokeWidth={100} />
        </>
      ) : (
        <>
          <circle cx="24" cy="24" r="19" fill="none" stroke={tokenVar('ash')} strokeWidth="2" strokeDasharray="4 4" />
          <SignatureGlyph cx={24} cy={24} size={22} color={tokenVar('ash')} mode="flat" strokeWidth={90} />
        </>
      )}
    </svg>
  );
}
