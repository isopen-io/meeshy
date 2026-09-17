import { useId, type ReactNode } from 'react';

import { getLanguageInfo } from '@meeshy/shared/utils/languages';

import { Avatar } from '@/components/avatar';
import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from '@/components/chrome-action';
import { Glyph, GlyphSvg } from '@/components/glyph';
import type { GlyphName } from '@/components/glyphs';
import { SETTINGS_GLYPHS, type SettingsGlyphName } from '@/components/glyphs-settings';
import {
  GroupedSection,
  RowIcon,
  SECTION_BRAND_INK,
  SECTION_CARD_STYLE,
  SECTION_INK,
  SECTION_INK_2,
} from '@/components/grouped-section';
import type { AppPreferences } from '@/lib/api/app-preferences';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { ThemePreference } from '@/lib/scheme';
import { initialsOf } from '@/lib/view/conversation';
import { FLOATING_CORRIDOR_BOTTOM } from '@/lib/view/floating-corridor';
import { Link } from '@/routes/route-table';

/**
 * **LES SECTIONS DES RÉGLAGES** (#5563) — miroir de `SettingsView.swift`, dans
 * son ordre : carte de profil, compte, apparence, notifications, données,
 * outils, à propos, déconnexion. Chaque section est un composant PUR
 * (primitives en props) : `routes/settings.test.tsx` les rend sans DOM ni
 * TanStack Query, et l'écran (`routes/settings.tsx`) ne fait que les composer.
 *
 * **Rien n'est offert qui n'ait un effet** (loi 4). Une bascule n'existe que si
 * la passerelle l'obéit (`lib/api/app-preferences.ts`). Ce que la v2.0 ne
 * porte pas encore menait au legacy ; il est décommissionné (#6702), et ces
 * rangées sont MASQUÉES jusqu'à leur portage — sécurité, options fines de
 * confidentialité et de notification, et deux rangées de la section
 * « Données » (médias #6723, messages #6724). La suppression de compte mène à
 * sa page de la v2 (`routes/account-deletion.tsx`, #6715) et l'export de
 * données à la sienne (`routes/data-export.tsx`, #6725) : aucun contrôle des
 * réglages ne vise plus une autre origine.
 *
 * **Divergence assumée : la confidentialité est une SECTION, pas une feuille.**
 * iOS la range derrière une rangée de « Compte » (`PrivacySettingsView`) parce
 * que sa feuille porte cinq sections ; la v2.0 n'en porte que les quatre
 * bascules que la passerelle obéit, et une feuille pour quatre bascules
 * coûterait un geste de plus à chaque visite (dimension 7).
 */

export const SETTINGS_HEADER_HEIGHT = 64;

/**
 * **LE COULOIR DES DISQUES FLOTTANTS** — la loi de `floating-corridor.ts`, portée
 * comme la cloche et le Flux (`FEED_TOP_RESERVE`) : au repos, la carte de profil,
 * premier contrôle de l'écran, commence SOUS les deux disques. iOS y pose le grand
 * titre dépliable de `CollapsibleHeader` ; l'encoche s'annule dans la soustraction,
 * elle décale à la fois le couloir et l'écran (`pt-safe`).
 */
export const SETTINGS_TOP_RESERVE = FLOATING_CORRIDOR_BOTTOM - SETTINGS_HEADER_HEIGHT;

type IconSpec = { readonly set: 'socle'; readonly name: GlyphName } | { readonly set: 'ecran'; readonly name: SettingsGlyphName };

function IconOf({ icon, size }: { readonly icon: IconSpec; readonly size: number }) {
  return icon.set === 'socle' ? <Glyph name={icon.name} size={size} /> : <GlyphSvg glyph={SETTINGS_GLYPHS[icon.name]} size={size} />;
}

const SECTION_ICON = (icon: IconSpec) => <IconOf icon={icon} size={12} />;

/** Les clés de l'écran — aucune ne prend de paramètre, ce qui rend `translate` appelable sur leur union. */
type SettingsKey = Extract<InterfaceCatalogKey, `settings.${string}`>;

const upper = (language: InterfaceLanguage, key: SettingsKey): string => translate(language, key).toLocaleUpperCase(language);

