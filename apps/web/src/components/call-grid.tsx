import { useId, type ReactNode } from 'react';

import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { Avatar } from '@/components/avatar';
import { CallButton } from '@/components/call-glass-button';
import { CallModerationSlot } from '@/components/call-control-slots';
import { StreamVideo } from '@/components/call-media-elements';
import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { SELF_SPEAKER_COLOR, speakerColor } from '@/lib/calls/call-speaker-color';
import type { CallModeration } from '@/lib/calls/call-moderation';
import { autoSharer, chooseGrid, chooseMember, chooseSelf, resolveSpotlight, type SpotlightChoice } from '@/lib/calls/call-spotlight';
import type { CallMember } from '@/lib/calls/call-store';
import { gridColumns, hasVideo } from '@/lib/calls/call-view';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';

import { useScreenZoom } from './use-screen-zoom';

/**
 * **LA GRILLE D'UN APPEL DE GROUPE** (#3721, #8392, #8393) — une tuile par
 * participant, la sienne en dernier, chacune bordée de la couleur STABLE de sa
 * personne (celle de son nom dans les sous-titres). Toucher une tuile la met à
 * la une, les autres passent en bandeau ; « Grille » rend la grille.
 *
 * Dès qu'un membre partage son écran, son ÉCRAN monte seul à la une, affiché
 * ENTIER (`contain` : rogner un écran en cache le texte), son portrait en
 * médaillon, sous « Écran de X ». Un choix manuel l'emporte ; la règle vit dans
 * `lib/calls/call-spotlight.ts`, le choix reste local. Le plein écran s'offre
 * sur toute tuile à la une (#9098). MA tuile passe à la une comme les autres,
 * les commandes de ma caméra en haut au centre (comme iOS), et porte mon
 * micro coupé ; un écran partagé à la une se ZOOME — pincer, Ctrl + molette,
 * double toucher pour le revoir entier (`use-screen-zoom.ts`). Pendant un
 * partage, les caméras des autres restent en rail sous l'écran (#9112).
 * Qui MODÈRE l'appel trouve sur chaque tuile d'un pair
 * (et sur la une) le menu « Couper le micro » · « Retirer de l'appel » (#8438) ;
 * une personne invitée sonne dans sa tuile, portrait pulsé (#8433).
 */

const TILE = 'var(--color-media-fill)';

export function Portrait({ name, avatar, size, pulse }: { readonly name: string; readonly avatar: string | null; readonly size: number; readonly pulse: boolean }) {
  return (
    <div className="relative grid place-items-center" style={{ width: size + 24, height: size + 24 }}>
      {pulse ? <span aria-hidden className="absolute inset-0 animate-ping rounded-full motion-reduce:animate-none" style={{ background: 'var(--color-media-fill)' }} /> : null}
      <Avatar initials={initialsOf(name)} color={colorForName(name)} size={size} {...(avatar === null ? {} : { src: avatar })} />
    </div>
  );
}

export type CallGridProps = {
  readonly members: readonly CallMember[];
  readonly remoteStreams: Readonly<Record<string, MediaStream>>;
  readonly self: { readonly stream: MediaStream | null; readonly cameraOn: boolean; readonly mirrored: boolean; readonly micMuted: boolean };
  /** Les commandes de ma caméra, posées en haut au centre quand MA tuile est à la une. */
  readonly selfControls?: ReactNode;
  readonly choice: SpotlightChoice;
  readonly onChoose: (choice: SpotlightChoice) => void;
  /** Le plein écran de la tuile à la une : le bandeau et tout le reste s'effacent. */
  readonly immersive: boolean;
  readonly onToggleImmersive: () => void;
  readonly moderation: CallModeration | null;
  readonly language: InterfaceLanguage;
};

