import { useState } from 'react';

import { Sheet } from '@/components/sheet';
import type { AdminDeps } from '@/lib/api/admin';
import {
  updateAdminUserSecurity,
  updateAdminUserVerifications,
  type AdminUserVerificationsChange,
} from '@/lib/api/admin-user-actions';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { ActionButton } from '@/routes/link-page-parts';

/**
 * **SÉCURITÉ ET VÉRIFICATIONS D'UN COMPTE** (#7845) — les deux familles
 * d'écriture que `users-write.ts` tient à part de l'édition du profil, parce
 * qu'elles ne coûtent pas la même chose : déverrouiller un compte, retirer sa
 * double authentification, poser ou retirer une preuve (e-mail, téléphone,
 * âge).
 *
 * ## Chaque geste se CONFIRME
 *
 * Premier appui : « Confirmer », ton danger. Second : l'écriture. Désarmer la
 * double authentification d'un compte est le premier maillon d'une prise de
 * contrôle ; poser « âge vérifié » ouvre des surfaces au membre. Aucun des deux
 * ne doit partir d'un seul effleurement.
 *
 * ## On ne propose que ce qui a un effet
 *
 * « Déverrouiller » n'existe que sur un compte verrouillé ; « désactiver la
 * double authentification » que sur un compte qui l'a. L'ARMER depuis
 * l'administration n'a pas de sens : sans secret enrôlé par le membre, le
 * second facteur n'existerait que de nom.
 *
 * ## La réponse EST le membre à jour
 *
 * Les deux routes rendent la fiche sanitisée : l'hôte l'écrit dans son cache
 * (`onSaved`) plutôt que de relire.
 */

const INK2 = 'var(--color-ios-ink-2)';
const BRAND = 'var(--color-ios-brand)';
const DANGER = 'var(--color-danger)';
const CONTROLE = { minHeight: 44, backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)', color: 'var(--color-ios-ink)' } as const;

type Geste = 'unlock' | 'twoFactorOff' | 'verifications';

type Preuves = { readonly emailVerified: boolean; readonly phoneVerified: boolean; readonly ageVerified: boolean };

const PREUVES: readonly { readonly cle: keyof Preuves; readonly label: AdminPlainCatalogKey }[] = [
  { cle: 'emailVerified', label: 'admin.user.emailVerified' },
  { cle: 'phoneVerified', label: 'admin.user.phoneVerified' },
  { cle: 'ageVerified', label: 'admin.user.ageVerified' },
];

const preuvesDe = (membre: AdminUserDetail): Preuves => ({
  emailVerified: membre.emailVerifiedAt !== null,
  phoneVerified: membre.phoneVerifiedAt !== null,
  ageVerified: membre.ageVerifiedAt !== null,
});

