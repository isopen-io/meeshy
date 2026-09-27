import { Avatar } from '@/components/avatar';
import { Glyph } from '@/components/glyph';
import type { DeviceAccount } from '@/lib/api/accounts';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';

/**
 * LA LISTE DES COMPTES DE L'APPAREIL (#8286) — la MÊME sur l'écran de
 * connexion et dans « Changer de compte », miroir de `savedAccountRow`
 * (`LoginView.swift`) et de `AccountSwitcherSheet.swift` : avatar, nom,
 * @pseudo. Un compte GARDÉ s'ouvre sans mot de passe et le dit (« Connecté ») ;
 * le compte actuel le dit aussi, et ne se choisit pas.
 */
export function DeviceAccountList({
  language,
  accounts,
  activeId,
  isPreserved,
  onChoose,
  onForget,
}: {
  readonly language: InterfaceLanguage;
  readonly accounts: readonly DeviceAccount[];
  readonly activeId: string | null;
  readonly isPreserved: (userId: string) => boolean;
  readonly onChoose: (account: DeviceAccount) => void;
  /** Absent : la liste ne propose pas de retirer un compte (le compte actuel
   * n'en a jamais la croix). */
  readonly onForget?: (account: DeviceAccount) => void;
}) {
  return (
    <ul aria-label={translate(language, 'accounts.list.label')} data-device-accounts className="grid w-full gap-2.5">
      {accounts.map((account) => {
        const name = account.user.displayName ?? account.user.username;
        const isActive = account.user.id === activeId;
        const status = isActive
          ? translate(language, 'accounts.row.current')
          : isPreserved(account.user.id)
            ? translate(language, 'accounts.row.signed_in')
            : null;
        return (
          <li key={account.user.id} className="flex items-center gap-2">
            <button
              type="button"
              data-device-account={account.user.username}
              aria-current={isActive ? 'true' : undefined}
              disabled={isActive}
              onClick={() => onChoose(account)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-[14px] px-4 py-3 text-start focus-visible:outline-2"
              style={{
                minHeight: 60,
                backgroundColor: 'var(--color-ios-card)',
                border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 25%, transparent)',
                outlineColor: 'var(--color-ios-brand)',
              }}
            >
              <Avatar initials={initialsOf(name)} color="var(--color-ios-brand)" size={44} {...(account.user.avatar ? { src: account.user.avatar } : {})} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
                  {name}
                </span>
                <span className="truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                  {`@${account.user.username}`}
                </span>
              </span>
              {status === null ? null : (
                <span className="flex shrink-0 items-center gap-1 text-caption font-semibold" style={{ color: 'var(--color-ios-brand)' }}>
                  {isActive ? <Glyph name="check" size={14} /> : null}
                  {status}
                </span>
              )}
            </button>
            {onForget === undefined || isActive ? null : (
              <button
                type="button"
                data-device-account-forget={account.user.username}
                aria-label={translate(language, 'accounts.row.forget', { name })}
                onClick={() => onForget(account)}
                className="grid shrink-0 place-items-center rounded-full focus-visible:outline-2"
                style={{ width: 44, height: 44, color: 'var(--color-ios-ink-2)', outlineColor: 'var(--color-ios-brand)' }}
              >
                <Glyph name="x" size={16} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
