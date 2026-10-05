import { useState } from 'react';

import { AdminCheckbox, AdminFormActions, AdminFormError, AdminFormSheet, AdminSelect, AdminTextInput } from '@/components/admin/form';
import type { AdminDeps } from '@/lib/api/admin';
import { createAdminUser, missingCreateFields, type AdminUserCreateInput } from '@/lib/api/admin-user-create';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import { apiDeps } from '@/lib/api/deps';
import { interpretRole } from '@/lib/admin/interpret/enums';
import { ADMIN_ROLES } from '@/lib/admin/user-list';
import { translateAdmin, type AdminPlainCatalogKey, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

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
 *
 * ## Les pièces du kit (#9463)
 *
 * Champs, listes, case, refus et gestes sont ceux de `components/admin/form` :
 * la feuille ne dessine plus rien elle-même, elle ne dit que ce qu'elle demande.
 */

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
    <AdminTextInput
      id={`admin-create-${nom}`}
      label={translateAdmin(language, cle)}
      value={saisie[nom]}
      type={type}
      error={refus?.champ === nom ? refus.texte : undefined}
      onValue={(valeur) => poser({ [nom]: valeur })}
      {...(nom === 'password' ? { note: translateAdmin(language, 'admin.create.passwordHint') } : {})}
    />
  );

  return (
    <AdminFormSheet
      language={language}
      title={translateAdmin(language, 'admin.create.title')}
      onClose={onClose}
      data={{ 'data-admin-create': '' }}
      onSubmit={() => void creer()}
    >
      {champ('username', 'admin.create.username')}
      {champ('firstName', 'admin.create.firstName')}
      {champ('lastName', 'admin.create.lastName')}
      {champ('email', 'admin.create.email', 'email')}
      {champ('password', 'admin.create.password', 'password')}

      <AdminSelect
        id="admin-create-role"
        label={translateAdmin(language, 'admin.user.role')}
        value={saisie.role}
        options={ADMIN_ROLES.map((role) => ({ value: role, label: interpretRole(role, language).label }))}
        onValue={(role) => poser({ role })}
        data={{ 'data-admin-create-role': '' }}
      />

      <AdminSelect
        id="admin-create-language"
        label={translateAdmin(language, 'admin.create.language')}
        value={saisie.systemLanguage}
        options={SUPPORTED_INTERFACE_LANGUAGES.map((code) => ({ value: code, label: nomDeLangue(code) }))}
        onValue={(systemLanguage) => poser({ systemLanguage })}
        data={{ 'data-admin-create-language': '' }}
      />

      <AdminCheckbox
        id="admin-create-verified"
        label={translateAdmin(language, 'admin.create.emailVerified')}
        hint={translateAdmin(language, atteste ? 'admin.create.emailVerifiedOn' : 'admin.create.emailVerifiedOff')}
        checked={atteste}
        onToggle={setAtteste}
        data={{ 'data-admin-create-verified': '' }}
      />

      {refus !== null && refus.champ === null ? <AdminFormError text={refus.texte} data={{ 'data-admin-create-refused': '' }} /> : null}

      <AdminFormActions
        language={language}
        primary={{ label: translateAdmin(language, 'admin.create.submit'), type: 'submit', busy: envoi, data: { 'data-admin-create-submit': '' } }}
        onCancel={onClose}
      />
    </AdminFormSheet>
  );
}
