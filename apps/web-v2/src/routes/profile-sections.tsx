import { useState, type ReactNode } from 'react';

import { getLanguageInfo } from '@meeshy/shared/utils/languages';

import { Avatar } from '@/components/avatar';
import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from '@/components/chrome-action';
import { Field } from '@/components/field';
import { Glyph, GlyphSvg } from '@/components/glyph';
import type { GlyphName } from '@/components/glyphs';
import { PROFILE_GLYPHS, type ProfileGlyphName } from '@/components/glyphs-profile';
import {
  GroupedSection,
  RowIcon,
  SECTION_BRAND_INK,
  SECTION_CARD_STYLE,
  SECTION_INK,
  SECTION_INK_2,
} from '@/components/grouped-section';
import type { PendingRequests } from '@/lib/api/friend-requests';
import { attachmentSrc } from '@/lib/api/media-url';
import type { MaskedContact, MyProfile, MyStats, ProfileImageKind } from '@/lib/api/profile';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { ProfileDraft } from '@/lib/view/profile-draft';
import { Link } from '@/routes/route-table';

/**
 * **LES SECTIONS DU PROFIL** (#6289) — miroir de `ProfileView.swift`, section
 * pour section et dans son ordre : bannière et avatar, identité, contact,
 * langues du Prisme, statistiques et progression, demandes, membre depuis.
 *
 * Chaque section est un composant PUR (primitives en props, aucun magasin
 * global) : `routes/profile.test.tsx` les rend sans DOM ni TanStack Query, et
 * l'écran (`routes/profile.tsx`) ne fait que les composer.
 *
 * **Deux divergences assumées** (D-56) :
 *  - les langues se changent SANS passer par « Modifier » — choisir une langue
 *    dans la feuille l'enregistre (deux gestes, dimension 7). iOS demande
 *    d'ouvrir l'édition d'abord, puis d'enregistrer : quatre gestes pour ce
 *    que le produit tient pour son réglage le plus important ;
 *  - le bouton de la bannière se pose en HAUT à droite, pas en bas : les deux
 *    disques flottants occupent le couloir 126 → 178 px (`floating-corridor.ts`),
 *    exactement la hauteur du bas de la bannière.
 *
 * Les textes à l'encre lisible (`BRAND_INK`) reprennent la classe de la cloche
 * (`routes/notifications.tsx`), mesurée AA dans les deux schémas — la même
 * chaîne, donc aucune règle CSS de plus avant le premier pixel.
 */

export const PROFILE_HEADER_HEIGHT = 64;

const INK = SECTION_INK;
const INK_2 = SECTION_INK_2;
const BRAND_INK = SECTION_BRAND_INK;
const CARD_STYLE = SECTION_CARD_STYLE;
const FIELD_TINT = 'var(--color-ios-brand)';

type IconSpec = { readonly set: 'socle'; readonly name: GlyphName } | { readonly set: 'ecran'; readonly name: ProfileGlyphName };

function Icon({ spec, size }: { readonly spec: IconSpec; readonly size: number }) {
  return spec.set === 'socle' ? <Glyph name={spec.name} size={size} /> : <GlyphSvg glyph={PROFILE_GLYPHS[spec.name]} size={size} />;
}

function FieldIcon({ spec }: { readonly spec: IconSpec }) {
  return (
    <RowIcon>
      <Icon spec={spec} size={15} />
    </RowIcon>
  );
}

function Section({
  id,
  title,
  glyph,
  card = true,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly glyph: ProfileGlyphName;
  readonly card?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <GroupedSection id={id} title={title} icon={<GlyphSvg glyph={PROFILE_GLYPHS[glyph]} size={12} />} card={card}>
      {children}
    </GroupedSection>
  );
}

function InfoRow({ icon, label, children }: { readonly icon: IconSpec; readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5" style={{ minHeight: 52 }}>
      <FieldIcon spec={icon} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-caption font-medium" style={{ color: INK_2 }}>
          {label}
        </span>
        {children}
      </div>
    </div>
  );
}