export function AdminUserAccountSheet({
  membre,
  language,
  onClose,
  onSaved,
  onAnnounce,
  deps = apiDeps,
}: {
  readonly membre: AdminUserDetail;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  readonly onSaved: (membre: AdminUserDetail) => void;
  readonly onAnnounce: (texte: string) => void;
  readonly deps?: AdminDeps;
}) {
  const t = (cle: AdminPlainCatalogKey) => translateAdmin(language, cle);
  const [motif, setMotif] = useState('');
  const [aConfirmer, setAConfirmer] = useState<Geste | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const servies = preuvesDe(membre);
  const [preuves, setPreuves] = useState<Preuves>(servies);

  const changees: AdminUserVerificationsChange = Object.fromEntries(
    PREUVES.filter(({ cle }) => preuves[cle] !== servies[cle]).map(({ cle }) => [cle, preuves[cle]]),
  );
  const verrouille = membre.lockedUntil !== null;
  const reason = motif.trim() === '' ? {} : { reason: motif };

  async function agir(geste: Geste, ecrire: () => Promise<ApiResult<AdminUserDetail>>) {
    if (envoi) return;
    if (aConfirmer !== geste) {
      setAConfirmer(geste);
      return;
    }
    setAConfirmer(null);
    setEnvoi(true);
    const resultat = await ecrire();
    setEnvoi(false);
    if (!resultat.ok) {
      onAnnounce(t('admin.account.failed'));
      return;
    }
    onAnnounce(t('admin.account.done'));
    onSaved(resultat.data);
    onClose();
  }

  /* Le TON dit la nature du geste avant que le libellé ne la dise : couper un
     second facteur ou déverrouiller est un geste de sécurité (`danger`) ;
     enregistrer des preuves de vérification ne l'est pas (`brand`). */
  const bouton = (geste: Geste, libelle: AdminPlainCatalogKey, onPress: () => void, disabled = false, ton: 'danger' | 'brand' = 'danger') => {
    const couleur = ton === 'danger' ? DANGER : BRAND;
    return (
      <button
        type="button"
        data-admin-account-action={geste}
        data-admin-account-tone={ton}
        disabled={disabled || envoi}
        onClick={onPress}
        className="rounded-chip px-4 text-body font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          minHeight: 48,
          outlineColor: couleur,
          color: aConfirmer === geste ? 'white' : couleur,
          backgroundColor: aConfirmer === geste ? couleur : `color-mix(in srgb, ${couleur} 10%, transparent)`,
        }}
      >
        {t(aConfirmer === geste ? 'admin.edit.confirm' : libelle)}
      </button>
    );
  };

  return (
    <Sheet title={t('admin.account.open')} bodyAs="div" onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" data-admin-account-sheet>
        <div className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-caption" style={{ color: INK2 }}>
              {t('admin.edit.reason')}
            </span>
            <input data-admin-account-reason value={motif} onInput={(e) => setMotif(e.currentTarget.value)} className="rounded-chip px-4 text-body" style={CONTROLE} />
          </label>

          <section className="grid gap-2" aria-labelledby="admin-account-security">
            <h3 id="admin-account-security" className="text-caption font-semibold" style={{ color: INK2 }}>
              {t('admin.user.securityTitle')}
            </h3>
            {verrouille
              ? bouton('unlock', 'admin.account.unlock', () =>
                  void agir('unlock', () => updateAdminUserSecurity({ ...deps, userId: membre.id, change: { unlock: true }, ...reason })),
                )
              : null}
            {membre.twoFactorEnabled
              ? bouton('twoFactorOff', 'admin.account.twoFactorOff', () =>
                  void agir('twoFactorOff', () =>
                    updateAdminUserSecurity({ ...deps, userId: membre.id, change: { twoFactorEnabled: false }, ...reason }),
                  ),
                )
              : null}
            {!verrouille && !membre.twoFactorEnabled ? (
              <p className="text-caption" style={{ color: INK2 }}>
                {t('admin.activity.empty')}
              </p>
            ) : null}
          </section>

          <section className="grid gap-2" aria-labelledby="admin-account-verifications">
            <h3 id="admin-account-verifications" className="text-caption font-semibold" style={{ color: INK2 }}>
              {t('admin.user.verifications')}
            </h3>
            {PREUVES.map(({ cle, label }) => (
              <button
                key={cle}
                type="button"
                role="switch"
                aria-checked={preuves[cle]}
                data-admin-account-proof={cle}
                onClick={() => {
                  setPreuves((avant) => ({ ...avant, [cle]: !avant[cle] }));
                  setAConfirmer(null);
                }}
                className="flex items-center justify-between gap-3 rounded-chip px-4 text-start text-body"
                style={CONTROLE}
              >
                <span>{t(label)}</span>
                <span aria-hidden="true" className="relative h-6 w-10 shrink-0 rounded-full" style={{ backgroundColor: preuves[cle] ? BRAND : 'color-mix(in srgb, var(--color-ios-ink-3) 35%, transparent)' }}>
                  <span className="absolute top-0.5 size-5 rounded-full bg-white" style={{ insetInlineStart: preuves[cle] ? 18 : 2 }} />
                </span>
              </button>
            ))}
            {bouton(
              'verifications',
              'admin.convSettings.save',
              () => void agir('verifications', () => updateAdminUserVerifications({ ...deps, userId: membre.id, change: changees, ...reason })),
              Object.keys(changees).length === 0,
              'brand',
            )}
          </section>

          <ActionButton tone="secondary" onClick={onClose}>
            {translate(language, 'common.cancel')}
          </ActionButton>
        </div>
      </div>
    </Sheet>
  );
}
