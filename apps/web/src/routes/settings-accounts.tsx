import { useEffect, useState } from 'react';

import { DeviceAccountList } from '@/components/device-account-list';
import { Glyph } from '@/components/glyph';
import { Sheet } from '@/components/sheet';
import type { AccountSwitcher, AccountVault, DeviceAccount } from '@/lib/api/accounts';
import type { SessionUser } from '@/lib/api/session';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * « CHANGER DE COMPTE » (#8286) — miroir de `switchAccountSection` et
 * `AccountSwitcherSheet` (`SettingsView.swift`). DEUX gestes distincts sur
 * l'écran des réglages : celui-ci GARDE les sessions ; « Déconnexion » ferme
 * celle du compte actuel et en efface les données locales.
 */

/** L'habit NEUTRE de `switchAccountSection` : rien n'est perdu, il n'a donc
 * pas la couleur de la destruction que porte « Déconnexion » juste dessous. */
export function SwitchAccountButton({ language, onPress }: { readonly language: InterfaceLanguage; readonly onPress: () => void }) {
  return (
    <button
      type="button"
      data-settings-switch-account
      onClick={onPress}
      className="flex w-full items-center justify-center gap-2 rounded-card px-4 text-body font-semibold focus-visible:outline-2"
      style={{
        minHeight: 52,
        color: 'var(--color-ios-ink)',
        outlineColor: 'var(--color-ios-brand)',
        backgroundColor: 'var(--color-ios-card)',
        border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 25%, transparent)',
      }}
    >
      <span aria-hidden="true">
        <Glyph name="users" size={18} />
      </span>
      {translate(language, 'settings.switch_account.title')}
    </button>
  );
}

export function AccountSwitcherSheet({
  language,
  accounts,
  activeUser,
  onClose,
  onSwitched,
  onSignInRequired,
}: {
  readonly language: InterfaceLanguage;
  readonly accounts: { readonly vault: AccountVault; readonly switcher: AccountSwitcher };
  readonly activeUser: SessionUser;
  readonly onClose: () => void;
  /** La session a changé de compte : l'hôte ramène à l'accueil. */
  readonly onSwitched: () => void;
  /** Le compte actuel est GARDÉ et l'appareil revient à la connexion —
   * identifiant prérempli pour un compte connu, `null` pour en ajouter un. */
  readonly onSignInRequired: (username: string | null) => void;
}) {
  const [list, setList] = useState<readonly DeviceAccount[]>(() => accounts.vault.list());

  useEffect(() => {
    accounts.vault.noteActive(activeUser);
    setList(accounts.vault.list());
  }, [accounts.vault, activeUser.id]);

  const choose = (account: DeviceAccount) => {
    if (accounts.switcher.switchTo(account.user.id) === 'switched') {
      onSwitched();
      return;
    }
    accounts.switcher.suspend();
    onSignInRequired(account.user.username);
  };

  const add = () => {
    accounts.switcher.suspend();
    onSignInRequired(null);
  };

  return (
    <Sheet title={translate(language, 'settings.switch_account.title')} bodyAs="div" onClose={onClose}>
      <div className="grid gap-3 px-4 pb-6 pt-1">
        <DeviceAccountList
          language={language}
          accounts={list}
          activeId={activeUser.id}
          isPreserved={accounts.vault.hasPreservedSession}
          onChoose={choose}
        />
        <button
          type="button"
          data-accounts-add
          onClick={add}
          className="flex items-center justify-center gap-2 rounded-[14px] px-4 text-body font-semibold focus-visible:outline-2"
          style={{ minHeight: 52, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <span aria-hidden="true">
            <Glyph name="plus" size={16} />
          </span>
          {translate(language, 'accounts.add')}
        </button>
      </div>
    </Sheet>
  );
}