function Value({ text, placeholder = '—' }: { readonly text: string | null; readonly placeholder?: string }) {
  return (
    <span className="break-words text-body font-medium" style={{ color: text === null ? INK_2 : INK }}>
      {text ?? placeholder}
    </span>
  );
}

export function ProfileHeaderBar({
  language,
  editing,
  saving,
  online,
  ready,
  onEdit,
  onCancel,
  onSave,
}: {
  readonly language: InterfaceLanguage;
  readonly editing: boolean;
  readonly saving: boolean;
  readonly online: boolean;
  /** Le profil SERVI est en cache (#6343) — sans lui aucun brouillon ne peut naître. */
  readonly ready: boolean;
  readonly onEdit: () => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
}) {
  const actionClass = `grid shrink-0 place-items-center rounded-chip px-3 text-caption font-semibold focus-visible:outline-2 ${BRAND_INK}`;
  const actionStyle = (enabled: boolean) => ({ minHeight: 44, outlineColor: 'var(--color-ios-brand)', opacity: enabled ? 1 : 0.5 });
  return (
    <header className="flex shrink-0 items-center gap-1 px-2" style={{ height: PROFILE_HEADER_HEIGHT }}>
      {editing ? (
        <button type="button" data-profile-cancel onClick={onCancel} className={actionClass} style={actionStyle(true)}>
          {translate(language, 'profile.cancel')}
        </button>
      ) : (
        <Link
          to="list"
          aria-label={translate(language, 'pending.back')}
          className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
          style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <ChromeActionDisc>
            <Glyph name="caretLeft" size={16} />
          </ChromeActionDisc>
        </Link>
      )}
      <h1 className="min-w-0 flex-1 truncate text-body font-semibold" style={{ color: INK }}>
        {translate(language, 'profile.title')}
      </h1>
      {editing ? (
        <button
          type="button"
          data-profile-save
          onClick={onSave}
          disabled={saving || !online}
          className={actionClass}
          style={actionStyle(!saving && online)}
        >
          {translate(language, saving ? 'profile.saving' : 'profile.save')}
        </button>
      ) : (
        <button
          type="button"
          data-profile-edit
          onClick={onEdit}
          disabled={!online || !ready}
          className={actionClass}
          style={actionStyle(online && ready)}
        >
          {translate(language, 'profile.edit')}
        </button>
      )}
    </header>
  );
}

export function initialsOf(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .map((word) => [...word][0]?.toUpperCase() ?? '')
    .filter((letter) => letter !== '')
    .slice(0, 2)
    .join('');
  return letters === '' ? '?' : letters;
}

export type PendingImages = Partial<Readonly<Record<ProfileImageKind, string>>>;

function UploadVeil({
  language,
  kind,
  round,
  onCancel,
}: {
  readonly language: InterfaceLanguage;
  readonly kind: ProfileImageKind;
  readonly round: boolean;
  readonly onCancel: (kind: ProfileImageKind) => void;
}) {
  return (
    <span
      className={`absolute inset-0 grid place-items-center ${round ? 'rounded-chip' : ''}`}
      style={{ backgroundColor: 'rgb(0 0 0 / 0.45)' }}
    >
      <span className="sr-only">{translate(language, 'profile.image.uploading')}</span>
      <button
        type="button"
        data-profile-cancel-upload={kind}
        aria-label={translate(language, 'profile.image.cancel')}
        onClick={() => onCancel(kind)}
        className="grid place-items-center rounded-chip focus-visible:outline-2"
        style={{ minWidth: 44, minHeight: 44, color: 'white', outlineColor: 'white' }}
      >
        <span className="grid place-items-center rounded-chip" style={{ width: 32, height: 32, backgroundColor: 'rgb(0 0 0 / 0.55)' }}>
          <Glyph name="x" size={16} />
        </span>
      </button>
    </span>
  );
}

