import { useMemo, useState } from 'react';

import { SUPPORTED_LANGUAGES } from '@meeshy/shared/utils/languages';

import { identityDraftOf, identityEditOf, sectionIsDirty, type IdentityDraft } from '@/lib/admin/member-sections';
import type { AdminDeps } from '@/lib/api/admin';
import { updateAdminUser } from '@/lib/api/admin-user-actions';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { BRAND, Choix, INK, INK2, MemberSection, Texte, useFieldFocus, useMemberWrite } from './admin-member-parts';

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
  const focus = useFieldFocus();
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
          <Texte
            id="admin-member-username"
            label={translateAdmin(language, 'admin.create.username')}
            valeur={draft.username}
            error={pseudoPris ? translateAdmin(language, 'admin.create.usernameTaken') : undefined}
            {...focus('username')}
            onValeur={(username) => poser({ username })}
          />
          {suggestions.length === 0 ? null : (
            <div className="flex flex-wrap items-center gap-2" data-admin-username-suggestions="">
              <span className="text-caption" style={{ color: INK2 }}>
                {translateAdmin(language, 'admin.identity.suggestions')}
              </span>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  data-admin-username-suggestion={suggestion}
                  onClick={() => poser({ username: suggestion })}
                  className="rounded-full px-3 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ minHeight: 36, color: BRAND, border: `1px solid color-mix(in srgb, ${BRAND} 40%, transparent)`, outlineColor: BRAND }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
        <Texte
          id="admin-member-firstName"
          label={translateAdmin(language, 'admin.create.firstName')}
          valeur={draft.firstName}
          autoComplete="off"
          {...focus('firstName')}
          onValeur={(firstName) => poser({ firstName })}
        />
        <Texte
          id="admin-member-lastName"
          label={translateAdmin(language, 'admin.create.lastName')}
          valeur={draft.lastName}
          {...focus('lastName')}
          onValeur={(lastName) => poser({ lastName })}
        />
        <div className="@xl:col-span-2">
          <Texte
            id="admin-member-displayName"
            label={translateAdmin(language, 'admin.edit.displayName')}
            valeur={draft.displayName}
            {...focus('displayName')}
            onValeur={(displayName) => poser({ displayName })}
          />
        </div>
        <label className="grid gap-1 @xl:col-span-2" htmlFor="admin-member-bio">
          <span className="text-caption font-medium" style={{ color: 'var(--color-ios-ink-3)' }}>
            {translateAdmin(language, 'admin.edit.bio')}
          </span>
          <textarea
            id="admin-member-bio"
            value={draft.bio}
            rows={3}
            maxLength={500}
            onInput={(event) => poser({ bio: event.currentTarget.value })}
            className="rounded-[14px] px-4 py-3 text-body"
            style={{ backgroundColor: 'var(--color-ios-card)', border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 30%, transparent)', color: INK, resize: 'vertical' }}
          />
        </label>
      </div>
      <div className="grid gap-4 @xl:grid-cols-3">
        <Choix
          id="admin-member-systemLanguage"
          label={translateAdmin(language, 'admin.meta.systemLanguage')}
          valeur={draft.systemLanguage}
          options={LANGUES}
          onValeur={(systemLanguage) => poser({ systemLanguage })}
        />
        <Choix
          id="admin-member-regionalLanguage"
          label={translateAdmin(language, 'admin.meta.regionalLanguage')}
          valeur={draft.regionalLanguage}
          options={aucune}
          onValeur={(regionalLanguage) => poser({ regionalLanguage })}
        />
        <Choix
          id="admin-member-customLanguage"
          label={translateAdmin(language, 'admin.meta.customLanguage')}
          valeur={draft.customDestinationLanguage}
          options={aucune}
          onValeur={(customDestinationLanguage) => poser({ customDestinationLanguage })}
        />
      </div>
    </MemberSection>
  );
}
