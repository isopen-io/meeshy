import type { ReactNode } from 'react';

import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { PeerAvatar } from '@/components/peer-avatar';
import { initialsOf } from '@/lib/view/conversation';

/**
 * LE PORTRAIT D'UNE PERSONNE DANS L'APPEL — et sa présence SERVIE (#10956,
 * D-60 levée par #10955) : `presenceKey` est REQUIS, même `undefined` (mon
 * portrait, un groupe), pour que chaque hôte DISE de qui il s'agit.
 */
export function Portrait({ name, avatar, size, pulse, presenceKey, tint, children }: { readonly name: string; readonly avatar: string | null; readonly size: number; readonly pulse: boolean; readonly presenceKey: string | undefined; readonly tint?: string | undefined; readonly children?: ReactNode }) {
  return (
    <div className="relative grid place-items-center" style={{ width: size + 24, height: size + 24 }}>
      {pulse ? <span aria-hidden className="absolute inset-0 animate-ping rounded-full motion-reduce:animate-none" style={{ background: 'var(--color-media-fill)' }} /> : null}
      {children}
      <PeerAvatar presenceKey={presenceKey} initials={initialsOf(name)} color={tint ?? colorForName(name)} size={size} {...(avatar === null ? {} : { src: avatar })} />
    </div>
  );
}