function PickButton({
  kind,
  label,
  glyph,
  onPick,
  style,
}: {
  readonly kind: ProfileImageKind;
  readonly label: string;
  readonly glyph: ProfileGlyphName;
  readonly onPick: (kind: ProfileImageKind) => void;
  readonly style: Readonly<Record<string, string | number>>;
}) {
  return (
    <button
      type="button"
      data-profile-pick={kind}
      aria-label={label}
      onClick={() => onPick(kind)}
      className="absolute grid place-items-center rounded-chip focus-visible:outline-2"
      style={{ minWidth: 44, minHeight: 44, outlineColor: 'var(--color-ios-brand)', ...style }}
    >
      <span
        className="grid place-items-center rounded-chip"
        style={{ width: 32, height: 32, color: 'white', backgroundColor: 'color-mix(in srgb, var(--ios-indigo-700) 88%, black)' }}
      >
        <GlyphSvg glyph={PROFILE_GLYPHS[glyph]} size={16} />
      </span>
    </button>
  );
}

export function ProfileHero({
  language,
  profile,
  editing,
  pending,
  onPick,
  onCancelUpload,
}: {
  readonly language: InterfaceLanguage;
  readonly profile: Pick<MyProfile, 'username' | 'displayName' | 'avatar' | 'banner'>;
  readonly editing: boolean;
  readonly pending: PendingImages;
  readonly onPick: (kind: ProfileImageKind) => void;
  readonly onCancelUpload: (kind: ProfileImageKind) => void;
}) {
  const name = profile.displayName ?? profile.username;
  const banner = pending.banner ?? profile.banner;
  const avatar = pending.avatar ?? profile.avatar;
  return (
    <section data-profile-hero aria-label={name} className="grid justify-items-center">
      <div
        data-profile-banner
        className="relative w-full overflow-hidden rounded-card"
        style={{ height: 120 }}
        aria-busy={pending.banner === undefined ? undefined : true}
      >
        {banner === null ? (
          <span
            aria-hidden="true"
            className="block size-full"
            style={{
              background:
                'linear-gradient(135deg, color-mix(in srgb, var(--color-ios-brand) 30%, transparent), color-mix(in srgb, var(--ios-indigo-300) 20%, transparent))',
            }}
          />
        ) : (
          /* Une RÉFÉRENCE de média, jamais une adresse (#6388) — et l'aperçu
             local d'un téléversement en cours (`blob:`) traverse intact. */
          <img src={attachmentSrc(banner)} alt="" className="block size-full object-cover" />
        )}
        {editing && pending.banner === undefined ? (
          <PickButton
            kind="banner"
            label={translate(language, 'profile.banner.edit')}
            glyph="camera"
            onPick={onPick}
            style={{ insetInlineEnd: 6, top: 6 }}
          />
        ) : null}
        {pending.banner === undefined ? null : <UploadVeil language={language} kind="banner" round={false} onCancel={onCancelUpload} />}
      </div>
      <div className="relative" style={{ marginTop: -45 }} aria-busy={pending.avatar === undefined ? undefined : true}>
        <span className="block rounded-chip" style={{ padding: 4, backgroundColor: 'var(--color-ios-surface)' }}>
          <Avatar initials={initialsOf(name)} color="var(--color-ios-brand)" size={90} name={name} {...(avatar === null ? {} : { src: avatar })} />
        </span>
        {editing && pending.avatar === undefined ? (
          <PickButton
            kind="avatar"
            label={translate(language, 'profile.avatar.edit')}
            glyph="pencilSimple"
            onPick={onPick}
            style={{ insetInlineEnd: -10, bottom: -10 }}
          />
        ) : null}
        {pending.avatar === undefined ? null : <UploadVeil language={language} kind="avatar" round onCancel={onCancelUpload} />}
      </div>
      <div className="grid max-w-full justify-items-center gap-0.5 pt-2 text-center">
        <p className="max-w-full break-words text-screen font-bold" style={{ color: INK }}>
          {name}
        </p>
        <p className={`text-body font-medium ${BRAND_INK}`}>{`@${profile.username}`}</p>
      </div>
    </section>
  );
}

type TextKey = 'firstName' | 'lastName' | 'displayName';

