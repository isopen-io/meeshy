import type { ReactNode } from 'react';

import { Avatar } from '@/components/avatar';
import { Glyph } from '@/components/glyph';
import type { GlyphName } from '@/components/glyphs';
import type { LinksGlyphName } from '@/components/glyphs-links';
import { RowIcon, SECTION_BRAND_INK, SECTION_CARD_STYLE, SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';
import { Sheet, SheetEmpty } from '@/components/sheet';
import { MAX_USES_CEILING, SHARE_LINK_EXPIRATIONS, type ShareLinkDraft, type ShareLinkExpiration } from '@/lib/api/links';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';
import { BRAND_BUTTON_STYLE, LinksGlyph, SHARE_TINT } from '@/routes/links-parts';
import { colorForName } from '@meeshy/shared/utils/conversation-colors';

/**
 * **LES PIÈCES DE LA CRÉATION D'UN LIEN** (#6361) — miroir de
 * `CreateShareLinkView.swift` : conversation, identité, accès invités,
 * permissions, limites, bouton.
 *
 * **Le « Slug URL » d'iOS n'est pas repris** : la passerelle ne lit pas
 * `identifier` à la création (`createLinkSchema`), le champ n'aurait aucun
 * effet (loi 4, D-63, #6412). **« Compte requis » grise les trois exigences voisines**
 * ET les montre éteintes : c'est ce qui part (`validateShareLinkDraft`), iOS
 * les grise en gardant leur état affiché.
 */

const INK = SECTION_INK;
const INK_2 = SECTION_INK_2;
const BRAND = 'var(--color-ios-brand)';
const ROW_DIVIDER = '[&>*+*]:border-t [&>*+*]:border-[color-mix(in_srgb,var(--color-ios-ink-3)_18%,transparent)]';

/**
 * **LE TYPE JETAIT LA PHOTO** (#6975) — `{ id, title }` : deux champs, donc
 * deux initiales, quelle que soit la richesse de la conversation projetée.
 * `avatar` est OPTIONNEL parce que la plupart des conversations n'en ont pas,
 * jamais parce que la valeur serait facultative à transporter : son producteur
 * unique (`share-link-new.tsx`) la descend par `avatarOf`.
 */
export type PickableConversation = { readonly id: string; readonly title: string; readonly avatar?: string };

export type RuleKey = Extract<
  keyof ShareLinkDraft,
  'requireAccount' | 'requireNickname' | 'requireEmail' | 'requireBirthday' | 'allowAnonymousMessages' | 'allowAnonymousImages' | 'allowAnonymousFiles' | 'allowViewHistory'
>;
type RuleTextKey = Extract<InterfaceCatalogKey, `links.create.access.${string}` | `links.create.permission.${string}`>;
type RuleGlyph = { readonly set: 'socle'; readonly name: GlyphName } | { readonly set: 'links'; readonly name: LinksGlyphName };
type RuleSpec = { readonly key: RuleKey; readonly label: RuleTextKey; readonly caption: RuleTextKey; readonly glyph: RuleGlyph; readonly tint: string };

export const ACCESS_RULES: readonly RuleSpec[] = [
  { key: 'requireAccount', label: 'links.create.access.account', caption: 'links.create.access.account.caption', glyph: { set: 'links', name: 'userCheck' }, tint: SHARE_TINT },
  { key: 'requireNickname', label: 'links.create.access.nickname', caption: 'links.create.access.nickname.caption', glyph: { set: 'socle', name: 'user' }, tint: 'var(--ios-indigo-600)' },
  { key: 'requireEmail', label: 'links.create.access.email', caption: 'links.create.access.email.caption', glyph: { set: 'links', name: 'envelopeSimple' }, tint: 'var(--color-warning)' },
  { key: 'requireBirthday', label: 'links.create.access.birthday', caption: 'links.create.access.birthday.caption', glyph: { set: 'links', name: 'calendarBlank' }, tint: 'var(--color-warning)' },
];

export const PERMISSION_RULES: readonly RuleSpec[] = [
  { key: 'allowAnonymousMessages', label: 'links.create.permission.messages', caption: 'links.create.permission.messages.caption', glyph: { set: 'links', name: 'chatCircle' }, tint: SHARE_TINT },
  { key: 'allowAnonymousImages', label: 'links.create.permission.images', caption: 'links.create.permission.images.caption', glyph: { set: 'socle', name: 'image' }, tint: 'var(--ios-indigo-400)' },
  { key: 'allowAnonymousFiles', label: 'links.create.permission.files', caption: 'links.create.permission.files.caption', glyph: { set: 'links', name: 'paperclip' }, tint: 'var(--ios-indigo-600)' },
  { key: 'allowViewHistory', label: 'links.create.permission.history', caption: 'links.create.permission.history.caption', glyph: { set: 'links', name: 'clockCounterClockwise' }, tint: 'var(--color-warning)' },
];

const EXPIRATION_KEY: Readonly<Record<ShareLinkExpiration, Extract<InterfaceCatalogKey, `links.create.expiration.${string}`>>> = {
  never: 'links.create.expiration.never',
  h24: 'links.create.expiration.h24',
  d7: 'links.create.expiration.d7',
  d30: 'links.create.expiration.d30',
  m3: 'links.create.expiration.m3',
};

const expirationOf = (value: string): ShareLinkExpiration => SHARE_LINK_EXPIRATIONS.find((option) => option === value) ?? 'never';

function RuleIcon({ glyph }: { readonly glyph: RuleGlyph }) {
  return glyph.set === 'socle' ? <Glyph name={glyph.name} size={15} /> : <LinksGlyph name={glyph.name} size={15} />;
}

export function FormSection({
  id,
  title,
  subtitle,
  icon,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly icon: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid gap-2">
      <div className="grid gap-0.5 ps-1">
        <h2 id={id} className={`flex items-center gap-1.5 text-check font-bold uppercase tracking-wide ${SECTION_BRAND_INK}`}>
          <span aria-hidden="true">{icon}</span>
          {title}
        </h2>
        {subtitle === null ? null : (
          <p className="text-caption" style={{ color: INK_2 }}>
            {subtitle}
          </p>
        )}
      </div>
      <div className={`grid overflow-hidden rounded-card ${ROW_DIVIDER}`} style={SECTION_CARD_STYLE}>
        {children}
      </div>
    </section>
  );
}

function Switch({ checked }: { readonly checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative block rounded-chip"
      style={{ width: 51, height: 31, backgroundColor: checked ? BRAND : 'color-mix(in srgb, var(--color-ios-ink-3) 45%, transparent)', transition: 'background-color 160ms ease' }}
    >
      <span
        className="absolute block rounded-chip"
        style={{ top: 2, insetInlineStart: checked ? 22 : 2, width: 27, height: 27, backgroundColor: 'white', boxShadow: '0 1px 3px rgb(0 0 0 / 0.3)', transition: 'inset-inline-start 160ms ease' }}
      />
    </span>
  );
}

export function RuleToggle({
  id,
  label,
  caption,
  icon,
  tint,
  checked,
  disabled,
  onToggle,
}: {
  readonly id: string;
  readonly label: string;
  readonly caption: string;
  readonly icon: ReactNode;
  readonly tint: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onToggle: (next: boolean) => void;
}) {
  const captionId = `link-rule-${id}-caption`;
  return (
    <div data-link-rule-row={id} className="flex items-center gap-3 px-3.5 py-2.5" style={{ minHeight: 60, opacity: disabled ? 0.45 : 1 }}>
      <RowIcon tint={tint}>{icon}</RowIcon>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-body font-medium" style={{ color: INK }}>
          {label}
        </span>
        <span id={captionId} className="text-caption" style={{ color: INK_2 }}>
          {caption}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={captionId}
        data-link-rule={id}
        disabled={disabled}
        onClick={() => onToggle(!checked)}
        className="grid shrink-0 place-items-center rounded-chip focus-visible:outline-2"
        style={{ minWidth: 56, minHeight: 44, outlineColor: BRAND }}
      >
        <Switch checked={checked} />
      </button>
    </div>
  );
}

/** Une section de bascules — « compte requis » grise et éteint les trois exigences voisines. */
export function RulesSection({
  language,
  id,
  title,
  subtitle,
  icon,
  rules,
  draft,
  onToggle,
}: {
  readonly language: InterfaceLanguage;
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: ReactNode;
  readonly rules: readonly RuleSpec[];
  /** Les huit bascules seulement : la création (`ShareLinkDraft`) et l'édition
   * (`ShareLinkEditDraft`, #7797) les portent toutes deux. */
  readonly draft: Pick<ShareLinkDraft, RuleKey>;
  readonly onToggle: (key: RuleKey, next: boolean) => void;
}) {
  return (
    <FormSection id={id} title={title} subtitle={subtitle} icon={icon}>
      {rules.map((rule) => {
        const overridden = draft.requireAccount && ACCESS_RULES.some((access) => access.key === rule.key) && rule.key !== 'requireAccount';
        return (
          <RuleToggle
            key={rule.key}
            id={rule.key}
            label={translate(language, rule.label)}
            caption={translate(language, rule.caption)}
            icon={<RuleIcon glyph={rule.glyph} />}
            tint={rule.tint}
            checked={draft[rule.key] && !overridden}
            disabled={overridden}
            onToggle={(next) => onToggle(rule.key, next)}
          />
        );
      })}
    </FormSection>
  );
}

export function TextRow({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="grid gap-0.5 px-3.5 pt-2 focus-within:outline-2 focus-within:-outline-offset-2" style={{ outlineColor: BRAND }}>
      <span className="text-chip font-medium" style={{ color: INK_2 }}>
        {label}
      </span>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => onChange(event.currentTarget.value)}
        className="min-w-0 bg-transparent text-body outline-none"
        style={{ minHeight: 44, color: INK }}
      />
    </label>
  );
}