const ROW_CLASS = 'flex items-center gap-3 px-3.5 py-2.5 text-start focus-visible:outline-2';
const ROW_STYLE = { minHeight: 52, outlineColor: 'var(--color-ios-brand)' } as const;

function RowText({ label, caption, captionId }: { readonly label: string; readonly caption?: string; readonly captionId?: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="break-words text-body font-medium" style={{ color: SECTION_INK }}>
        {label}
      </span>
      {caption === undefined ? null : (
        <span id={captionId} className="text-caption" style={{ color: SECTION_INK_2 }}>
          {caption}
        </span>
      )}
    </span>
  );
}

function Chevron() {
  return (
    <span aria-hidden="true" className="shrink-0" style={{ color: SECTION_INK_2 }}>
      <GlyphSvg glyph={SETTINGS_GLYPHS.caretRight} size={12} />
    </span>
  );
}

export function SettingsHeaderBar({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <header className="flex shrink-0 items-center gap-1 px-2" style={{ height: SETTINGS_HEADER_HEIGHT }}>
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
      <h1 className="min-w-0 flex-1 truncate text-body font-semibold" style={{ color: SECTION_INK }}>
        {translate(language, 'settings.title')}
      </h1>
    </header>
  );
}

export type SettingsUser = { readonly username: string; readonly displayName: string | null; readonly avatar: string | null };

export function ProfileCard({ language, user }: { readonly language: InterfaceLanguage; readonly user: SettingsUser | null }) {
  const title = translate(language, 'settings.my_profile');
  const name = user === null ? title : user.displayName ?? user.username;
  return (
    <Link
      to="profile"
      data-settings-profile
      aria-label={title}
      className="flex items-center gap-3.5 rounded-card p-4 focus-visible:outline-2"
      style={{ ...SECTION_CARD_STYLE, minHeight: 72, outlineColor: 'var(--color-ios-brand)' }}
    >
      <Avatar initials={initialsOf(name)} color="var(--color-ios-brand)" size={48} {...(user?.avatar ? { src: user.avatar } : {})} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body font-semibold" style={{ color: SECTION_INK }}>
          {name}
        </span>
        {user === null ? null : <span className={`truncate text-caption font-medium ${SECTION_BRAND_INK}`}>{`@${user.username}`}</span>}
      </span>
      <Chevron />
    </Link>
  );
}

/* La SÉCURITÉ n'a plus d'adresse depuis le décommissionnement du legacy
   (#6702) : MASQUÉE jusqu'à son portage.

   La SUPPRESSION DE COMPTE mène à sa page de la v2 (`/account/deletion`,
   #6715) — même onglet, même origine, sans légende. Elle y ouvre la demande
   sous phrase et mot de passe, comme `DeleteAccountView.swift`. Hors
   production, la rangée n'est plus inerte : #6354 (D-67) la désactivait parce
   qu'elle visait la production réelle depuis staging ; une adresse RELATIVE
   mène chaque environnement à sa propre page. */
export function AccountSection({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <GroupedSection id="settings-account" title={upper(language, 'settings.section.account')} icon={SECTION_ICON({ set: 'ecran', name: 'userCircle' })}>
      <Link to="accountDeletion" data-settings-account-deletion className={ROW_CLASS} style={ROW_STYLE}>
        <RowIcon tint="var(--color-error)">
          <IconOf icon={{ set: 'ecran', name: 'userMinus' }} size={15} />
        </RowIcon>
        <RowText label={translate(language, 'settings.delete_account')} />
        <Chevron />
      </Link>
    </GroupedSection>
  );
}

/* La section « Données » (#6335) — MÉDIAS et MESSAGES restent MASQUÉS, chacun
   derrière sa propre issue de portage (#6723, #6724) : une rangée n'entre ici
   que le jour où sa destination existe (loi 4). L'EXPORT est la première à
   revenir (#6725), à une adresse propre à la v2 — `/settings/data-export`,
   jamais l'ancienne `meeshy.me/settings#privacy`. */
export function DataSection({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <GroupedSection id="settings-data" title={upper(language, 'settings.section.data')} icon={SECTION_ICON({ set: 'ecran', name: 'export' })}>
      <Link to="dataExport" data-settings-export className={ROW_CLASS} style={ROW_STYLE}>
        <RowIcon tint="var(--color-warning)">
          <IconOf icon={{ set: 'ecran', name: 'export' }} size={15} />
        </RowIcon>
        <RowText label={translate(language, 'settings.export_data')} />
        <Chevron />
      </Link>
    </GroupedSection>
  );
}

