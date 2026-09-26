import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { Avatar } from '@/components/avatar';
import { StreamVideo } from '@/components/call-media-elements';
import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import type { CallMember } from '@/lib/calls/call-store';
import { gridColumns, hasVideo, spotlight } from '@/lib/calls/call-view';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';

/**
 * **LA GRILLE D'UN APPEL DE GROUPE** (#3721, parité I2 / I3) — une tuile par
 * participant, la sienne en dernier. Toucher une tuile la met en avant (la
 * scène), les autres passent en bandeau ; toucher la scène rend la grille.
 * Sur la scène, qui modère la conversation trouve « Retirer de l'appel ».
 */

const INK = '#ffffff';
const TILE = 'rgba(255,255,255,0.06)';
const LABEL = 'rgba(0,0,0,0.45)';
const DANGER = '#ef4444';

export function Portrait({ name, avatar, size, pulse }: { readonly name: string; readonly avatar: string | null; readonly size: number; readonly pulse: boolean }) {
  return (
    <div className="relative grid place-items-center" style={{ width: size + 24, height: size + 24 }}>
      {pulse ? <span aria-hidden className="absolute inset-0 animate-ping rounded-full" style={{ background: 'rgba(255,255,255,0.10)' }} /> : null}
      <Avatar initials={initialsOf(name)} color={colorForName(name)} size={size} {...(avatar === null ? {} : { src: avatar })} />
    </div>
  );
}

export type CallRemoval = {
  readonly canRemove: (userId: string) => boolean;
  readonly remove: (userId: string) => void;
  readonly failed: boolean;
};

export type CallGridProps = {
  readonly members: readonly CallMember[];
  readonly remoteStreams: Readonly<Record<string, MediaStream>>;
  readonly self: { readonly stream: MediaStream | null; readonly cameraOn: boolean; readonly mirrored: boolean };
  readonly featuredId: string | null;
  readonly onFeature: (userId: string | null) => void;
  readonly removal: CallRemoval | null;
  readonly language: InterfaceLanguage;
};

function Tile({
  member,
  stream,
  language,
  onPress,
  label,
  portrait,
}: {
  readonly member: CallMember;
  readonly stream: MediaStream | undefined;
  readonly language: InterfaceLanguage;
  readonly onPress: () => void;
  readonly label: string;
  readonly portrait: number;
}) {
  const showVideo = member.cameraOn && hasVideo(stream);
  return (
    <button type="button" aria-label={label} onClick={onPress} className="relative grid min-h-0 place-items-center overflow-hidden rounded-card" style={{ background: TILE }} data-call-tile={member.userId}>
      {showVideo ? <StreamVideo stream={stream ?? null} mirrored={false} className="absolute inset-0 size-full" label={member.name} /> : <Portrait name={member.name} avatar={member.avatar} size={portrait} pulse={false} />}
      <span className="absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1 truncate rounded-full px-2 py-0.5 text-mini" style={{ background: LABEL, color: INK }}>
        {member.micMuted ? <GlyphSvg glyph={CALL_SCREEN_GLYPHS.microphoneSlash} size={12} /> : null}
        {member.name}
        {member.link === 'connected' ? null : ` · ${translate(language, member.link === 'reconnecting' ? 'call.reconnecting' : 'call.connecting')}`}
      </span>
    </button>
  );
}

function SelfTile({ self, language, portrait }: { readonly self: CallGridProps['self']; readonly language: InterfaceLanguage; readonly portrait: number }) {
  const you = translate(language, 'call.you');
  return (
    <div className="relative grid min-h-0 place-items-center overflow-hidden rounded-card" style={{ background: TILE }} data-call-tile-self="">
      {self.cameraOn ? <StreamVideo stream={self.stream} mirrored={self.mirrored} className="absolute inset-0 size-full" label={you} /> : <Portrait name={you} avatar={null} size={portrait} pulse={false} />}
      <span className="absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-mini" style={{ background: LABEL, color: INK }}>
        {you}
      </span>
    </div>
  );
}

export function CallGrid({ members, remoteStreams, self, featuredId, onFeature, removal, language }: CallGridProps) {
  const feature = (member: CallMember) => () => onFeature(member.userId);
  const featureLabel = (member: CallMember) => translate(language, 'call.spotlight.show', { name: member.name });
  const view = spotlight(members, featuredId);

  if (view === null) {
    const columns = gridColumns(members.length + 1);
    return (
      <div className="grid min-h-0 flex-1 gap-2 px-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoRows: '1fr' }}>
        {members.map((member) => (
          <Tile key={member.userId} member={member} stream={remoteStreams[member.userId]} language={language} onPress={feature(member)} label={featureLabel(member)} portrait={64} />
        ))}
        <SelfTile self={self} language={language} portrait={64} />
      </div>
    );
  }

  const { featured, others } = view;
  const removable = removal !== null && removal.canRemove(featured.userId);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-3" data-call-spotlight={featured.userId}>
      <div className="relative flex min-h-0 flex-1">
        <div className="grid min-h-0 flex-1">
          <Tile member={featured} stream={remoteStreams[featured.userId]} language={language} onPress={() => onFeature(null)} label={translate(language, 'call.spotlight.back')} portrait={96} />
        </div>
        {removable ? (
          <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
            <button type="button" onClick={() => removal.remove(featured.userId)} className="rounded-full px-3 py-1.5 text-mini font-semibold" style={{ background: DANGER, color: INK }} data-call-remove={featured.userId}>
              {translate(language, 'call.remove.named', { name: featured.name })}
            </button>
            {removal.failed ? (
              <span role="alert" className="rounded-full px-2 py-0.5 text-mini" style={{ background: LABEL, color: INK }}>
                {translate(language, 'call.remove.failed')}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="grid h-28 shrink-0 auto-cols-[7rem] grid-flow-col gap-2 overflow-x-auto" data-call-strip="">
        {others.map((member) => (
          <Tile key={member.userId} member={member} stream={remoteStreams[member.userId]} language={language} onPress={feature(member)} label={featureLabel(member)} portrait={40} />
        ))}
        <SelfTile self={self} language={language} portrait={40} />
      </div>
    </div>
  );
}
