import type { ReactNode } from 'react';

import { RingedAvatar } from '@/components/peer-avatar';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { GroupedSection, SECTION_BRAND_INK, SECTION_CARD_STYLE, SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';
import { ROW_MENU_GLYPHS } from '@/components/glyphs-row-menu';
import type { CommunityMember, CommunityMemberRole, MemberGestures } from '@/lib/api/community-members';
import { communityAccent } from '@/lib/communities/view';
import { translateMembership } from '@/lib/i18n-community-membership-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';
import { Link } from '@/routes/route-table';

/**
 * **LES PIÈCES DE L'ÉCRAN MEMBRES** (#6375) — miroir `CommunityMembersScreen`
 * et `MemberRow` (`packages/MeeshySDK/Sources/MeeshyUI/Community/`) : une
 * section par rôle, titre et compte ; chaque ligne porte l'avatar, le nom et
 * le rôle, coloré comme iOS (administrateur rouge, modérateur indigo, membre
 * gris).
 *
 * Le menu « ⋯ » d'iOS devient ici une DIVULGATION (`aria-expanded`) qui
 * déplie les gestes sous la ligne : chaque geste reste un vrai bouton de 44,
 * atteignable au clavier et nommé, sans couche flottante qu'une liste qui
 * défile couperait. Il n'existe que si un geste existe (`memberGesturesOf`).
 *
 * La présence est celle que la passerelle SERT : un point vert pour un membre
 * dit en ligne, rien sinon — jamais un gris d'« hors ligne » sur un avatar.
 */

const INK = SECTION_INK;
const INK_2 = SECTION_INK_2;
const ERROR_INK = 'var(--color-error)';
const ROW_SEPARATOR = '1px solid color-mix(in srgb, var(--color-ios-ink-3) 18%, transparent)';
const SKELETON_TINT = 'color-mix(in srgb, var(--color-ios-ink-3) 25%, transparent)';

/** L'indigo du modérateur à l'encre LISIBLE (`SECTION_BRAND_INK`, AA dans les deux schémas) : le jeton de marque brut tombe à 4,2. */
const ROLE_INK: Readonly<Record<CommunityMemberRole, { readonly className?: string; readonly color?: string }>> = {
  admin: { color: ERROR_INK },
  moderator: { className: SECTION_BRAND_INK },
  member: { color: INK_2 },
};

const SECTION_KEY = {
  admin: 'community.members.section.admin',
  moderator: 'community.members.section.moderator',
  member: 'community.members.section.member',
} as const;

const ROLE_KEY = {
  admin: 'community.members.role.admin',
  moderator: 'community.members.role.moderator',
  member: 'community.members.role.member',
} as const;

const MAKE_KEY = {
  admin: 'community.members.make.admin',
  moderator: 'community.members.make.moderator',
  member: 'community.members.make.member',
} as const;

export function MemberSection({
  language,
  role,
  count,
  children,
}: {
  readonly language: InterfaceLanguage;
  readonly role: CommunityMemberRole;
  readonly count: number;
  readonly children: ReactNode;
}) {
  return (
    <GroupedSection
      id={`community-members-${role}`}
      title={`${translateMembership(language, SECTION_KEY[role])} · ${new Intl.NumberFormat(language).format(count)}`}
      icon={<Glyph name="users" size={12} />}
    >
      <ul data-community-member-section={role}>{children}</ul>
    </GroupedSection>
  );
}

export function MemberRow({
  language,
  member,
  isViewer,
  gestures,
  expanded,
  pending,
  onToggle,
  onRole,
  onRemove,
  first,
}: {
  readonly language: InterfaceLanguage;
  readonly member: CommunityMember;
  readonly isViewer: boolean;
  readonly gestures: MemberGestures;
  readonly expanded: boolean;
  readonly pending: boolean;
  readonly onToggle: () => void;
  readonly onRole: (role: CommunityMemberRole) => void;
  readonly onRemove: () => void;
  readonly first: boolean;
}) {
  const manageable = gestures.canRemove || gestures.roles.length > 0;
  const panelId = `community-member-${member.id}-gestures`;
  return (
    <li data-community-member={member.userId} style={first ? undefined : { borderTop: ROW_SEPARATOR }}>
      <div className="flex items-center gap-3 px-3.5 py-2" style={{ minHeight: 60 }}>
        <span aria-hidden="true" className="shrink-0">
          <RingedAvatar
            ringRef={member.ring ?? null}
            initials={initialsOf(member.name)}
            color={communityAccent(member.name)}
            size={40}
            {...(member.avatar === null ? {} : { src: member.avatar })}
            {...(member.online ? { presence: 'online' as const } : {})}
          />
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-body font-semibold" style={{ color: INK }}>
            {member.name}
            {isViewer ? <span style={{ color: INK_2 }}>{` · ${translateMembership(language, 'community.members.you')}`}</span> : null}
          </span>
          <span
            data-community-member-role={member.role}
            className={`text-caption font-medium ${ROLE_INK[member.role].className ?? ''}`}
            style={ROLE_INK[member.role].color === undefined ? undefined : { color: ROLE_INK[member.role].color }}
          >
            {translateMembership(language, ROLE_KEY[member.role])}
          </span>
        </span>
        {manageable ? (
          <button
            type="button"
            data-community-member-manage
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={translateMembership(language, 'community.members.manage', { name: member.name })}
            disabled={pending}
            onClick={onToggle}
            className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: INK_2, opacity: pending ? 0.55 : 1 }}
          >
            <Glyph name="dotsThreeVertical" size={20} />
          </button>
        ) : null}
      </div>
      {manageable && expanded ? (
        <div id={panelId} data-community-member-gestures className="grid gap-1 px-3.5 pb-3">
          {gestures.roles.map((role) => (
            <button
              key={role}
              type="button"
              data-community-member-make={role}
              disabled={pending}
              onClick={() => onRole(role)}
              className="flex min-h-11 w-full items-center gap-3 rounded-chip px-3 text-start text-body font-medium focus-visible:outline-2 focus-visible:-outline-offset-2"
              style={{ color: INK, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 10%, transparent)' }}
            >
              <GlyphSvg glyph={ROW_MENU_GLYPHS.shieldCheck} size={18} />
              {translateMembership(language, MAKE_KEY[role])}
            </button>
          ))}
          {gestures.canRemove ? (
            <button
              type="button"
              data-community-member-remove
              disabled={pending}
              onClick={onRemove}
              className="flex min-h-11 w-full items-center gap-3 rounded-chip px-3 text-start text-body font-medium focus-visible:outline-2 focus-visible:-outline-offset-2"
              style={{ color: ERROR_INK, backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)' }}
            >
              <GlyphSvg glyph={ROW_MENU_GLYPHS.signOut} size={18} className="rtl:-scale-x-100" />
              {translateMembership(language, 'community.members.remove')}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function MembersSkeleton({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div data-community-members-skeleton aria-busy="true" aria-label={translateMembership(language, 'community.members.loading')} className="grid">
      {Array.from({ length: 4 }, (_, index) => (
        <span key={index} className="flex items-center gap-3 px-3.5 py-2" style={{ minHeight: 60 }}>
          <span className="block size-10 rounded-full" style={{ backgroundColor: SKELETON_TINT }} />
          <span className="block h-3 w-40 rounded-chip" style={{ backgroundColor: SKELETON_TINT }} />
        </span>
      ))}
    </div>
  );
}

export function MembersEmpty({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <p data-community-members-empty className="px-3.5 py-6 text-center text-caption" style={{ color: INK_2 }}>
      {translateMembership(language, 'community.members.empty')}
    </p>
  );
}

export function MembersLoadError({ language, onRetry }: { readonly language: InterfaceLanguage; readonly onRetry: () => void }) {
  return (
    <div role="alert" data-community-members-error className="grid justify-items-center gap-3 px-6 py-6 text-center">
      <p className="text-body font-semibold" style={{ color: INK }}>
        {translateMembership(language, 'community.members.error')}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="grid place-items-center rounded-chip px-5 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ minHeight: 44, backgroundColor: 'var(--ios-indigo-600)', color: 'var(--color-ios-on-brand)' }}
      >
        {translateMembership(language, 'community.members.retry')}
      </button>
    </div>
  );
}

/**
 * « Membres », sous les compteurs du détail — miroir de l'action
 * `community.detail.action.members` d'iOS, offerte à tout lecteur qui voit la
 * communauté.
 */
export function CommunityMembersLink({ language, communityId }: { readonly language: InterfaceLanguage; readonly communityId: string }) {
  return (
    <Link
      to="communityMembers"
      params={{ community: communityId }}
      data-community-members-link
      className="flex items-center gap-3 rounded-card px-3.5 focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ ...SECTION_CARD_STYLE, minHeight: 52, color: INK }}
    >
      <span aria-hidden="true" style={{ color: 'var(--color-ios-brand)' }}>
        <Glyph name="users" size={18} />
      </span>
      <span className="flex-1 text-body font-semibold">{translateMembership(language, 'community.members.open')}</span>
      <span aria-hidden="true" style={{ color: INK_2 }}>
        <GlyphSvg glyph={ROW_MENU_GLYPHS.caretRight} size={14} className="rtl:-scale-x-100" />
      </span>
    </Link>
  );
}