/** Miroir `CreateShareLinkView.conversationSection` — ouvre le choix, jamais un DM. */
export function ConversationChoice({
  language,
  conversation,
  invalid,
  onOpen,
}: {
  readonly language: InterfaceLanguage;
  readonly conversation: PickableConversation | null;
  readonly invalid: boolean;
  readonly onOpen: () => void;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-invalid={invalid}
      data-link-conversation={conversation?.id ?? ''}
      onClick={onOpen}
      className="flex w-full min-w-0 items-center gap-3 px-3.5 py-2.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
      style={{ minHeight: 60, outlineColor: BRAND }}
    >
      {conversation === null ? (
        <span aria-hidden="true" style={{ color: SHARE_TINT }}>
          <LinksGlyph name="plusCircle" size={26} />
        </span>
      ) : (
        <span aria-hidden="true">
          <Avatar
            initials={initialsOf(conversation.title)}
            color={colorForName(conversation.title)}
            size={34}
            {...(conversation.avatar === undefined ? {} : { src: conversation.avatar })}
          />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-body" style={{ color: conversation === null ? INK_2 : INK, fontWeight: conversation === null ? 400 : 600 }}>
        {conversation?.title ?? translate(language, 'links.create.choose')}
      </span>
      <span aria-hidden="true" style={{ color: INK_2 }}>
        <LinksGlyph name="caretRight" size={14} />
      </span>
    </button>
  );
}

/** Miroir `ConversationPickerSheet` — les conversations qui PEUVENT recevoir un lien (`canCreateShareLink`). */
export function ConversationPicker({
  language,
  conversations,
  onPick,
  onClose,
}: {
  readonly language: InterfaceLanguage;
  readonly conversations: readonly PickableConversation[];
  readonly onPick: (conversation: PickableConversation) => void;
  readonly onClose: () => void;
}) {
  return (
    <Sheet title={translate(language, 'links.create.picker.title')} onClose={onClose}>
      {conversations.length === 0 ? (
        <SheetEmpty label={translate(language, 'links.create.picker.empty')} />
      ) : (
        conversations.map((conversation) => (
          <li key={conversation.id}>
            <button
              type="button"
              data-link-pick={conversation.id}
              onClick={() => onPick(conversation)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
              style={{ minHeight: 52, outlineColor: BRAND }}
            >
              <span aria-hidden="true">
                <Avatar
                  initials={initialsOf(conversation.title)}
                  color={colorForName(conversation.title)}
                  size={34}
                  {...(conversation.avatar === undefined ? {} : { src: conversation.avatar })}
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-body font-medium" style={{ color: INK }}>
                {conversation.title}
              </span>
            </button>
          </li>
        ))
      )}
    </Sheet>
  );
}

/** Miroir `CreateShareLinkView.limitsSection` — limite d'utilisations et expiration. */
export function LimitsFields({
  language,
  draft,
  maxUsesInvalid,
  onLimitUses,
  onMaxUses,
  onExpiration,
}: {
  readonly language: InterfaceLanguage;
  readonly draft: ShareLinkDraft;
  readonly maxUsesInvalid: boolean;
  readonly onLimitUses: (next: boolean) => void;
  readonly onMaxUses: (value: number) => void;
  readonly onExpiration: (value: ShareLinkExpiration) => void;
}) {
  const count = new Intl.NumberFormat(language).format(draft.maxUses);
  const caption = draft.limitUses
    ? translate(language, draft.maxUses === 1 ? 'links.create.limit.max.one' : 'links.create.limit.max.other', { count: Number.isFinite(draft.maxUses) ? count : '—' })
    : translate(language, 'links.unlimited');
  return (
    <>
      <RuleToggle
        id="limitUses"
        label={translate(language, 'links.create.limit.uses')}
        caption={caption}
        icon={<Glyph name="users" size={15} />}
        tint={SHARE_TINT}
        checked={draft.limitUses}
        disabled={false}
        onToggle={onLimitUses}
      />
      {draft.limitUses ? (
        <div className="grid">
          <label htmlFor="link-max-uses" className="flex items-center gap-3 px-3.5 py-1.5 focus-within:outline-2 focus-within:-outline-offset-2" style={{ outlineColor: BRAND }}>
            <span className="min-w-0 flex-1 text-body" style={{ color: INK }}>
              {translate(language, 'links.create.limit.count')}
            </span>
            <input
              id="link-max-uses"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_USES_CEILING}
              step={1}
              value={Number.isFinite(draft.maxUses) ? String(draft.maxUses) : ''}
              aria-invalid={maxUsesInvalid}
              {...(maxUsesInvalid ? { 'aria-describedby': 'link-max-uses-error' } : {})}
              onChange={(event) => onMaxUses(event.currentTarget.valueAsNumber)}
              className={`w-24 bg-transparent text-end text-body font-bold outline-none ${SECTION_BRAND_INK}`}
              style={{ minHeight: 44 }}
            />
          </label>
          {maxUsesInvalid ? (
            <p id="link-max-uses-error" role="alert" className="px-3.5 pb-2 text-caption font-medium" style={{ color: 'var(--color-error)' }}>
              {translate(language, 'links.create.limit.invalid', { max: new Intl.NumberFormat(language).format(MAX_USES_CEILING) })}
            </p>
          ) : null}
        </div>
      ) : null}
      <label htmlFor="link-expiration" className="flex items-center gap-3 px-3.5 py-1.5 focus-within:outline-2 focus-within:-outline-offset-2" style={{ outlineColor: BRAND }}>
        <RowIcon tint="var(--color-warning)">
          <LinksGlyph name="hourglass" size={15} />
        </RowIcon>
        <span className="min-w-0 flex-1 text-body font-medium" style={{ color: INK }}>
          {translate(language, 'links.create.expiration')}
        </span>
        <select
          id="link-expiration"
          value={draft.expiration}
          onChange={(event) => onExpiration(expirationOf(event.currentTarget.value))}
          className={`rounded-chip bg-transparent text-body font-semibold outline-none ${SECTION_BRAND_INK}`}
          style={{ minHeight: 44 }}
        >
          {SHARE_LINK_EXPIRATIONS.map((option) => (
            <option key={option} value={option}>
              {translate(language, EXPIRATION_KEY[option])}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export function CreateLinkButton({ language, submitting, disabled }: { readonly language: InterfaceLanguage; readonly submitting: boolean; readonly disabled: boolean }) {
  return (
    <button
      type="submit"
      data-link-submit
      disabled={disabled}
      aria-disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-card text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ ...BRAND_BUTTON_STYLE, minHeight: 50, opacity: disabled ? 0.55 : 1 }}
    >
      <LinksGlyph name="link" size={18} />
      {translate(language, submitting ? 'links.create.inprogress' : 'links.create.button')}
    </button>
  );
}