export type PreferencesView =
  | { readonly kind: 'ready'; readonly preferences: AppPreferences }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' };

export type BooleanPreference = Exclude<keyof AppPreferences, 'theme'>;

type ToggleSpec = {
  readonly key: BooleanPreference;
  readonly label: SettingsKey;
  readonly caption?: SettingsKey;
  readonly icon: IconSpec;
  readonly tint: string;
};

function Switch({ checked }: { readonly checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative block rounded-chip"
      style={{
        width: 51,
        height: 31,
        backgroundColor: checked ? 'var(--color-ios-brand)' : 'color-mix(in srgb, var(--color-ios-ink-3) 45%, transparent)',
        transition: 'background-color 160ms ease',
      }}
    >
      <span
        className="absolute block rounded-chip"
        style={{
          top: 2,
          insetInlineStart: checked ? 22 : 2,
          width: 27,
          height: 27,
          backgroundColor: 'white',
          boxShadow: '0 1px 3px rgb(0 0 0 / 0.3)',
          transition: 'inset-inline-start 160ms ease',
        }}
      />
    </span>
  );
}

function ToggleRow({
  language,
  spec,
  checked,
  disabled,
  onToggle,
}: {
  readonly language: InterfaceLanguage;
  readonly spec: ToggleSpec;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onToggle: (key: BooleanPreference, value: boolean) => void;
}) {
  const captionId = useId();
  const label = translate(language, spec.label);
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5" style={{ minHeight: 52 }}>
      <RowIcon tint={spec.tint}>
        <IconOf icon={spec.icon} size={15} />
      </RowIcon>
      <RowText label={label} {...(spec.caption === undefined ? {} : { caption: translate(language, spec.caption), captionId })} />
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        {...(spec.caption === undefined ? {} : { 'aria-describedby': captionId })}
        data-setting={spec.key}
        disabled={disabled}
        onClick={() => onToggle(spec.key, !checked)}
        className="grid shrink-0 place-items-center rounded-chip focus-visible:outline-2"
        style={{ minWidth: 56, minHeight: 44, outlineColor: 'var(--color-ios-brand)', opacity: disabled ? 0.5 : 1 }}
      >
        <Switch checked={checked} />
      </button>
    </div>
  );
}

function Toggles({
  language,
  view,
  specs,
  disabled,
  onToggle,
  onRetry,
}: {
  readonly language: InterfaceLanguage;
  readonly view: PreferencesView;
  readonly specs: readonly ToggleSpec[];
  readonly disabled: boolean;
  readonly onToggle: (key: BooleanPreference, value: boolean) => void;
  readonly onRetry: () => void;
}) {
  if (view.kind === 'loading') {
    return (
      <div aria-busy="true" data-settings-loading className="grid">
        <span className="sr-only">{translate(language, 'settings.loading')}</span>
        {specs.map((spec) => (
          <span key={spec.key} aria-hidden="true" className="mx-3.5 my-2.5 block rounded-chip" style={{ height: 32, ...SECTION_CARD_STYLE }} />
        ))}
      </div>
    );
  }
  if (view.kind === 'error') {
    return (
      <div data-settings-error className="flex flex-wrap items-center gap-3 px-3.5 py-3">
        <span aria-hidden="true" style={{ color: 'var(--color-error)' }}>
          <Glyph name="warningCircle" size={18} />
        </span>
        <span className="min-w-0 flex-1 text-body font-medium" style={{ color: SECTION_INK }}>
          {translate(language, 'settings.error.title')}
        </span>
        <button
          type="button"
          data-settings-retry
          onClick={onRetry}
          className={`grid place-items-center rounded-chip px-3 text-caption font-semibold focus-visible:outline-2 ${SECTION_BRAND_INK}`}
          style={{ minHeight: 44, outlineColor: 'var(--color-ios-brand)' }}
        >
          {translate(language, 'settings.retry')}
        </button>
      </div>
    );
  }
  return (
    <>
      {specs.map((spec) => (
        <ToggleRow key={spec.key} language={language} spec={spec} checked={view.preferences[spec.key]} disabled={disabled} onToggle={onToggle} />
      ))}
    </>
  );
}

