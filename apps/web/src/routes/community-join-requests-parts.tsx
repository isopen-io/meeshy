import { RingedAvatar } from '@/components/peer-avatar';
import { GlyphSvg } from '@/components/glyph';
import { COMMUNITIES_GLYPHS } from '@/components/glyphs-communities';
import { GroupedSection, SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';
import type { CommunityJoinRequest } from '@/lib/api/community-join-requests';
import { communityAccent } from '@/lib/communities/view';
import { translateMembership } from '@/lib/i18n-community-membership-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';

/**
 * **LES DEMANDES EN ATTENTE, EN TÊTE DE L'ÉCRAN MEMBRES** (#19871) — pour
 * l'intendant seul (administrateur, modérateur, créateur) d'une communauté qui
 * valide chaque entrée. Chaque ligne dit QUI demande (avatar, nom), D'OÙ (le
 * pays, jamais la ville) et QUAND ; deux vrais boutons de 44, nommés pour le
 * lecteur d'écran : « Accepter », « Refuser ». Le compte de la section est la
 * pastille : il dit combien attendent, « + » quand d'autres pages restent.
 *
 * Aucun point de présence : la passerelle ne sert pas celle d'un demandeur, et
 * la co-appartenance à venir n'en révèle aucune.
 */

const INK = SECTION_INK;
const INK_2 = SECTION_INK_2;
const ROW_SEPARATOR = '1px solid color-mix(in srgb, var(--color-ios-ink-3) 18%, transparent)';

const regionName = (language: InterfaceLanguage, code: string): string => {
  try {
    return new Intl.DisplayNames(language, { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

const askedOn = (language: InterfaceLanguage, iso: string): string | null => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(at);
};

export function JoinRequestsSection({
  language,
  requests,
  hasMore,
  busy,
  onAccept,
  onReject,
  onMore,
}: {
  readonly language: InterfaceLanguage;
  readonly requests: readonly CommunityJoinRequest[];
  readonly hasMore: boolean;
  readonly busy: boolean;
  readonly onAccept: (request: CommunityJoinRequest) => void;
  readonly onReject: (request: CommunityJoinRequest) => void;
  readonly onMore: () => void;
}) {
  const count = `${new Intl.NumberFormat(language).format(requests.length)}${hasMore ? '+' : ''}`;
  return (
    <GroupedSection
      id="community-join-requests"
      title={`${translateMembership(language, 'community.members.requests.section')} · ${count}`}
      icon={<GlyphSvg glyph={COMMUNITIES_GLYPHS.clock} size={12} />}
    >
      <ul data-community-join-requests>
        {requests.map((request, index) => (
          <JoinRequestRow
            key={request.id}
            language={language}
            request={request}
            first={index === 0}
            pending={busy}
            onAccept={() => onAccept(request)}
            onReject={() => onReject(request)}
          />
        ))}
      </ul>
      {hasMore ? (
        <button
          type="button"
          data-community-join-requests-more
          onClick={onMore}
          className="flex min-h-11 w-full items-center justify-center text-caption font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2"
          style={{ color: 'var(--color-ios-brand)', borderTop: ROW_SEPARATOR }}
        >
          {translateMembership(language, 'community.members.requests.more')}
        </button>
      ) : null}
    </GroupedSection>
  );
}

function JoinRequestRow({
  language,
  request,
  first,
  pending,
  onAccept,
  onReject,
}: {
  readonly language: InterfaceLanguage;
  readonly request: CommunityJoinRequest;
  readonly first: boolean;
  readonly pending: boolean;
  readonly onAccept: () => void;
  readonly onReject: () => void;
}) {
  const date = askedOn(language, request.createdAt);
  const meta = [request.country === null ? null : regionName(language, request.country), date === null ? null : translateMembership(language, 'community.members.requests.asked', { date })]
    .filter((part): part is string => part !== null)
    .join(' · ');
  return (
    <li data-community-join-request={request.id} style={first ? undefined : { borderTop: ROW_SEPARATOR }}>
      <div className="flex items-center gap-3 px-3.5 py-2" style={{ minHeight: 60 }}>
        <span aria-hidden="true" className="shrink-0">
          <RingedAvatar
            ringRef={null}
            initials={initialsOf(request.name)}
            color={communityAccent(request.name)}
            size={40}
            {...(request.avatar === null ? {} : { src: request.avatar })}
          />
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-body font-semibold" style={{ color: INK }}>
            {request.name}
          </span>
          {meta === '' ? null : (
            <span data-community-join-request-meta className="truncate text-caption" style={{ color: INK_2 }}>
              {meta}
            </span>
          )}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 px-3.5 pb-3">
        <button
          type="button"
          data-community-join-request-reject
          aria-label={translateMembership(language, 'community.members.requests.rejectLabel', { name: request.name })}
          disabled={pending}
          onClick={onReject}
          className="grid min-h-11 place-items-center rounded-chip px-3 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: INK, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 14%, transparent)', opacity: pending ? 0.55 : 1 }}
        >
          {translateMembership(language, 'community.members.requests.reject')}
        </button>
        <button
          type="button"
          data-community-join-request-accept
          aria-label={translateMembership(language, 'community.members.requests.acceptLabel', { name: request.name })}
          disabled={pending}
          onClick={onAccept}
          className="grid min-h-11 place-items-center rounded-chip px-3 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: 'var(--color-ios-on-brand)', backgroundColor: 'var(--color-ios-brand)', opacity: pending ? 0.55 : 1 }}
        >
          {translateMembership(language, 'community.members.requests.accept')}
        </button>
      </div>
    </li>
  );
}