const TEXT_FIELDS = [
  { key: 'firstName', label: 'profile.first_name', autoComplete: 'given-name' },
  { key: 'lastName', label: 'profile.last_name', autoComplete: 'family-name' },
  { key: 'displayName', label: 'profile.display_name', autoComplete: 'nickname' },
] as const satisfies ReadonlyArray<{ readonly key: TextKey; readonly label: InterfaceCatalogKey; readonly autoComplete: string }>;

export function IdentitySection({
  language,
  profile,
  editing,
  draft,
  onDraft,
}: {
  readonly language: InterfaceLanguage;
  readonly profile: MyProfile;
  readonly editing: boolean;
  readonly draft: ProfileDraft | null;
  readonly onDraft: (next: ProfileDraft) => void;
}) {
  const [focused, setFocused] = useState<keyof ProfileDraft | null>(null);
  const username = (
    <InfoRow icon={{ set: 'ecran', name: 'at' }} label={translate(language, 'profile.username')}>
      <Value text={`@${profile.username}`} />
    </InfoRow>
  );

  if (editing && draft !== null) {
    return (
      <Section id="profile-identity" title={translate(language, 'profile.section.identity')} glyph="identificationCard">
        <div className="grid gap-3 p-3.5">
          {TEXT_FIELDS.map(({ key, label, autoComplete }) => (
            <Field key={key} id={`profile-${key}`} label={translate(language, label)} icon="user" tint={FIELD_TINT} focused={focused === key}>
              {({ id, describedBy }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  value={draft[key]}
                  autoComplete={autoComplete}
                  onChange={(event) => onDraft({ ...draft, [key]: event.currentTarget.value })}
                  onFocus={() => setFocused(key)}
                  onBlur={() => setFocused(null)}
                  className="min-w-0 flex-1 bg-transparent text-body outline-none"
                  style={{ minHeight: 44, color: INK }}
                />
              )}
            </Field>
          ))}
          <Field
            id="profile-bio"
            label={translate(language, 'profile.bio')}
            glyph={PROFILE_GLYPHS.quotes}
            tint={FIELD_TINT}
            focused={focused === 'bio'}
          >
            {({ id, describedBy }) => (
              <textarea
                id={id}
                aria-describedby={describedBy}
                value={draft.bio}
                rows={3}
                maxLength={500}
                placeholder={translate(language, 'profile.bio.placeholder')}
                onChange={(event) => onDraft({ ...draft, bio: event.currentTarget.value })}
                onFocus={() => setFocused('bio')}
                onBlur={() => setFocused(null)}
                className="min-w-0 flex-1 resize-none bg-transparent py-3 text-body outline-none"
                style={{ color: INK }}
              />
            )}
          </Field>
        </div>
        {username}
      </Section>
    );
  }

  return (
    <Section id="profile-identity" title={translate(language, 'profile.section.identity')} glyph="identificationCard">
      <InfoRow icon={{ set: 'socle', name: 'user' }} label={translate(language, 'profile.first_name')}>
        <Value text={profile.firstName} />
      </InfoRow>
      <InfoRow icon={{ set: 'socle', name: 'user' }} label={translate(language, 'profile.last_name')}>
        <Value text={profile.lastName} />
      </InfoRow>
      {username}
      <InfoRow icon={{ set: 'ecran', name: 'identificationCard' }} label={translate(language, 'profile.display_name')}>
        <Value text={profile.displayName} />
      </InfoRow>
      <InfoRow icon={{ set: 'ecran', name: 'quotes' }} label={translate(language, 'profile.bio')}>
        <Value text={profile.bio === '' ? null : profile.bio} placeholder={translate(language, 'profile.bio.placeholder')} />
      </InfoRow>
    </Section>
  );
}

function VerificationBadge({ language, verified }: { readonly language: InterfaceLanguage; readonly verified: boolean }) {
  const tint = verified ? 'var(--color-success)' : 'var(--color-warning)';
  return (
    <span
      className="shrink-0 rounded-chip px-2 py-0.5 text-chip font-semibold"
      style={{ color: INK, backgroundColor: `color-mix(in srgb, ${tint} 22%, transparent)`, boxShadow: `inset 0 0 0 1px ${tint}` }}
    >
      {translate(language, verified ? 'profile.verified' : 'profile.not_verified')}
    </span>
  );
}