function NameLabel({ name, muted, suffix }: { readonly name: string; readonly muted: boolean; readonly suffix: string | null }) {
  return (
    <span className="glass-call absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1 truncate rounded-full px-2 py-0.5 text-mini">
      {muted ? (
        <span className="contents" data-call-tile-muted="">
          <GlyphSvg glyph={CALL_SCREEN_GLYPHS.microphoneSlash} size={12} />
        </span>
      ) : null}
      {name}
      {suffix === null ? null : ` · ${suffix}`}
    </span>
  );
}

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
  readonly onPress: (() => void) | null;
  readonly label: string;
  readonly portrait: number;
}) {
  const showVideo = member.cameraOn && hasVideo(stream);
  const ringing = member.link === 'ringing';
  const link = member.link === 'connected' ? null : ringing ? translateCallControls(language, 'callControls.ringing') : translate(language, member.link === 'reconnecting' ? 'call.reconnecting' : 'call.connecting');
  const body = (
    <>
      {showVideo ? <StreamVideo stream={stream ?? null} mirrored={false} className="absolute inset-0 size-full" label={member.name} member={member.userId} /> : <Portrait name={member.name} avatar={member.avatar} size={portrait} pulse={ringing} />}
      <NameLabel name={member.name} muted={member.micMuted} suffix={link} />
    </>
  );
  const frame = { background: TILE, borderColor: speakerColor(member.userId) };
  const className = 'relative grid min-h-0 place-items-center overflow-hidden rounded-card border-2';
  const ring = ringing ? { 'data-call-ringing': '' } : {};
  return onPress === null || ringing ? (
    <div className={className} style={frame} data-call-tile={member.userId} {...ring}>
      {body}
    </div>
  ) : (
    <button type="button" aria-label={label} onClick={onPress} className={className} style={frame} data-call-tile={member.userId}>
      {body}
    </button>
  );
}

/** Une tuile de pair, et, pour qui modère, son menu posé à côté — jamais DANS le bouton de la tuile. */
function PeerTile(props: Parameters<typeof Tile>[0] & { readonly moderation: CallModeration | null; readonly menu: boolean }) {
  const { moderation, menu, ...tile } = props;
  const moderated = menu && moderation !== null && moderation.canModerate(tile.member.userId);
  return (
    <div className="relative grid min-h-0">
      <Tile {...tile} />
      {moderated ? (
        <div className="absolute right-1.5 top-1.5 z-10" data-call-chrome-fade="">
          <CallModerationSlot member={tile.member} language={tile.language} moderation={moderation} />
        </div>
      ) : null}
    </div>
  );
}

function SelfTile({ self, language, portrait, onPress }: { readonly self: CallGridProps['self']; readonly language: InterfaceLanguage; readonly portrait: number; readonly onPress: (() => void) | null }) {
  const you = translate(language, 'call.you');
  const className = 'relative grid min-h-0 place-items-center overflow-hidden rounded-card border-2';
  const frame = { background: TILE, borderColor: SELF_SPEAKER_COLOR };
  const body = (
    <>
      {self.cameraOn ? <StreamVideo stream={self.stream} mirrored={self.mirrored} className="absolute inset-0 size-full" label={you} self /> : <Portrait name={you} avatar={null} size={portrait} pulse={false} />}
      <NameLabel name={you} muted={self.micMuted} suffix={null} />
    </>
  );
  return onPress === null ? (
    <div className={className} style={frame} data-call-tile-self="">
      {body}
    </div>
  ) : (
    <button type="button" aria-label={translateCallControls(language, 'callControls.spotlight.self')} onClick={onPress} className={className} style={frame} data-call-tile-self="">
      {body}
    </button>
  );
}

function SharedScreen({ member, stream, language }: { readonly member: CallMember; readonly stream: MediaStream | undefined; readonly language: InterfaceLanguage }) {
  const title = translate(language, 'call.screen.of', { name: member.name });
  const { zoom, pinching, handlers } = useScreenZoom();
  const hint = useId();
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-card" style={{ touchAction: 'none' }} aria-describedby={hint} data-call-shared-screen="" data-call-screen-zoom={String(zoom)} {...handlers}>
      <div className={`absolute inset-0 ${pinching ? '' : 'transition-transform duration-200 motion-reduce:transition-none'}`} style={zoom === 1 ? undefined : { transform: `scale(${zoom})` }}>
        <StreamVideo stream={stream ?? null} mirrored={false} fit="contain" className="absolute inset-0 size-full" label={title} member={member.userId} />
      </div>
      <span id={hint} hidden>
        {translateCallControls(language, 'callControls.screenZoom.hint')}
      </span>
      <div className="absolute bottom-2 right-2 overflow-hidden rounded-full border-2" style={{ borderColor: speakerColor(member.userId) }} data-call-screen-medallion="">
        <Avatar initials={initialsOf(member.name)} color={colorForName(member.name)} size={44} {...(member.avatar === null ? {} : { src: member.avatar })} />
      </div>
      <span className="glass-call-prominent absolute bottom-2 left-2 max-w-[70%] truncate rounded-full px-3 py-1 text-mini font-semibold" role="status" data-call-screen-banner="">
        {title}
      </span>
    </div>
  );
}

