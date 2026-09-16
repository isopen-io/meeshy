import { useState } from 'react';

import { Field } from '@/components/field';
import { Sheet } from '@/components/sheet';
import { sensitiveChangesOf } from '@/lib/admin/user-edit-guard';
import { updateAdminUser, type AdminUserEdit } from '@/lib/api/admin-user-actions';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import { apiDeps } from '@/lib/api/deps';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { ActionButton } from '@/routes/link-page-parts';

/**
 * **MODIFIER UN MEMBRE** (#6819) — la feuille, ouverte depuis sa fiche.
 *
 * ## Elle n'envoie que ce qui a CHANGÉ
 *
 * La passerelle compte les champs présentés (`champsPresentes`) et refuse un
 * corps vide. Surtout, chaque champ présenté traverse sa propre loi : envoyer
 * un `role` identique à l'actuel demanderait `canUpdateUserRoles` pour rien, et
 * un administrateur sans ce droit verrait son geste refusé **alors qu'il n'a
 * rien voulu changer au rôle**. On compare donc au membre servi, champ par
 * champ.
 *
 * ## La confirmation ne protège que ce qui le mérite
 *
 * `sensitiveChangesOf` n'en retient que deux (voir `user-edit-guard`), et la
 * feuille ne demande un second geste que dans ces cas. Confirmer chaque
 * changement de biographie apprendrait à valider sans lire.
 *
 * ## Les deux gestes de saisie ne se ressemblent pas
 *
 * `onInput` sur les champs texte, `onChange` sur le `<select>` : sous
 * happy-dom, un événement `input` dispatché ne déclenche **jamais**
 * `onChange` sur un `<input>` (témoin permanent dans `test-support`). Écrire
 * `onChange` partout rendrait les champs texte intestables — et le défaut ne
 * se verrait qu'en test, jamais dans un navigateur.
 */

/** La hiérarchie servie par la passerelle, du plus haut au plus bas
 * (`permissions.service.ts`). Déclarée ici faute de source partagée côté v2 ;
 * le jour où un port la sert, cette liste disparaît plutôt que de diverger. */
const ROLES = ['BIGBOSS', 'ADMIN', 'MODERATOR', 'AUDIT', 'ANALYST', 'USER'] as const;

const BRAND = 'var(--color-ios-brand)';
const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';

type Brouillon = {
  readonly displayName: string;
  readonly email: string;
  readonly bio: string;
  readonly role: string;
  readonly isActive: boolean;
};

/** Ce que l'appelant a VRAIMENT changé — un champ égal à sa valeur servie
 * n'est pas présenté, donc n'appelle pas sa loi. */
export function editFrom(membre: AdminUserDetail, brouillon: Brouillon): AdminUserEdit {
  const edit: {
    displayName?: string;
    email?: string;
    bio?: string;
    role?: string;
    isActive?: boolean;
  } = {};

  if (brouillon.displayName !== membre.displayName) edit.displayName = brouillon.displayName;
  if (brouillon.email !== membre.email) edit.email = brouillon.email;
  if (brouillon.bio !== membre.bio) edit.bio = brouillon.bio;
  if (brouillon.role !== membre.role) edit.role = brouillon.role;
  if (brouillon.isActive !== membre.isActive) edit.isActive = brouillon.isActive;

  return edit;
}