function ContactRow({
  language,
  icon,
  label,
  contact,
}: {
  readonly language: InterfaceLanguage;
  readonly icon: IconSpec;
  readonly label: string;
  readonly contact: MaskedContact | null;
}) {
  return (
    <div className="flex items-center gap-3 pe-3.5">
      <div className="min-w-0 flex-1">
        <InfoRow icon={icon} label={label}>
          <span dir="ltr" className="truncate text-body font-medium" style={{ color: contact === null ? INK_2 : INK }}>
            {contact?.masked ?? '—'}
          </span>
        </InfoRow>
      </div>
      {contact === null ? null : <VerificationBadge language={language} verified={contact.verified} />}
    </div>
  );
}

export function ContactSection({
  language,
  email,
  phone,
}: {
  readonly language: InterfaceLanguage;
  readonly email: MaskedContact | null;
  readonly phone: MaskedContact | null;
}) {
  return (
    <Section id="profile-contact" title={translate(language, 'profile.section.contact')} glyph="envelopeSimple">
      <ContactRow language={language} icon={{ set: 'ecran', name: 'envelopeSimple' }} label={translate(language, 'profile.email')} contact={email} />
      <ContactRow language={language} icon={{ set: 'socle', name: 'phone' }} label={translate(language, 'profile.phone')} contact={phone} />
    </Section>
  );
}

export type PrismRank = 'systemLanguage' | 'regionalLanguage' | 'customDestinationLanguage';

export const PRISM_RANKS = [
  { rank: 'systemLanguage', title: 'profile.language.primary', clear: null },
  { rank: 'regionalLanguage', title: 'profile.language.regional', clear: 'profile.language.clear.regional' },
  { rank: 'customDestinationLanguage', title: 'profile.language.custom', clear: 'profile.language.clear.custom' },
] as const satisfies ReadonlyArray<{
  readonly rank: PrismRank;
  readonly title: InterfaceCatalogKey;
  readonly clear: InterfaceCatalogKey | null;
}>;

