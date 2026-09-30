import { useState } from 'react';

import { Sheet } from '@/components/sheet';
import type { AdminDeps } from '@/lib/api/admin';
import { createAdminUser, missingCreateFields, type AdminUserCreateInput } from '@/lib/api/admin-user-create';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import { apiDeps } from '@/lib/api/deps';
import { ADMIN_ROLES } from '@/lib/admin/user-list';
import { translateAdmin, type AdminPlainCatalogKey, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { translate } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { ActionButton } from '@/routes/link-page-parts';

import { Texte } from './admin-member-parts';

/**
 * **CRÉER UN COMPTE** (#8217) — la feuille, ouverte depuis la liste des
 * comptes. Le compte naît actif ; l'écran ouvre sa fiche aussitôt créé, où
 * l'administrateur peut poser sa photo et sa bannière.
 *
 * ## Connectable tout de suite, ou à la première connexion
 *
 * Sans numéro, un compte n'est actif qu'une fois son adresse prouvée (#8055).
 * L'administrateur choisit : il ATTESTE l'adresse (le compte se connecte
 * aussitôt avec son pseudonyme ou son adresse), ou il laisse la preuve due —
 * le membre recevra un code à cette adresse à sa première connexion. La case
 * est COCHÉE par défaut (directive porteur 2026-09-27) : un compte créé par
 * l'administration se connecte aussitôt ; laisser la preuve due est le geste.
 *
 * ## Les refus se posent SOUS leur champ
 *
 * Adresse ou pseudonyme déjà pris (409 `EMAIL_TAKEN` / `USERNAME_TAKEN`) se
 * disent au champ concerné ; un mot de passe refusé redit la raison de la
 * passerelle — la politique de robustesse ne se rejoue pas ici.
 */
const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';

type Champ = keyof Omit<AdminUserCreateInput, 'role' | 'systemLanguage'>;

type Refus = { readonly champ: Champ | null; readonly texte: string } | null;

function nomDeLangue(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function AdminUserCreateSheet({
  language,
  onClose,
  onCreated,
  onAnnounce,
  deps = apiDeps,
}: {
  readonly language: AdminLanguage;
  readonly onClose: () => void;
  readonly onCreated: (membre: AdminUserDetail) => void;
  readonly onAnnounce: (texte: string) => void;
  readonly deps?: AdminDeps;
}) {
  const [saisie, setSaisie] = useState<AdminUserCreateInput>({
    username: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'USER',
    systemLanguage: language,
  });
  const [atteste, setAtteste] = useState(true);
  const [focus, setFocus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<Refus>(null);

  const poser = (partie: Partial<AdminUserCreateInput>) => {
    setSaisie((precedente) => ({ ...precedente, ...partie }));
    setRefus(null);
  };

  async function creer() {
    if (envoi) return;
    if (missingCreateFields(saisie).length > 0) {
      setRefus({ champ: null, texte: translateAdmin(language, 'admin.create.missing') });
      return;
    }
    setEnvoi(true);
    const resultat = await createAdminUser({ ...deps, input: saisie, ...(atteste ? { emailVerified: true } : {}) });
    setEnvoi(false);

    if (resultat.ok) {
      onAnnounce(translateAdmin(language, 'admin.create.created'));
      onCreated(resultat.data);
      return;
    }
    if (resultat.code === 'EMAIL_TAKEN') {
      setRefus({ champ: 'email', texte: translateAdmin(language, 'admin.create.emailTaken') });
      return;
    }
    if (resultat.code === 'USERNAME_TAKEN') {
      setRefus({ champ: 'username', texte: translateAdmin(language, 'admin.create.usernameTaken') });
      return;
    }
    const texte = translateAdmin(language, 'admin.create.failed', { reason: resultat.error });
    setRefus({ champ: null, texte });
    onAnnounce(texte);
  }

  const champ = (nom: Champ, cle: AdminPlainCatalogKey, type: 'text' | 'email' | 'password' = 'text') => (
    <Texte
      id={`admin-create-${nom}`}
      label={translateAdmin(language, cle)}
      valeur={saisie[nom]}
      type={type}
      focus={focus === nom}
      error={refus?.champ === nom ? refus.texte : undefined}
      onFocus={() => setFocus(nom)}
      onBlur={() => setFocus(null)}
      onValeur={(valeur) => poser({ [nom]: valeur })}
    />
  );

  const selectStyle = { minHeight: 44, backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)', color: INK };

  return (
    <Sheet title={translateAdmin(language, 'admin.create.title')} bodyAs="div" presentation="centered" onClose={onClose}>
      <form
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-6"
        data-admin-create=""
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void creer();
        }}
      >
        <div className="grid gap-4">
          {champ('username', 'admin.create.username')}
          {champ('firstName', 'admin.create.firstName')}
          {champ('lastName', 'admin.create.lastName')}
          {champ('email', 'admin.create.email', 'email')}
          {champ('password', 'admin.create.password', 'password')}
          <p className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.create.passwordHint')}
          </p>

          <label className="grid gap-1">
            <span className="text-caption" style={{ color: INK2 }}>
              {translateAdmin(language, 'admin.user.role')}
            </span>
            <select
              data-admin-create-role
              value={saisie.role}
              onChange={(event) => poser({ role: event.currentTarget.value })}
              className="rounded-chip px-4 text-body"
              style={selectStyle}
            >
              {ADMIN_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-caption" style={{ color: INK2 }}>
              {translateAdmin(language, 'admin.create.language')}
            </span>
            <select
              data-admin-create-language
              value={saisie.systemLanguage}
              onChange={(event) => poser({ systemLanguage: event.currentTarget.value })}
              className="rounded-chip px-4 text-body"
              style={selectStyle}
            >
              {SUPPORTED_INTERFACE_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {nomDeLangue(code)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              data-admin-create-verified
              checked={atteste}
              onChange={(event) => setAtteste(event.currentTarget.checked)}
              style={{ minHeight: 24, minWidth: 24 }}
            />
            <span className="grid gap-1">
              <span className="text-body" style={{ color: INK }}>
                {translateAdmin(language, 'admin.create.emailVerified')}
              </span>
              <span className="text-caption" style={{ color: INK2 }}>
                {translateAdmin(language, atteste ? 'admin.create.emailVerifiedOn' : 'admin.create.emailVerifiedOff')}
              </span>
            </span>
          </label>

          {refus !== null && refus.champ === null ? (
            <p role="alert" className="text-caption" style={{ color: 'var(--color-danger)' }} data-admin-create-refused="">
              {refus.texte}
            </p>
          ) : null}

          <div className="grid gap-2 pt-2">
            <ActionButton type="submit" disabled={envoi} data={{ 'data-admin-create-submit': '' }}>
              {translateAdmin(language, 'admin.create.submit')}
            </ActionButton>
            <ActionButton tone="secondary" onClick={onClose}>
              {translate(language, 'common.cancel')}
            </ActionButton>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
