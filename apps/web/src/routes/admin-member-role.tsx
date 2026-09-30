import { useState } from 'react';

import { interpretRole } from '@/lib/admin/interpret/enums';
import { ADMIN_ROLES } from '@/lib/admin/user-list';
import { roleDraftOf, roleEditOf, sectionIsDirty, type RoleDraft } from '@/lib/admin/member-sections';
import { sensitiveChangesOf } from '@/lib/admin/user-edit-guard';
import type { AdminDeps } from '@/lib/api/admin';
import { updateAdminUser } from '@/lib/api/admin-user-actions';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { Bascule, Choix, MemberSection, SectionButton, Texte, useFieldFocus, useMemberWrite } from './admin-member-parts';

/**
 * **LE RÔLE ET LE STATUT D'UN MEMBRE** (#8289).
 *
 * Deux changements seulement demandent un second geste (`sensitiveChangesOf`) :
 * changer le rôle (ses droits) et suspendre le compte (ses sessions fermées).
 * Le premier appui sur « Enregistrer » affiche l'avertissement et devient
 * « Confirmer » ; toute modification postérieure remet la confirmation à zéro
 * — on ne confirme pas un geste, puis un autre sous le même « oui ».
 */
export function AdminMemberRoleSection({
  membre,
  language,
  onAnnounce,
  onOpenBan,
  deps = apiDeps,
}: {
  readonly membre: AdminUserDetail;
  readonly language: InterfaceLanguage;
  readonly onAnnounce: (texte: string) => void;
  readonly onOpenBan: () => void;
  readonly deps?: AdminDeps;
}) {
  /* Seuls les champs TOUCHÉS vivent dans l'état : le reste se relit du membre
     servi, si bien qu'un geste d'une AUTRE section (activer, valider) ne laisse
     jamais ici une valeur périmée qui ferait croire à une modification. */
  const [touches, setTouches] = useState<Partial<RoleDraft>>({});
  const draft: RoleDraft = { ...roleDraftOf(membre), ...touches };
  const [motif, setMotif] = useState('');
  const [confirme, setConfirme] = useState(false);
  const focus = useFieldFocus();
  const ecriture = useMemberWrite({ userId: membre.id, language, onAnnounce });

  const edit = roleEditOf(membre, draft);
  const sensibles = sensitiveChangesOf(edit);
  const doitConfirmer = sensibles.length > 0 && !confirme;

  const poser = (partie: Partial<RoleDraft>) => {
    setTouches((precedent) => ({ ...precedent, ...partie }));
    setConfirme(false);
    ecriture.reset();
  };

  async function enregistrer() {
    if (doitConfirmer) {
      setConfirme(true);
      return;
    }
    const aJour = await ecriture.run(() =>
      updateAdminUser({ ...deps, userId: membre.id, edit, ...(motif.trim() === '' ? {} : { reason: motif }) }),
    );
    setConfirme(false);
    if (aJour === null) return;
    setTouches({});
    setMotif('');
  }

  return (
    <MemberSection
      name="role"
      titre={translateAdmin(language, 'admin.roleStatus.title')}
      language={language}
      dirty={sectionIsDirty(edit)}
      state={ecriture.state}
      saveTone={sensibles.length > 0 ? 'danger' : 'primary'}
      {...(doitConfirmer ? { saveLabel: translateAdmin(language, 'admin.edit.confirm') } : {})}
      onSave={() => void enregistrer()}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Choix
          id="admin-member-role"
          label={translateAdmin(language, 'admin.user.role')}
          valeur={draft.role}
          options={ADMIN_ROLES.map((role) => ({ value: role, label: interpretRole(role, language).label }))}
          onValeur={(role) => poser({ role })}
        />
        <div className="self-end">
          <Bascule id="admin-member-active" label={translateAdmin(language, 'admin.edit.active')} actif={draft.isActive} onBascule={(isActive) => poser({ isActive })} />
        </div>
      </div>
      <Texte id="admin-member-reason" label={translateAdmin(language, 'admin.edit.reason')} valeur={motif} {...focus('reason')} onValeur={setMotif} />
      {sensibles.map((sensible) => (
        <p
          key={sensible}
          role="alert"
          data-admin-edit-warning={sensible}
          className="rounded-card px-4 py-3 text-caption"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, transparent)', color: 'var(--color-danger)' }}
        >
          {translateAdmin(language, sensible === 'role' ? 'admin.edit.warnRole' : 'admin.edit.warnDeactivate')}
        </p>
      ))}
      <div className="flex justify-start">
        <SectionButton tone="danger" data={{ 'data-admin-ban-open': '' }} onClick={onOpenBan}>
          {translateAdmin(language, 'admin.ban.open')}
        </SectionButton>
      </div>
    </MemberSection>
  );
}