export function LanguagesSection({
  language,
  systemLanguage,
  regionalLanguage,
  customDestinationLanguage,
  disabled,
  onOpen,
  onClear,
}: {
  readonly language: InterfaceLanguage;
  readonly systemLanguage: string | null;
  readonly regionalLanguage: string | null;
  readonly customDestinationLanguage: string | null;
  readonly disabled: boolean;
  readonly onOpen: (rank: PrismRank) => void;
  readonly onClear: (rank: PrismRank) => void;
}) {
  const codes: Readonly<Record<PrismRank, string | null>> = { systemLanguage, regionalLanguage, customDestinationLanguage };
  return (
    <Section id="profile-languages" title={translate(language, 'profile.section.languages')} glyph="globe">
      <ol className="grid">
        {PRISM_RANKS.map(({ rank, title, clear }) => {
          const code = codes[rank];
          const info = code === null ? null : getLanguageInfo(code);
          return (
            <li key={rank} data-prism-rank={rank} className="flex items-center">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onOpen(rank)}
                className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5 text-start focus-visible:outline-2"
                style={{ minHeight: 56, outlineColor: 'var(--color-ios-brand)', opacity: disabled ? 0.6 : 1 }}
              >
                <FieldIcon spec={{ set: 'ecran', name: 'globe' }} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-body font-medium" style={{ color: INK }}>
                    {translate(language, title)}
                  </span>
                  {rank === 'systemLanguage' && code !== null ? (
                    <span className="text-caption" style={{ color: INK_2 }}>
                      {translate(language, 'profile.language.primary.subtitle')}
                    </span>
                  ) : null}
                </span>
                {code === null || info === null ? (
                  <span className="shrink-0 text-caption font-medium" style={{ color: INK_2 }}>
                    {translate(language, rank === 'systemLanguage' ? 'profile.language.choose' : 'profile.language.none')}
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span aria-hidden="true">{info.flag}</span>
                    <span lang={code} className="text-caption font-medium" style={{ color: INK_2 }}>
                      {info.nativeName ?? info.name}
                    </span>
                  </span>
                )}
                <span aria-hidden="true" style={{ color: INK_2 }}>
                  <GlyphSvg glyph={PROFILE_GLYPHS.caretRight} size={12} />
                </span>
              </button>
              {clear !== null && code !== null && !disabled ? (
                <button
                  type="button"
                  data-prism-clear={rank}
                  aria-label={translate(language, clear)}
                  onClick={() => onClear(rank)}
                  className="grid shrink-0 place-items-center focus-visible:outline-2"
                  style={{ minWidth: 44, minHeight: 44, color: INK_2, outlineColor: 'var(--color-ios-brand)' }}
                >
                  <Glyph name="x" size={14} />
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

const STAT_CHIPS = [
  { key: 'totalMessages', label: 'profile.stats.messages', icon: { set: 'ecran', name: 'chatCircle' } },
  { key: 'totalTranslations', label: 'profile.stats.translations', icon: { set: 'socle', name: 'translate' } },
  { key: 'languagesUsed', label: 'profile.stats.languages', icon: { set: 'ecran', name: 'globe' } },
  { key: 'memberDays', label: 'profile.stats.days', icon: { set: 'ecran', name: 'calendarBlank' } },
] as const satisfies ReadonlyArray<{ readonly key: keyof MyStats; readonly label: InterfaceCatalogKey; readonly icon: IconSpec }>;

export function StatsSection({ language, stats }: { readonly language: InterfaceLanguage; readonly stats: MyStats | null }) {
  return (
    <Section id="profile-stats" title={translate(language, 'profile.section.stats')} glyph="chartBar" card={false}>
      {stats === null ? (
        <div aria-busy="true" aria-label={translate(language, 'profile.stats.loading')} className="grid grid-cols-2 gap-2 min-[360px]:grid-cols-4">
          {STAT_CHIPS.map(({ key }) => (
            <span key={key} className="block rounded-card" style={{ ...CARD_STYLE, height: 64 }} />
          ))}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2 min-[360px]:grid-cols-4">
          {STAT_CHIPS.map(({ key, label, icon }) => (
            <li key={key} data-stat={key} className="grid justify-items-center gap-1 rounded-card px-1 py-2.5 text-center" style={CARD_STYLE}>
              <span aria-hidden="true" style={{ color: 'var(--color-ios-brand)' }}>
                <Icon spec={icon} size={14} />
              </span>
              <strong className="text-body font-bold" style={{ color: INK }}>
                {String(stats[key])}
              </strong>
              <span className="text-chip font-medium" style={{ color: INK_2 }}>
                {translate(language, label)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

const ENTRY_CLASS = 'flex items-center gap-3 px-3.5 focus-visible:outline-2';

export function ProgressionEntry({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <Link
      to="progression"
      data-profile-progression
      className={`${ENTRY_CLASS} rounded-card py-2.5`}
      style={{ ...CARD_STYLE, minHeight: 56, outlineColor: 'var(--color-ios-brand)' }}
    >
      <FieldIcon spec={{ set: 'socle', name: 'trophy' }} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body font-medium" style={{ color: INK }}>
          {translate(language, 'profile.progression.title')}
        </span>
        <span className="text-caption" style={{ color: INK_2 }}>
          {translate(language, 'profile.progression.subtitle')}
        </span>
      </span>
      <span aria-hidden="true" style={{ color: INK_2 }}>
        <GlyphSvg glyph={PROFILE_GLYPHS.caretRight} size={12} />
      </span>
    </Link>
  );
}

export function RequestsSection({ language, pending }: { readonly language: InterfaceLanguage; readonly pending: PendingRequests | null }) {
  const shown = pending === null || pending.count === 0 ? null : `${pending.count}${pending.more ? '+' : ''}`;
  const title = translate(language, 'profile.friend_requests');
  const label =
    pending === null || shown === null
      ? title
      : `${title}, ${translate(language, pending.count === 1 && !pending.more ? 'profile.friend_requests.count.one' : 'profile.friend_requests.count.other', { count: shown })}`;
  return (
    <Section id="profile-requests" title={translate(language, 'profile.section.requests')} glyph="userPlus">
      <Link to="discover" data-profile-requests aria-label={label} className={ENTRY_CLASS} style={{ minHeight: 52, outlineColor: 'var(--color-ios-brand)' }}>
        <FieldIcon spec={{ set: 'socle', name: 'users' }} />
        <span className="min-w-0 flex-1 text-body font-medium" style={{ color: INK }}>
          {title}
        </span>
        {shown === null ? null : (
          <span
            data-pending-requests
            className="grid place-items-center rounded-chip px-1.5 text-chip font-bold"
            style={{ minWidth: 22, height: 22, color: 'white', backgroundColor: 'var(--ios-indigo-600)' }}
          >
            {shown}
          </span>
        )}
        <span aria-hidden="true" style={{ color: INK_2 }}>
          <GlyphSvg glyph={PROFILE_GLYPHS.caretRight} size={12} />
        </span>
      </Link>
    </Section>
  );
}

const memberSince = (language: InterfaceLanguage, createdAt: string | null): string => {
  if (createdAt === null) return '—';
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
};

export function MemberSinceSection({ language, createdAt }: { readonly language: InterfaceLanguage; readonly createdAt: string | null }) {
  return (
    <Section id="profile-member-since" title={translate(language, 'profile.section.member_since')} glyph="calendarBlank">
      <p className="px-3.5 py-3 text-body font-medium" style={{ color: INK }}>
        {memberSince(language, createdAt)}
      </p>
    </Section>
  );
}

export function ProfileSectionsSkeleton({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div data-profile-skeleton aria-busy="true" aria-label={translate(language, 'profile.loading')} className="grid gap-6">
      {[0, 1].map((section) => (
        <div key={section} className="grid gap-2">
          <span className="block h-3 w-24 rounded-chip" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 25%, transparent)' }} />
          <span className="block rounded-card" style={{ ...CARD_STYLE, height: section === 0 ? 212 : 104 }} />
        </div>
      ))}
    </div>
  );
}

export function ProfileHeroSkeleton() {
  return (
    <div aria-hidden="true" className="grid justify-items-center">
      <span className="block w-full rounded-card" style={{ ...CARD_STYLE, height: 120 }} />
      <span className="block rounded-chip" style={{ marginTop: -45, width: 98, height: 98, backgroundColor: 'var(--color-ios-card)' }} />
      <span className="mt-3 block h-4 w-32 rounded-chip" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 25%, transparent)' }} />
    </div>
  );
}

export function ProfileLoadError({ language, onRetry }: { readonly language: InterfaceLanguage; readonly onRetry: () => void }) {
  return (
    <div role="alert" className="grid justify-items-center gap-3 rounded-card px-6 py-8 text-center" style={CARD_STYLE}>
      <span style={{ color: 'var(--color-error)' }}>
        <Glyph name="warningCircle" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: INK }}>
        {translate(language, 'profile.error.title')}
      </p>
      <p className="text-caption" style={{ color: INK_2 }}>
        {translate(language, 'profile.error.body')}
      </p>
      <button
        type="button"
        data-profile-retry
        onClick={onRetry}
        className={`grid place-items-center rounded-chip px-4 text-caption font-semibold focus-visible:outline-2 ${BRAND_INK}`}
        style={{ minHeight: 44, outlineColor: 'var(--color-ios-brand)' }}
      >
        {translate(language, 'profile.retry')}
      </button>
    </div>
  );
}

export function ProfileOfflineNotice({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div role="status" data-profile-offline className="flex items-start gap-3 rounded-card px-3.5 py-3" style={CARD_STYLE}>
      <span aria-hidden="true" className="pt-0.5" style={{ color: 'var(--color-warning)' }}>
        <Glyph name="warningCircle" size={18} />
      </span>
      <span className="grid gap-0.5">
        <span className="text-body font-semibold" style={{ color: INK }}>
          {translate(language, 'profile.offline.title')}
        </span>
        <span className="text-caption" style={{ color: INK_2 }}>
          {translate(language, 'profile.offline.body')}
        </span>
      </span>
    </div>
  );
}
