import { useState } from 'react';

import { AdminButton } from '@/components/admin/button';
import { AdminReasonField, AdminSelect, AdminSwitch, motiveState, useArmedConfirm } from '@/components/admin/form';
import { AdminInlineNotice } from '@/components/admin/states';
import { interpretRole } from '@/lib/admin/interpret/enums';
import { ADMIN_ROLES } from '@/lib/admin/user-list';
import { roleDraftOf, roleEditOf, sectionIsDirty, type RoleDraft } from '@/lib/admin/member-sections';
import { sensitiveChangesOf } from '@/lib/admin/user-edit-guard';
import type { AdminDeps } from '@/lib/api/admin';
import { updateAdminUser } from '@/lib/api/admin-user-actions';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { MemberSection, useMemberWrite } from './admin-member-parts';

/**
 * **LE RÔLE ET LE STATUT D'UN MEMBRE** (#8289).
 *
 * Deux changements seulement demandent un second geste (`sensitiveChangesOf`) :
 * changer le rôle (ses droits) et suspendre le compte (ses sessions fermées).
 * Le premier appui sur « Enregistrer » affiche l'avertissement et devient
 * « Confirmer » ; toute modification postérieure remet la confirmation à zéro
 * — on ne confirme pas un geste, puis un autre sous le même « oui ».
 */
/**
 * Le motif de ce panneau est FACULTATIF à tout rang et sans minimum : la règle commune
 * (`motiveState`) le dit par ses réglages, et rend le texte nettoyé qui part — ou rien.
 */
const REGLE_MOTIF = { minLength: 0, required: false, sovereign: false, whenSovereign: 'optional' } as const;

export function AdminMemberRoleSection({
  membre,
  language,
  onAnnounce,
  onOpenBan,
  deps = apiDeps,
}: {
  readonly membre: AdminUserDetail;
  readonly language: AdminLanguage;
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
  const confirmation = useArmedConfirm<'save'>();
  const ecriture = useMemberWrite({ userId: membre.id, language, onAnnounce });

  const edit = roleEditOf(membre, draft);
  const sensibles = sensitiveChangesOf(edit);
  const doitConfirmer = sensibles.length > 0 && confirmation.armed === null;
  const motifEnvoye = motiveState({ text: motif, ...REGLE_MOTIF }).sent;

  const poser = (partie: Partial<RoleDraft>) => {
    setTouches((precedent) => ({ ...precedent, ...partie }));
    confirmation.disarm();
    ecriture.reset();
  };

  async function enregistrer() {
    if (doitConfirmer) {
      confirmation.arm('save');
      return;
    }
    const aJour = await ecriture.run(() => updateAdminUser({ ...deps, userId: membre.id, edit, ...(motifEnvoye === null ? {} : { reason: motifEnvoye }) }));
    confirmation.disarm();
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
      <div className="grid gap-4 @xl:grid-cols-2">
        <AdminSelect
          id="admin-member-role"
          label={translateAdmin(language, 'admin.user.role')}
          value={draft.role}
          options={ADMIN_ROLES.map((role) => ({ value: role, label: interpretRole(role, language).label }))}
          onValue={(role) => poser({ role })}
        />
        <div className="self-end">
          <AdminSwitch id="admin-member-active" label={translateAdmin(language, 'admin.edit.active')} checked={draft.isActive} onToggle={(isActive) => poser({ isActive })} />
        </div>
      </div>
      <AdminReasonField
        id="admin-member-reason"
        language={language}
        label={translateAdmin(language, 'admin.edit.reason')}
        value={motif}
        onValue={setMotif}
        {...REGLE_MOTIF}
      />
      {sensibles.map((sensible) => (
        <AdminInlineNotice
          key={sensible}
          tone="danger"
          text={translateAdmin(language, sensible === 'role' ? 'admin.edit.warnRole' : 'admin.edit.warnDeactivate')}
          data={{ 'data-admin-edit-warning': sensible }}
        />
      ))}
      <div className="flex justify-start">
        <AdminButton tone="danger" data={{ 'data-admin-ban-open': '' }} onClick={onOpenBan}>
          {translateAdmin(language, 'admin.ban.open')}
        </AdminButton>
      </div>
    </MemberSection>
  );
}
