import { useState } from 'react';

import { Field } from '@/components/field';
import { Sheet } from '@/components/sheet';
import { sensitiveChangesOf } from '@/lib/admin/user-edit-guard';
import type { AdminDeps } from '@/lib/api/admin';
import { updateAdminUser, type AdminUserEdit } from '@/lib/api/admin-user-actions';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
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

/**
 * Les champs TEXTE que la feuille édite, dans l'ordre où elle les montre — une
 * table, et non quinze blocs recopiés : la comparaison au membre servi, le
 * libellé et le type de saisie se lisent au même endroit (#7845). `banner` est
 * `null` quand le membre n'en a pas ; le brouillon le tient en chaîne vide.
 */
const TEXTES = [
  { cle: 'displayName', label: 'admin.edit.displayName', type: 'text' },
  { cle: 'firstName', label: 'admin.edit.firstName', type: 'text' },
  { cle: 'lastName', label: 'admin.edit.lastName', type: 'text' },
  { cle: 'username', label: 'admin.edit.username', type: 'text' },
  { cle: 'email', label: 'admin.edit.email', type: 'email' },
  { cle: 'phoneCountryCode', label: 'admin.edit.phoneCountryCode', type: 'text' },
  { cle: 'phoneNumber', label: 'admin.edit.phone', type: 'tel' },
  { cle: 'bio', label: 'admin.edit.bio', type: 'text' },
  { cle: 'banner', label: 'admin.edit.banner', type: 'url' },
  { cle: 'timezone', label: 'admin.edit.timezone', type: 'text' },
  { cle: 'systemLanguage', label: 'admin.user.systemLanguage', type: 'text' },
  { cle: 'regionalLanguage', label: 'admin.user.regionalLanguage', type: 'text' },
  { cle: 'customDestinationLanguage', label: 'admin.user.customLanguage', type: 'text' },
] as const satisfies readonly { readonly cle: string; readonly label: AdminPlainCatalogKey; readonly type: TypeDeSaisie }[];

type TypeDeSaisie = 'text' | 'email' | 'tel' | 'url';
type CleTexte = (typeof TEXTES)[number]['cle'];

type Brouillon = Readonly<Record<CleTexte, string>> & {
  readonly role: string;
  readonly isActive: boolean;
};

function brouillonDe(membre: AdminUserDetail): Brouillon {
  return {
    displayName: membre.displayName,
    firstName: membre.firstName,
    lastName: membre.lastName,
    username: membre.username,
    email: membre.email,
    phoneCountryCode: membre.phoneCountryCode,
    phoneNumber: membre.phoneNumber,
    bio: membre.bio,
    banner: membre.banner ?? '',
    timezone: membre.timezone,
    systemLanguage: membre.systemLanguage,
    regionalLanguage: membre.regionalLanguage,
    customDestinationLanguage: membre.customDestinationLanguage,
    role: membre.role,
    isActive: membre.isActive,
  };
}

/** Ce que l'appelant a VRAIMENT changé — un champ égal à sa valeur servie
 * n'est pas présenté, donc n'appelle pas sa loi. */
export function editFrom(membre: AdminUserDetail, brouillon: Brouillon): AdminUserEdit {
  const servi = brouillonDe(membre);
  const textes = Object.fromEntries(
    TEXTES.filter(({ cle }) => brouillon[cle] !== servi[cle]).map(({ cle }) => [cle, brouillon[cle]]),
  ) as Partial<Record<CleTexte, string>>;

  return {
    ...textes,
    ...(brouillon.role === servi.role ? {} : { role: brouillon.role }),
    ...(brouillon.isActive === servi.isActive ? {} : { isActive: brouillon.isActive }),
  };
}

export function AdminUserEditSheet({
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
  const [brouillon, setBrouillon] = useState<Brouillon>(() => brouillonDe(membre));
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
      ...deps,
      userId: membre.id,
      edit,
      ...(motif.trim() === '' ? {} : { reason: motif }),
    });
    setEnvoi(false);

    if (!resultat.ok) {
      onAnnounce(translateAdmin(language, 'admin.edit.failed'));
      return;
    }
    onAnnounce(translateAdmin(language, 'admin.edit.saved'));
    onSaved(resultat.data);
    onClose();
  }

  return (
    <Sheet title={translateAdmin(language, 'admin.edit.title')} bodyAs="div" onClose={onClose}>
      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-4 pb-6">
        {TEXTES.map(({ cle, label, type }) => (
          <Texte
            key={cle}
            id={`admin-edit-${cle}`}
            label={translateAdmin(language, label)}
            valeur={brouillon[cle]}
            type={type}
            focus={focus === cle}
            onFocus={() => setFocus(cle)}
            onBlur={() => setFocus(null)}
            onValeur={(valeur) => poser({ [cle]: valeur })}
          />
        ))}

        <label className="grid gap-1">
          <span className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.user.role')}
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
            {translateAdmin(language, 'admin.edit.active')}
          </span>
        </label>

        <Texte
          id="admin-edit-reason"
          label={translateAdmin(language, 'admin.edit.reason')}
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
            {translateAdmin(language, sensible === 'role' ? 'admin.edit.warnRole' : 'admin.edit.warnDeactivate')}
          </p>
        ))}

        <div className="grid gap-2 pt-2">
          <ActionButton
            tone={sensibles.length > 0 ? 'danger' : 'primary'}
            disabled={champs.length === 0 || envoi}
            onClick={() => void enregistrer()}
          >
            {translateAdmin(language, doitConfirmer ? 'admin.edit.confirm' : 'admin.edit.save')}
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
  readonly type?: TypeDeSaisie;
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