const PRIVACY_TOGGLES = [
  {
    key: 'showOnlineStatus',
    label: 'settings.privacy.online_status',
    caption: 'settings.privacy.online_status.info',
    icon: { set: 'ecran', name: 'circle' },
    tint: 'var(--color-success)',
  },
  { key: 'showLastSeen', label: 'settings.privacy.last_seen', icon: { set: 'socle', name: 'clock' }, tint: 'var(--ios-indigo-400)' },
  {
    key: 'showReadReceipts',
    label: 'settings.privacy.read_receipts',
    caption: 'settings.privacy.read_receipts.info',
    icon: { set: 'socle', name: 'checks' },
    tint: 'var(--color-ios-brand)',
  },
  { key: 'showTypingIndicator', label: 'settings.privacy.typing_indicator', icon: { set: 'ecran', name: 'keyboard' }, tint: 'var(--ios-indigo-300)' },
] as const satisfies readonly ToggleSpec[];

const NOTIFICATION_TOGGLES = [
  { key: 'pushEnabled', label: 'settings.notifications.title', icon: { set: 'ecran', name: 'bellRinging' }, tint: 'var(--color-error)' },
  { key: 'soundEnabled', label: 'settings.notif.sounds', icon: { set: 'ecran', name: 'speakerHigh' }, tint: 'var(--ios-indigo-300)' },
] as const satisfies readonly ToggleSpec[];

type PreferenceSectionProps = {
  readonly language: InterfaceLanguage;
  readonly view: PreferencesView;
  readonly disabled: boolean;
  readonly onToggle: (key: BooleanPreference, value: boolean) => void;
  readonly onRetry: () => void;
};

/* Les options FINES de confidentialité et de notification n'ont plus
   d'adresse depuis le décommissionnement du legacy (#6702) : leur rangée
   « Plus d'options » est MASQUÉE jusqu'à leur portage — jamais une rangée qui
   ne mène nulle part (loi 4). */
export function PrivacySection({ language, view, disabled, onToggle, onRetry }: PreferenceSectionProps) {
  return (
    <GroupedSection id="settings-privacy" title={upper(language, 'settings.privacy.title')} icon={SECTION_ICON({ set: 'socle', name: 'lock' })}>
      <Toggles language={language} view={view} specs={PRIVACY_TOGGLES} disabled={disabled} onToggle={onToggle} onRetry={onRetry} />
    </GroupedSection>
  );
}

export function NotificationsSection({ language, view, disabled, onToggle, onRetry }: PreferenceSectionProps) {
  return (
    <GroupedSection id="settings-notifications" title={upper(language, 'settings.section.notifications')} icon={SECTION_ICON({ set: 'socle', name: 'bell' })}>
      <Toggles language={language} view={view} specs={NOTIFICATION_TOGGLES} disabled={disabled} onToggle={onToggle} onRetry={onRetry} />
    </GroupedSection>
  );
}

const THEME_CHOICES = [
  { preference: 'system', label: 'settings.theme.auto', glyph: 'circleHalf' },
  { preference: 'light', label: 'settings.theme.light', glyph: 'sun' },
  { preference: 'dark', label: 'settings.theme.dark', glyph: 'moon' },
] as const satisfies ReadonlyArray<{ readonly preference: ThemePreference; readonly label: SettingsKey; readonly glyph: SettingsGlyphName }>;

const endonym = (code: string): string => {
  const info = getLanguageInfo(code);
  return info.nativeName ?? info.name;
};

const interfaceChoiceOf = (value: string): InterfaceLanguage | null => SUPPORTED_INTERFACE_LANGUAGES.find((code) => code === value) ?? null;