export function AdminUserEditSheet({
  membre,
  language,
  onClose,
  onSaved,
  onAnnounce,
}: {
  readonly membre: AdminUserDetail;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  readonly onSaved: (membre: AdminUserDetail) => void;
  readonly onAnnounce: (texte: string) => void;
}) {
  const [brouillon, setBrouillon] = useState<Brouillon>({
    displayName: membre.displayName,
    email: membre.email,
    bio: membre.bio,
    role: membre.role,
    isActive: membre.isActive,
  });
  const [motif, setMotif] = useState('');
  const [focus, setFocus] = useState<string | null>(null);
  const [confirme, setConfirme] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const edit = editFrom(membre, brouillon);
  const champs = Object.keys(edit);
  const sensibles = sensitiveChangesOf(edit);
  const doitConfirmer = sensibles.length > 0 && !confirme;

  const poser = (partie: Partial<Brouillon>) => {
    setBrouillon((precedent) => ({ ...precedent, ...partie }));
    // Toute modification postérieure REMET la confirmation à zéro : on ne
    // confirme pas un geste, puis un autre sous le même « oui ».
    setConfirme(false);
  };

  async function enregistrer() {
    if (champs.length === 0 || envoi) return;
    if (doitConfirmer) {
      setConfirme(true);
      return;
    }

    setEnvoi(true);
    const resultat = await updateAdminUser({
      ...apiDeps,
      userId: membre.id,
      edit,
      ...(motif.trim() === '' ? {} : { reason: motif }),
    });
    setEnvoi(false);

    if (!resultat.ok) {
      onAnnounce(translate(language, 'admin.edit.failed'));
      return;
    }
    onAnnounce(translate(language, 'admin.edit.saved'));
    onSaved(resultat.data);
    onClose();
  }

  return (
    <Sheet title={translate(language, 'admin.edit.title')} onClose={onClose}>
      <div className="grid gap-4 px-4 pb-6">
        <Texte
          id="admin-edit-displayName"
          label={translate(language, 'admin.edit.displayName')}
          valeur={brouillon.displayName}
          focus={focus === 'displayName'}
          onFocus={() => setFocus('displayName')}
          onBlur={() => setFocus(null)}
          onValeur={(displayName) => poser({ displayName })}
        />
        <Texte
          id="admin-edit-email"
          label={translate(language, 'admin.edit.email')}
          valeur={brouillon.email}
          type="email"
          focus={focus === 'email'}
          onFocus={() => setFocus('email')}
          onBlur={() => setFocus(null)}
          onValeur={(email) => poser({ email })}
        />
        <Texte
          id="admin-edit-bio"
          label={translate(language, 'admin.edit.bio')}
          valeur={brouillon.bio}
          focus={focus === 'bio'}
          onFocus={() => setFocus('bio')}
          onBlur={() => setFocus(null)}
          onValeur={(bio) => poser({ bio })}
        />

        <label className="grid gap-1">
          <span className="text-caption" style={{ color: INK2 }}>
            {translate(language, 'admin.user.role')}
          </span>
          <select
            data-admin-edit-role
            value={brouillon.role}
            onChange={(event) => poser({ role: event.currentTarget.value })}
            className="rounded-chip px-4 text-body"
            style={{ minHeight: 44, backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)', color: INK }}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            data-admin-edit-active
            checked={brouillon.isActive}
            onChange={(event) => poser({ isActive: event.currentTarget.checked })}
            style={{ minHeight: 24, minWidth: 24 }}
          />
          <span className="text-body" style={{ color: INK }}>
            {translate(language, 'admin.edit.active')}
          </span>
        </label>

        <Texte
          id="admin-edit-reason"
          label={translate(language, 'admin.edit.reason')}
          valeur={motif}
          focus={focus === 'reason'}
          onFocus={() => setFocus('reason')}
          onBlur={() => setFocus(null)}
          onValeur={setMotif}
        />

        {sensibles.map((sensible) => (
          <p
            key={sensible}
            data-admin-edit-warning={sensible}
            className="rounded-card px-4 py-3 text-caption"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, transparent)', color: 'var(--color-danger)' }}
          >
            {translate(language, sensible === 'role' ? 'admin.edit.warnRole' : 'admin.edit.warnDeactivate')}
          </p>
        ))}

        <div className="grid gap-2 pt-2">
          <ActionButton
            tone={sensibles.length > 0 ? 'danger' : 'primary'}
            disabled={champs.length === 0 || envoi}
            onClick={() => void enregistrer()}
          >
            {translate(language, doitConfirmer ? 'admin.edit.confirm' : 'admin.edit.save')}
          </ActionButton>
          <ActionButton tone="secondary" onClick={onClose}>
            {translate(language, 'common.cancel')}
          </ActionButton>
        </div>
      </div>
    </Sheet>
  );
}

/** `onInput`, jamais `onChange` — voir l'en-tête du fichier. */
function Texte({
  id,
  label,
  valeur,
  type = 'text',
  focus,
  onFocus,
  onBlur,
  onValeur,
}: {
  readonly id: string;
  readonly label: string;
  readonly valeur: string;
  readonly type?: 'text' | 'email';
  readonly focus: boolean;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  readonly onValeur: (valeur: string) => void;
}) {
  return (
    <Field id={id} label={label} tint={BRAND} focused={focus}>
      {({ id: champId, describedBy }) => (
        <input
          id={champId}
          type={type}
          value={valeur}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={describedBy}
          onInput={(event) => onValeur(event.currentTarget.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          className="w-full bg-transparent text-body outline-none"
          style={{ minHeight: 44, color: INK }}
        />
      )}
    </Field>
  );
}
