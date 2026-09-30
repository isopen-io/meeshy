import { AdminGlyph } from '@/components/admin/admin-glyph';
import { AdminBadge, AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminEntityChip } from '@/components/admin/entity-chip';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminMetaPanel, AdminMetaRow, AdminMomentText, AdminTechnicalId } from '@/components/admin/meta';
import { AdminInlineNotice } from '@/components/admin/states';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { shareLinkGuestPermissions, shareLinkRequirements, shareLinkRestrictions, shareLinkState, type ShareLinkFlag } from '@/lib/admin/share-link-model';
import { guestRefOf } from '@/lib/admin/share-link-refs';
import type { AdminShareLink } from '@/lib/api/admin-share-links';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { LinkConversation, LinkPerson } from './admin-share-link-parts';

/**
 * **LES BLOCS DE LA FICHE D'UN LIEN DE PARTAGE** (#8876, #6729) — la conversation
 * qu'il ouvre, ce que les invités PEUVENT faire, ce que le lien EXIGE, ce qu'il
 * RESTREINT, qui est arrivé par lui, et les métadonnées interprétées.
 *
 * Chaque permission est une PHRASE (jamais `true` / `false`) ; chaque restriction
 * est nommée (pays, langues — jamais « FR » ni « wo ») ; une liste vide se dit
 * « Aucune restriction ».
 */
const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';

export function ConversationSection({ language, link }: { readonly language: AdminLanguage; readonly link: AdminShareLink }) {
  return (
    <AdminFicheSection id="conversation" title={translateAdmin(language, 'admin.shareLink.section.conversation')}>
      {link.conversation === null ? (
        <AdminInlineNotice tone="neutral" text={translateAdmin(language, 'admin.shareLink.conversation.none')} />
      ) : (
        <LinkConversation language={language} conversation={link.conversation} />
      )}
    </AdminFicheSection>
  );
}

function FlagList({ flags, anchor }: { readonly flags: readonly ShareLinkFlag[]; readonly anchor: string }) {
  return (
    <ul className="grid gap-2" data-admin-flags={anchor}>
      {flags.map((flag) => (
        <li key={flag.id} data-admin-flag={flag.id} className="flex items-start gap-3 text-body" style={{ color: INK }}>
          <span aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: INK2 }}>
            <AdminGlyph name={flag.allowed === true ? 'check' : flag.allowed === false ? 'minus' : 'info'} size={16} />
          </span>
          <span className="min-w-0 break-words">{flag.phrase}</span>
        </li>
      ))}
    </ul>
  );
}

export function PermissionsSection({ language, link }: { readonly language: AdminLanguage; readonly link: AdminShareLink }) {
  return (
    <AdminFicheSection id="permissions" title={translateAdmin(language, 'admin.shareLink.section.permissions')}>
      <FlagList anchor="permissions" flags={shareLinkGuestPermissions(link, language)} />
    </AdminFicheSection>
  );
}

export function RequirementsSection({ language, link }: { readonly language: AdminLanguage; readonly link: AdminShareLink }) {
  return (
    <AdminFicheSection id="requirements" title={translateAdmin(language, 'admin.shareLink.section.requirements')}>
      <FlagList anchor="requirements" flags={shareLinkRequirements(link, language)} />
    </AdminFicheSection>
  );
}

function RestrictionRow({ anchor, label, names, none }: { readonly anchor: string; readonly label: string; readonly names: readonly string[]; readonly none: string }) {
  return (
    <AdminMetaRow
      anchor={anchor}
      label={label}
      value={
        names.length === 0 ? (
          none
        ) : (
          <span className="flex flex-wrap gap-2">
            {names.map((name) => (
              <AdminBadge key={name} tone="neutral">
                {name}
              </AdminBadge>
            ))}
          </span>
        )
      }
    />
  );
}

export function RestrictionsSection({ language, link }: { readonly language: AdminLanguage; readonly link: AdminShareLink }) {
  const restrictions = shareLinkRestrictions(link, language);
  const none = translateAdmin(language, 'admin.shareLink.restrict.none');
  return (
    <AdminFicheSection id="restrictions" title={translateAdmin(language, 'admin.shareLink.section.restrictions')}>
      <dl className="grid gap-3">
        <RestrictionRow anchor="countries" label={translateAdmin(language, 'admin.shareLink.restrict.countries')} names={restrictions.countries} none={none} />
        <RestrictionRow anchor="languages" label={translateAdmin(language, 'admin.shareLink.restrict.languages')} names={restrictions.languages} none={none} />
      </dl>
    </AdminFicheSection>
  );
}

export function GuestsSection({ language, link, now }: { readonly language: AdminLanguage; readonly link: AdminShareLink; readonly now: Date }) {
  return (
    <AdminFicheSection id="guests" title={translateAdmin(language, 'admin.shareLink.section.guests')}>
      {link.recentGuests.length === 0 ? (
        <AdminInlineNotice tone="neutral" text={translateAdmin(language, 'admin.shareLink.guests.empty')} />
      ) : (
        <ul className="grid gap-2">
          {link.recentGuests.map((guest) => (
            <li key={guest.id} data-admin-guest={guest.id} className="flex flex-wrap items-center justify-between gap-2">
              <AdminEntityChip language={language} entity={guestRefOf(guest, language)} />
              <span className="flex flex-wrap items-center gap-2 text-caption" style={{ color: INK2 }}>
                <AdminBadge tone={guest.isActive ? 'success' : 'neutral'}>
                  {translateAdmin(language, guest.isActive ? 'admin.shareLink.guest.present' : 'admin.shareLink.guest.left')}
                </AdminBadge>
                <AdminMomentText moment={adminMomentOf(guest.joinedAt, now, language)} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </AdminFicheSection>
  );
}

export function ShareLinkMeta({
  language,
  link,
  now,
  onAnnounce,
}: {
  readonly language: AdminLanguage;
  readonly link: AdminShareLink;
  readonly now: Date;
  readonly onAnnounce: (message: string) => void;
}) {
  const state = shareLinkState(link, now, language);
  return (
    <AdminMetaPanel title={translateAdmin(language, 'admin.kit.meta.title')}>
      <AdminMetaRow anchor="state" label={translateAdmin(language, 'admin.shareLink.meta.state')} value={<AdminInterpretedBadge value={state} />} explain={state.explain} />
      <AdminMetaRow
        anchor="expires"
        label={translateAdmin(language, 'admin.shareLink.meta.expires')}
        value={link.expiresAt === null ? translateAdmin(language, 'admin.shareLink.expires.never') : <AdminMomentText moment={adminMomentOf(link.expiresAt, now, language)} variant="both" />}
        explain={link.expiresAt === null ? null : translateAdmin(language, 'admin.shareLink.meta.expires.explain')}
      />
      <AdminMetaRow anchor="creator" label={translateAdmin(language, 'admin.shareLink.meta.creator')} value={<LinkPerson language={language} person={link.creator} />} />
      {link.description === null ? null : <AdminMetaRow anchor="description" label={translateAdmin(language, 'admin.shareLink.description')} value={link.description} />}
      <AdminMetaRow anchor="created" label={translateAdmin(language, 'admin.shareLink.meta.created')} value={<AdminMomentText moment={adminMomentOf(link.createdAt, now, language)} variant="both" />} />
      <AdminMetaRow anchor="updated" label={translateAdmin(language, 'admin.shareLink.meta.updated')} value={<AdminMomentText moment={adminMomentOf(link.updatedAt, now, language)} variant="both" />} />
      <AdminTechnicalId language={language} id={link.id} onAnnounce={onAnnounce} />
    </AdminMetaPanel>
  );
}
