import { useMemo, useState } from 'react';

import { SUPPORTED_LANGUAGES } from '@meeshy/shared/utils/languages';

import { AdminButton } from '@/components/admin/button';
import { AdminSelect, AdminTextArea, AdminTextInput } from '@/components/admin/form';
import { INK2 } from '@/components/admin/tone';
import { identityDraftOf, identityEditOf, sectionIsDirty, type IdentityDraft } from '@/lib/admin/member-sections';
import type { AdminDeps } from '@/lib/api/admin';
import { updateAdminUser } from '@/lib/api/admin-user-actions';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { MemberSection, useMemberWrite } from './admin-member-parts';

/**
 * **L'IDENTITÉ D'UN MEMBRE, ÉDITÉE EN PLACE** (#8289) — pseudo compris.
 *
 * Un pseudo déjà porté par un autre compte (à la casse près) revient en 409
 * `USERNAME_TAKEN` avec des pseudos LIBRES dérivés de celui demandé : ils
 * s'affichent sous le champ, et en toucher un le pose — l'administrateur
 * n'a pas à deviner une variante qui passe.
 *
 * Les trois langues sont les trois premiers rangs du Prisme du membre
 * (`resolveUserLanguage`) : la principale est requise, les deux autres se
 * retirent par « Aucune ».
 */
const LANGUES = SUPPORTED_LANGUAGES.filter((langue) => langue.code.length === 2).map((langue) => ({
  value: langue.code,
  label: `${langue.flag} ${langue.nativeName}`,
}));

export function AdminMemberIdentitySection({
  membre,
  language,
  onAnnounce,
  deps = apiDeps,
}: {
  readonly membre: AdminUserDetail;
  readonly language: AdminLanguage;
  readonly onAnnounce: (texte: string) => void;
  readonly deps?: AdminDeps;
}) {
  /* Seuls les champs TOUCHÉS vivent dans l'état : le reste se relit du membre
     servi, si bien qu'un geste d'une AUTRE section (activer, valider) ne laisse
     jamais ici une valeur périmée qui ferait croire à une modification. */
  const [touches, setTouches] = useState<Partial<IdentityDraft>>({});
  const draft: IdentityDraft = { ...identityDraftOf(membre), ...touches };
  const ecriture = useMemberWrite({ userId: membre.id, language, onAnnounce });
  const edit = identityEditOf(membre, draft);

  const poser = (partie: Partial<IdentityDraft>) => {
    setTouches((precedent) => ({ ...precedent, ...partie }));
    ecriture.reset();
  };

  async function enregistrer() {
    const aJour = await ecriture.run(() => updateAdminUser({ ...deps, userId: membre.id, edit }));
    if (aJour !== null) setTouches({});
  }

  const pseudoPris = ecriture.failure?.code === 'USERNAME_TAKEN';
  const suggestions = pseudoPris ? (ecriture.failure?.suggestions ?? []) : [];
  const aucune = useMemo(() => [{ value: '', label: translateAdmin(language, 'admin.identity.noLanguage') }, ...LANGUES], [language]);

  return (
    <MemberSection
      name="identity"
      titre={translateAdmin(language, 'admin.user.identity')}
      language={language}
      dirty={sectionIsDirty(edit)}
      state={ecriture.state}
      onSave={() => void enregistrer()}
    >
      <div className="grid gap-4 @xl:grid-cols-2">
        <div className="grid gap-2 @xl:col-span-2">
          <AdminTextInput
            id="admin-member-username"
            label={translateAdmin(language, 'admin.create.username')}
            value={draft.username}
            error={pseudoPris ? translateAdmin(language, 'admin.create.usernameTaken') : undefined}
            onValue={(username) => poser({ username })}
          />
          {suggestions.length === 0 ? null : (
            <div className="flex flex-wrap items-center gap-2" data-admin-username-suggestions="">
              <span className="text-caption" style={{ color: INK2 }}>
                {translateAdmin(language, 'admin.identity.suggestions')}
              </span>
              {suggestions.map((suggestion) => (
                <AdminButton key={suggestion} data={{ 'data-admin-username-suggestion': suggestion }} onClick={() => poser({ username: suggestion })}>
                  {suggestion}
                </AdminButton>
              ))}
            </div>
          )}
        </div>
        <AdminTextInput
          id="admin-member-firstName"
          label={translateAdmin(language, 'admin.create.firstName')}
          value={draft.firstName}
          onValue={(firstName) => poser({ firstName })}
        />
        <AdminTextInput
          id="admin-member-lastName"
          label={translateAdmin(language, 'admin.create.lastName')}
          value={draft.lastName}
          onValue={(lastName) => poser({ lastName })}
        />
        <div className="@xl:col-span-2">
          <AdminTextInput
            id="admin-member-displayName"
            label={translateAdmin(language, 'admin.edit.displayName')}
            value={draft.displayName}
            onValue={(displayName) => poser({ displayName })}
          />
        </div>
        <div className="@xl:col-span-2">
          <AdminTextArea
            id="admin-member-bio"
            label={translateAdmin(language, 'admin.edit.bio')}
            value={draft.bio}
            rows={3}
            maxLength={500}
            onValue={(bio) => poser({ bio })}
          />
        </div>
      </div>
      <div className="grid gap-4 @xl:grid-cols-3">
        <AdminSelect
          id="admin-member-systemLanguage"
          label={translateAdmin(language, 'admin.meta.systemLanguage')}
          value={draft.systemLanguage}
          options={LANGUES}
          onValue={(systemLanguage) => poser({ systemLanguage })}
        />
        <AdminSelect
          id="admin-member-regionalLanguage"
          label={translateAdmin(language, 'admin.meta.regionalLanguage')}
          value={draft.regionalLanguage}
          options={aucune}
          onValue={(regionalLanguage) => poser({ regionalLanguage })}
        />
        <AdminSelect
          id="admin-member-customLanguage"
          label={translateAdmin(language, 'admin.meta.customLanguage')}
          value={draft.customDestinationLanguage}
          options={aucune}
          onValue={(customDestinationLanguage) => poser({ customDestinationLanguage })}
        />
      </div>
    </MemberSection>
  );
}
