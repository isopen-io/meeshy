import type { InterfaceCatalogKey } from '@/lib/i18n-catalog';

import { type ActiveCall, type CallEndReason, type CallMember } from './call-store';

/**
 * **CE QUE L'ÉCRAN D'APPEL DIT** (#6382) — les règles d'affichage de
 * `CallView.swift`, sans DOM : le libellé d'état, le motif de fin, la
 * disposition, les pastilles d'état. L'écran les lit, les témoins aussi.
 */

/** Les libellés d'appel SANS paramètre — ceux qu'un état choisit. */
export type PlainCallKey = Exclude<Extract<InterfaceCatalogKey, `call.${string}`>, 'call.incoming.group' | 'call.waiting.from' | 'call.members' | 'call.a11y.screen' | 'call.callBack.named' | 'call.spotlight.show' | 'call.remove.named'>;

export const END_REASON_KEY: Readonly<Record<CallEndReason, PlainCallKey>> = {
  local: 'call.ended.local',
  remote: 'call.ended.remote',
  rejected: 'call.ended.rejected',
  missed: 'call.ended.missed',
  busy: 'call.ended.busy',
  connectionLost: 'call.ended.connectionLost',
  failed: 'call.ended.failed',
  permission: 'call.ended.permission',
  removed: 'call.ended.removed',
};

/** Le libellé sous le nom — `nil` une fois connecté : c'est la durée qui parle. */
export function callStatusKey(call: Pick<ActiveCall, 'phase' | 'media' | 'callId' | 'direction'>): PlainCallKey | null {
  switch (call.phase.kind) {
    case 'incoming':
      return call.media === 'video' ? 'call.incoming.title.video' : 'call.incoming.title.audio';
    case 'outgoing':
      return call.callId === null ? 'call.outgoing.ringing' : 'call.outgoing.waiting';
    case 'connecting':
      return 'call.connecting';
    case 'reconnecting':
      return 'call.reconnecting';
    case 'ended':
      return END_REASON_KEY[call.phase.reason];
    case 'connected':
      return null;
  }
}

/** « Réessayer » d'iOS : après un échec passager ou une absence de réponse, jamais après un raccroché. */
export function canRetry(call: Pick<ActiveCall, 'phase' | 'direction'>): boolean {
  if (call.phase.kind !== 'ended' || call.direction !== 'outgoing') return false;
  const reason = call.phase.reason;
  return reason === 'failed' || reason === 'connectionLost' || reason === 'missed' || reason === 'busy';
}

export type CallLayout = 'portrait' | 'video-duo' | 'grid';

/**
 * La disposition connectée : un appel direct dont au moins une caméra tourne
 * passe en vidéo plein cadre avec la vignette locale ; un groupe à plus d'un
 * pair est une grille ; le reste est le portrait audio d'iOS.
 */
export function callLayout(call: Pick<ActiveCall, 'members' | 'cameraOn' | 'remoteStreams' | 'isGroup'>): CallLayout {
  const members = Object.values(call.members);
  if (call.isGroup && members.length > 1) return 'grid';
  const remoteVideo = members.some((member) => member.cameraOn && hasVideo(call.remoteStreams[member.userId]));
  return call.cameraOn || remoteVideo ? 'video-duo' : 'portrait';
}

export function hasVideo(stream: MediaStream | undefined | null): boolean {
  return stream !== undefined && stream !== null && stream.getVideoTracks().some((track) => track.readyState !== 'ended');
}

export type StatusPill = 'mic-muted' | 'peer-muted' | 'poor-network';

export const STATUS_PILL_KEY: Readonly<Record<StatusPill, PlainCallKey>> = {
  'mic-muted': 'call.mic.muted',
  'peer-muted': 'call.peer.muted',
  'poor-network': 'call.quality.poor',
};

/** Les pastilles de `CallView.swift` que le web sait dire. */
export function statusPills(call: Pick<ActiveCall, 'micMuted' | 'members' | 'quality' | 'isGroup'>): readonly StatusPill[] {
  const members = Object.values(call.members);
  const peerMuted = !call.isGroup && members.length === 1 && members[0]?.micMuted === true;
  return [
    ...(call.micMuted ? (['mic-muted'] as const) : []),
    ...(peerMuted ? (['peer-muted'] as const) : []),
    ...(call.quality === 'poor' ? (['poor-network'] as const) : []),
  ];
}

/** L'ordre des tuiles d'une grille : les pairs connectés d'abord, par nom. */
export function orderedMembers(members: Readonly<Record<string, CallMember>>): readonly CallMember[] {
  const rank = (member: CallMember): number => (member.link === 'connected' ? 0 : member.link === 'reconnecting' ? 1 : 2);
  return Object.values(members).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** La mise en avant d'un participant — `null` rend la grille, y compris quand le participant choisi est parti. */
export function spotlight(members: readonly CallMember[], featuredId: string | null): { readonly featured: CallMember; readonly others: readonly CallMember[] } | null {
  const featured = members.find((member) => member.userId === featuredId);
  return featured === undefined ? null : { featured, others: members.filter((member) => member !== featured) };
}

/** Colonnes d'une grille de `count` tuiles (soi compris). */
export function gridColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  return 3;
}