export function CallGrid({ members, remoteStreams, self, selfControls = null, choice, onChoose, immersive, onToggleImmersive, moderation, language }: CallGridProps) {
  const featureSelf = () => onChoose(chooseSelf());
  const feature = (member: CallMember) => () => onChoose(chooseMember(member.userId));
  const featureLabel = (member: CallMember) => translate(language, 'call.spotlight.show', { name: member.name });
  const view = resolveSpotlight({ members, choice, remoteStreams });

  if (view === null) {
    const columns = gridColumns(members.length + 1);
    return (
      <div className="grid min-h-0 flex-1 gap-2 px-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoRows: '1fr' }}>
        {members.map((member) => (
          <PeerTile key={member.userId} member={member} stream={remoteStreams[member.userId]} language={language} onPress={feature(member)} label={featureLabel(member)} portrait={64} moderation={moderation} menu />
        ))}
        <SelfTile self={self} language={language} portrait={64} onPress={featureSelf} />
      </div>
    );
  }

  const { featured, others, screen } = view;
  const moderated = featured !== null && moderation !== null && moderation.canModerate(featured.userId);
  const sharer = autoSharer(members, remoteStreams);
  const fullscreen = immersive;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-3" data-call-spotlight={featured?.userId ?? 'self'}>
      <div className="relative flex min-h-0 flex-1">
        {featured === null ? (
          <div className="grid min-h-0 flex-1">
            <SelfTile self={self} language={language} portrait={96} onPress={null} />
          </div>
        ) : screen ? (
          <SharedScreen key={featured.userId} member={featured} stream={remoteStreams[featured.userId]} language={language} />
        ) : (
          <div className="grid min-h-0 flex-1">
            <Tile member={featured} stream={remoteStreams[featured.userId]} language={language} onPress={null} label={featured.name} portrait={96} />
          </div>
        )}
        {featured === null && selfControls !== null ? (
          <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2" data-call-self-featured-controls="">
            {selfControls}
          </div>
        ) : null}
        <div className="absolute right-2 top-2 flex flex-col items-end gap-2" data-call-chrome-fade="">
          <div className="flex gap-2">
            <CallButton
              label={translate(language, fullscreen ? 'call.fullscreen.exit' : 'call.fullscreen.enter')}
              glyph={<GlyphSvg glyph={CALL_VIEW_GLYPHS[fullscreen ? 'cornersIn' : 'cornersOut']} size={20} />}
              onPress={onToggleImmersive}
              tone="glass"
              prominent={screen}
              pressed={fullscreen}
              size={44}
              data={{ 'data-call-fullscreen': '' }}
            />
            {fullscreen ? null : (
              <CallButton
                label={translate(language, 'call.spotlight.back')}
                glyph={<GlyphSvg glyph={CALL_VIEW_GLYPHS.squaresFour} size={20} />}
                onPress={() => onChoose(chooseGrid(sharer?.userId ?? null))}
                tone="glass"
                prominent={screen}
                size={44}
                data={{ 'data-call-grid-back': '' }}
              />
            )}
          </div>
          {moderated && featured !== null && !fullscreen ? <CallModerationSlot member={featured} language={language} moderation={moderation} prominent={screen} /> : null}
        </div>
      </div>
      {fullscreen ? null : (
        <div className="grid h-28 shrink-0 auto-cols-[7rem] grid-flow-col gap-2 overflow-x-auto" data-call-strip="">
          {others.map((member) => (
            <Tile key={member.userId} member={member} stream={remoteStreams[member.userId]} language={language} onPress={feature(member)} label={featureLabel(member)} portrait={40} />
          ))}
          {featured === null ? null : <SelfTile self={self} language={language} portrait={40} onPress={featureSelf} />}
        </div>
      )}
    </div>
  );
}