export function AppearanceSection({
  language,
  theme,
  onTheme,
  interfaceChoice,
  onInterfaceLanguage,
  primaryLanguage,
}: {
  readonly language: InterfaceLanguage;
  readonly theme: ThemePreference;
  readonly onTheme: (preference: ThemePreference) => void;
  readonly interfaceChoice: InterfaceLanguage | null;
  readonly onInterfaceLanguage: (choice: InterfaceLanguage | null) => void;
  readonly primaryLanguage: string | null;
}) {
  const themeLabel = translate(language, 'settings.theme');
  const current = THEME_CHOICES.find((choice) => choice.preference === theme) ?? THEME_CHOICES[0];
  const interfaceLabel = translate(language, 'settings.interface_language');
  return (
    <GroupedSection id="settings-appearance" title={upper(language, 'settings.section.appearance')} icon={SECTION_ICON({ set: 'ecran', name: 'paintBrush' })}>
      <div className="grid gap-2.5 px-3.5 py-2.5">
        <div className="flex items-center gap-3">
          <RowIcon tint="var(--color-warning)">
            <GlyphSvg glyph={SETTINGS_GLYPHS[current.glyph]} size={15} />
          </RowIcon>
          <RowText label={themeLabel} />
        </div>
        <div role="group" aria-label={themeLabel} className="grid grid-cols-3 gap-1.5">
          {THEME_CHOICES.map(({ preference, label, glyph }) => {
            const pressed = preference === theme;
            return (
              <button
                key={preference}
                type="button"
                aria-pressed={pressed}
                data-theme-choice={preference}
                onClick={() => onTheme(preference)}
                className="flex items-center justify-center gap-1.5 rounded-chip px-2 text-caption font-semibold focus-visible:outline-2"
                style={{
                  minHeight: 44,
                  outlineColor: 'var(--color-ios-brand)',
                  color: pressed ? 'white' : SECTION_INK,
                  backgroundColor: pressed ? 'var(--ios-indigo-600)' : 'color-mix(in srgb, var(--color-ios-ink-3) 14%, transparent)',
                }}
              >
                <span aria-hidden="true">
                  <GlyphSvg glyph={SETTINGS_GLYPHS[glyph]} size={14} />
                </span>
                {translate(language, label)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5" style={{ minHeight: 52 }}>
        <RowIcon tint="var(--ios-indigo-600)">
          <GlyphSvg glyph={SETTINGS_GLYPHS.globe} size={15} />
        </RowIcon>
        <RowText label={interfaceLabel} />
        <select
          aria-label={interfaceLabel}
          data-interface-language
          value={interfaceChoice ?? ''}
          onChange={(event) => onInterfaceLanguage(interfaceChoiceOf(event.currentTarget.value))}
          className={`ms-auto rounded-chip px-3 text-caption font-semibold focus-visible:outline-2 ${SECTION_BRAND_INK}`}
          style={{
            minHeight: 44,
            outlineColor: 'var(--color-ios-brand)',
            backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 14%, transparent)',
          }}
        >
          <option value="">{translate(language, 'settings.interface_language.automatic')}</option>
          {SUPPORTED_INTERFACE_LANGUAGES.map((code) => (
            <option key={code} value={code} lang={code}>
              {endonym(code)}
            </option>
          ))}
        </select>
      </div>
      <Link to="profile" data-settings-content-languages className={ROW_CLASS} style={ROW_STYLE}>
        <RowIcon tint="var(--ios-indigo-400)">
          <Glyph name="translate" size={15} />
        </RowIcon>
        <RowText label={translate(language, 'settings.content_languages')} />
        {primaryLanguage === null ? null : (
          <span lang={primaryLanguage} className="shrink-0 text-caption font-medium" style={{ color: SECTION_INK_2 }}>
            {endonym(primaryLanguage)}
          </span>
        )}
        <Chevron />
      </Link>
    </GroupedSection>
  );
}

/**
 * `showAdmin` — l'ENTRÉE de l'espace d'administration (#6432).
 *
 * Elle n'apparaît que pour qui y a droit, et le droit vient du SERVEUR
 * (`GET /me/permissions`, résolu par l'écran hôte) : `SessionUser` ne projette
 * pas `role`, donc rien ici ne peut le déduire.
 *
 * **Cacher la rangée n'est PAS la garde.** L'écran `/admin` refait la lecture
 * pour lui-même — on y entre aussi par un lien profond, et une porte gardée
 * seulement par l'absence de son bouton n'est pas gardée. Cette rangée ne fait
 * que la DÉCOUVERTE ; c'est la raison pour laquelle son absence, en cas
 * d'erreur réseau, ne coûte qu'un chemin d'accès et jamais une fuite.
 */
export function ToolsSection({ language, showAdmin = false }: { readonly language: InterfaceLanguage; readonly showAdmin?: boolean }) {
  return (
    <GroupedSection id="settings-tools" title={upper(language, 'settings.section.tools')} icon={SECTION_ICON({ set: 'ecran', name: 'wrench' })}>
      <Link to="progression" data-settings-progression className={ROW_CLASS} style={ROW_STYLE}>
        <RowIcon tint="var(--color-warning)">
          <Glyph name="trophy" size={15} />
        </RowIcon>
        <RowText label={translate(language, 'settings.tools.progression')} />
        <Chevron />
      </Link>
      {showAdmin ? (
        <Link to="admin" data-settings-admin className={ROW_CLASS} style={ROW_STYLE}>
          <RowIcon tint="var(--color-ios-brand)">
            <Glyph name="key" size={15} />
          </RowIcon>
          <RowText label={translate(language, 'admin.title')} />
          <Chevron />
        </Link>
      ) : null}
    </GroupedSection>
  );
}

function DocumentRow({ href, label, glyph }: { readonly href: string; readonly label: string; readonly glyph: SettingsGlyphName }) {
  return (
    <a href={href} className={ROW_CLASS} style={ROW_STYLE}>
      <RowIcon tint="var(--ios-indigo-400)">
        <GlyphSvg glyph={SETTINGS_GLYPHS[glyph]} size={15} />
      </RowIcon>
      <RowText label={label} />
      <Chevron />
    </a>
  );
}

export function AboutSection({ language, version }: { readonly language: InterfaceLanguage; readonly version: string }) {
  return (
    <GroupedSection id="settings-about" title={upper(language, 'settings.section.about')} icon={SECTION_ICON({ set: 'ecran', name: 'info' })}>
      <DocumentRow href="/terms" label={translate(language, 'settings.terms')} glyph="fileText" />
      <DocumentRow href="/privacy" label={translate(language, 'settings.privacy_policy')} glyph="handPalm" />
      <div className="flex items-center gap-3 px-3.5 py-2.5" style={{ minHeight: 52 }}>
        <RowIcon tint="var(--color-warning)">
          <GlyphSvg glyph={SETTINGS_GLYPHS.sparkle} size={15} />
        </RowIcon>
        <RowText label={translate(language, 'settings.version')} />
        <span dir="ltr" data-settings-version className="shrink-0 text-caption font-medium" style={{ color: SECTION_INK_2 }}>
          {version}
        </span>
      </div>
    </GroupedSection>
  );
}

export function LogoutButton({ language, busy, onPress }: { readonly language: InterfaceLanguage; readonly busy: boolean; readonly onPress: () => void }) {
  return (
    <button
      type="button"
      data-settings-logout
      disabled={busy}
      aria-busy={busy}
      onClick={onPress}
      className="flex w-full items-center justify-center gap-2 rounded-card px-4 text-body font-semibold focus-visible:outline-2"
      style={{
        minHeight: 52,
        color: 'var(--color-danger)',
        outlineColor: 'var(--color-danger)',
        backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)',
        opacity: busy ? 0.7 : 1,
      }}
    >
      <span aria-hidden="true">
        <GlyphSvg glyph={SETTINGS_GLYPHS.signOut} size={18} />
      </span>
      {translate(language, busy ? 'settings.logout.inprogress' : 'settings.logout.title')}
    </button>
  );
}

export function SettingsOfflineNotice({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div role="status" data-settings-offline className="flex items-start gap-3 rounded-card px-3.5 py-3" style={SECTION_CARD_STYLE}>
      <span aria-hidden="true" className="pt-0.5" style={{ color: 'var(--color-warning)' }}>
        <Glyph name="warningCircle" size={18} />
      </span>
      <span className="text-caption" style={{ color: SECTION_INK }}>
        {translate(language, 'settings.offline.body')}
      </span>
    </div>
  );
}

/** Le contenu défilant : la réserve du couloir, puis les sections espacées comme `SettingsView`. */
export function SettingsContent({ children }: { readonly children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-xl gap-6 pb-24" style={{ paddingTop: SETTINGS_TOP_RESERVE + 8 }}>
      {children}
    </div>
  );
}
