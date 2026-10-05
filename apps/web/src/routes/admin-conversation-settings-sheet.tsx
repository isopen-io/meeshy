import { useState } from 'react';

import {
  AdminFormActions,
  AdminFormSheet,
  AdminReasonField,
  AdminSelect,
  AdminSwitch,
  AdminTextInput,
  motiveState,
  useArmedConfirm,
} from '@/components/admin/form';
import { AdminInlineNotice } from '@/components/admin/states';
import { INK2 } from '@/components/admin/tone';
import { interpretConversationType } from '@/lib/admin/interpret/enums';
import { conversationLabel } from '@/lib/admin/interpret/labels';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import {
  MOTIF_LONGUEUR_MINIMALE,
  conversationEditFieldsOf,
  removeAdminConversationMember,
  setAdminConversationMemberRole,
  updateAdminConversation,
  type AdminConversationEdit,
  type AdminParticipantRole,
} from '@/lib/api/admin-conversation-settings';
import type { AdminConversation } from '@/lib/api/admin-user-conversations';
import { apiDeps } from '@/lib/api/deps';
import type { ApiFailure } from '@/lib/api/http';
import { translateAdmin, type AdminPlainCatalogKey, type AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **CONFIGURER UNE CONVERSATION, DEPUIS LA FICHE D'UN MEMBRE** (#7845, #7999).
 *
 * L'administrateur qui instruit une plainte n'est pas membre de la
 * conversation : les routes souveraines (`admin-conversation-settings.ts`) le
 * laissent agir, en échange d'un MOTIF écrit, journalisé.
 *
 * ## Le motif OUVRE le geste
 *
 * Enregistrer et Retirer restent inactifs tant que le motif n'atteint pas
 * {@link MOTIF_LONGUEUR_MINIMALE} caractères — le seuil que la passerelle tient
 * en 400. Un bouton actif qui échoue à coup sûr apprendrait à cliquer sans lire.
 *
 * **Le rang souverain n'écrit pas de motif** (spec 2026-10-04 § 4) : pour lui,
 * le champ devient FACULTATIF (« Motif (facultatif) »), les gestes sont actifs
 * sans lui et partent SANS `reason` ; un motif commencé se valide encore.
 *
 * ## Seul ce qui CHANGE part, et par SA route
 *
 * Le brouillon se compare à la conversation servie, champ par champ ; le rôle
 * DU MEMBRE part par `…/participants/:userId` (E2), jamais mêlé aux métadonnées
 * (E1) : deux journaux d'audit distincts, deux refus distincts.
 *
 * ## Un geste destructeur se CONFIRME
 *
 * Archiver, fermer à l'écriture, retirer : le premier appui change le libellé
 * en « Confirmer », ton danger ; le second agit. Toute modification entre les
 * deux remet la confirmation à zéro — on ne confirme pas un geste puis un autre
 * sous le même « oui ».
 *
 * ## Ce qu'un DIRECT n'a pas
 *
 * Un direct n'a pas de hiérarchie d'écriture : la passerelle refuse en 403
 * `defaultWriteRole`, le canal d'annonces et le mode lent. Les contrôles ne
 * sont donc pas proposés — un contrôle refusé d'avance n'en est pas un. Sur une
 * conversation chiffrée de bout en bout, la traduction automatique est
 * inactive pour la même raison (400 côté passerelle).
 *
 * ## Le créateur
 *
 * « Droits du créateur, jamais au-dessus » : ni rôle, ni retrait. L'écran le
 * DIT plutôt que de griser deux contrôles sans explication.
 *
 * ## Les pièces du kit (#9463)
 *
 * Champs, listes, bascules, motif, confirmation armée et gestes sont ceux de
 * `components/admin/form` ; la règle du motif est `motiveState`, la même que
 * celle du bannissement et du mot de passe. La feuille ne garde que ce qui est
 * à elle : le brouillon, ce qui en part, et par quelle route.
 */

const ROLES_ECRITURE = ['everyone', 'member', 'moderator', 'admin', 'creator'] as const;
type RoleEcriture = (typeof ROLES_ECRITURE)[number];
const ROLES_MEMBRE: readonly AdminParticipantRole[] = ['admin', 'moderator', 'member'];

const LIBELLES_ECRITURE: Readonly<Record<RoleEcriture, AdminPlainCatalogKey>> = {
  everyone: 'admin.convSettings.writeRole.everyone',
  member: 'admin.convSettings.writeRole.member',
  moderator: 'admin.convSettings.writeRole.moderator',
  admin: 'admin.convSettings.writeRole.admin',
  creator: 'admin.convSettings.writeRole.creator',
};

const LIBELLES_MEMBRE: Readonly<Record<AdminParticipantRole, AdminPlainCatalogKey>> = {
  admin: 'admin.conv.role.admin',
  moderator: 'admin.conv.role.moderator',
  member: 'admin.conv.role.member',
};

const estRoleEcriture = (v: string | null): v is RoleEcriture => v !== null && (ROLES_ECRITURE as readonly string[]).includes(v);
const estRoleMembre = (v: string): v is AdminParticipantRole => (ROLES_MEMBRE as readonly string[]).includes(v);

type Brouillon = {
  readonly title: string;
  readonly description: string;
  readonly avatar: string;
  readonly banner: string;
  readonly defaultWriteRole: RoleEcriture | '';
  readonly isAnnouncementChannel: boolean;
  readonly slowModeSeconds: number;
  readonly autoTranslateEnabled: boolean;
  readonly isActive: boolean;
  readonly closed: boolean;
};

function brouillonDe(c: AdminConversation): Brouillon {
  return {
    title: c.title ?? '',
    description: c.description ?? '',
    avatar: c.avatar ?? '',
    banner: c.banner ?? '',
    defaultWriteRole: estRoleEcriture(c.settings.defaultWriteRole) ? c.settings.defaultWriteRole : '',
    isAnnouncementChannel: c.settings.isAnnouncementChannel,
    slowModeSeconds: c.settings.slowModeSeconds,
    autoTranslateEnabled: c.settings.autoTranslateEnabled === true,
    isActive: c.isActive,
    closed: c.closedAt !== null,
  };
}

/** Une image VIDÉE s'écrit `null` (elle efface) ; intacte, elle ne part pas. */
const image = (brouillon: string, servie: string | null): string | null | undefined =>
  brouillon === (servie ?? '') ? undefined : brouillon === '' ? null : brouillon;

/** Ce qui a CHANGÉ — chaque champ égal à sa valeur servie reste `undefined`. */
export function conversationEditFrom(c: AdminConversation, b: Brouillon): AdminConversationEdit {
  const initial = brouillonDe(c);
  const si = <T,>(avant: T, apres: T): T | undefined => (Object.is(avant, apres) ? undefined : apres);
  const hierarchie = c.type !== 'direct';
  return {
    /* Un titre VIDÉ ne s'écrit pas : la passerelle exige au moins un
       caractère (`minLength: 1`), et « effacer le titre » n'est pas un geste
       qu'elle connaît. L'enregistrement reste possible pour le reste. */
    title: b.title.trim() === '' ? undefined : si(initial.title, b.title),
    description: si(initial.description, b.description),
    avatar: image(b.avatar, c.avatar),
    banner: image(b.banner, c.banner),
    defaultWriteRole: hierarchie && b.defaultWriteRole !== '' ? si(initial.defaultWriteRole, b.defaultWriteRole) || undefined : undefined,
    isAnnouncementChannel: hierarchie ? si(initial.isAnnouncementChannel, b.isAnnouncementChannel) : undefined,
    slowModeSeconds: hierarchie ? si(initial.slowModeSeconds, b.slowModeSeconds) : undefined,
    autoTranslateEnabled: si(initial.autoTranslateEnabled, b.autoTranslateEnabled),
    isActive: si(initial.isActive, b.isActive),
    closed: si(initial.closed, b.closed),
  };
}

export function AdminConversationSettingsSheet({
  conversation,
  userId,
  language,
  onClose,
  onAnnounce,
  onChanged,
  deps = apiDeps,
}: {
  readonly conversation: AdminConversation;
  /**
   * Le membre DONT on consulte la fiche — celui dont le rôle se règle ici.
   * Absent sur la fiche d'une CONVERSATION : aucun membre n'y est administré
   * (`conversation.membership` est alors `null`), et la feuille ne propose ni
   * rôle ni retrait.
   */
  readonly userId?: string;
  readonly language: AdminLanguage;
  readonly onClose: () => void;
  readonly onAnnounce: (texte: string) => void;
  /** Appelé après toute écriture réussie : l'hôte invalide sa liste. */
  readonly onChanged: () => void;
  readonly deps?: AdminDeps;
}) {
  const t = (cle: AdminPlainCatalogKey) => translateAdmin(language, cle);
  const [brouillon, setBrouillon] = useState<Brouillon>(() => brouillonDe(conversation));
  const roleServi = conversation.membership?.role ?? '';
  const memberId = userId ?? conversation.membership?.userId ?? '';
  const [role, setRole] = useState(roleServi);
  const [motif, setMotif] = useState('');
  const confirmation = useArmedConfirm<'save' | 'remove'>();
  const confirme = confirmation.armed;
  const [envoi, setEnvoi] = useState(false);

  const createur = roleServi === 'creator';
  const membre = conversation.membership !== null && conversation.membership.isActive;
  const direct = conversation.type === 'direct';
  const e2ee = conversation.settings.encryptionMode === 'e2ee';

  const edit = conversationEditFrom(conversation, brouillon);
  const champs = conversationEditFieldsOf(edit);
  const roleChange = !createur && role !== roleServi && estRoleMembre(role);
  const souverain = useAdminReach().isSovereign;
  const motive = motiveState({ text: motif, minLength: MOTIF_LONGUEUR_MINIMALE, required: true, sovereign: souverain, whenSovereign: 'optional' });
  const motifValide = motive.ready;
  /** Le motif qui part : aucun pour le souverain qui n'en a pas écrit. */
  const motifEnvoye = motive.sent;
  const destructeur = edit.isActive === false || edit.closed === true;
  const peutEnregistrer = motifValide && !envoi && (champs.length > 0 || roleChange);

  const poser = (partie: Partial<Brouillon>) => {
    setBrouillon((avant) => ({ ...avant, ...partie }));
    confirmation.disarm();
  };

  const echec = (resultat: ApiFailure) =>
    onAnnounce(t(resultat.code === 'CREATOR_PROTECTED' ? 'admin.convSettings.creatorProtected' : 'admin.convSettings.failed'));

  async function enregistrer() {
    if (!peutEnregistrer) return;
    if (destructeur && confirme !== 'save') {
      confirmation.arm('save');
      return;
    }
    setEnvoi(true);
    if (champs.length > 0) {
      const resultat = await updateAdminConversation({ ...deps, conversationId: conversation.id, edit, reason: motifEnvoye });
      if (!resultat.ok) {
        setEnvoi(false);
        echec(resultat);
        return;
      }
    }
    if (roleChange && estRoleMembre(role)) {
      const resultat = await setAdminConversationMemberRole({ ...deps, conversationId: conversation.id, userId: memberId, role, reason: motifEnvoye });
      if (!resultat.ok) {
        setEnvoi(false);
        onChanged();
        echec(resultat);
        return;
      }
    }
    setEnvoi(false);
    onAnnounce(t('admin.convSettings.saved'));
    onChanged();
    onClose();
  }

  async function retirer() {
    if (!motifValide || envoi || createur) return;
    if (confirme !== 'remove') {
      confirmation.arm('remove');
      return;
    }
    setEnvoi(true);
    const resultat = await removeAdminConversationMember({ ...deps, conversationId: conversation.id, userId: memberId, reason: motifEnvoye });
    setEnvoi(false);
    if (!resultat.ok) {
      echec(resultat);
      return;
    }
    onAnnounce(t('admin.convSettings.removed'));
    onChanged();
    onClose();
  }

  const texte = (id: 'title' | 'description' | 'avatar' | 'banner', label: AdminPlainCatalogKey) => (
    <AdminTextInput
      id={`admin-conv-field-${id}`}
      label={t(label)}
      value={brouillon[id]}
      {...(id === 'avatar' || id === 'banner' ? { type: 'url' as const, inputMode: 'url' as const } : {})}
      onValue={(valeur) => poser({ [id]: valeur })}
      data={{ 'data-admin-conv-field': id }}
    />
  );

  return (
    <AdminFormSheet language={language} title={t('admin.convSettings.title')} onClose={onClose} data={{ 'data-admin-conv-settings': conversation.id }}>
      <p className="truncate text-caption" style={{ color: INK2 }}>
        {conversationLabel(
          {
            title: conversation.title,
            type: conversation.type,
            participants: conversation.participants.map((participant) => ({ displayName: participant.displayName })),
            total: conversation.memberCount,
          },
          language,
        )}{' '}
        · {interpretConversationType(conversation.type, language).label}
      </p>

      {texte('title', 'admin.convSettings.titleField')}
      {texte('description', 'admin.convSettings.description')}
      {texte('avatar', 'admin.convSettings.avatar')}
      {texte('banner', 'admin.convSettings.banner')}

      {direct ? null : (
        <>
          <AdminSelect
            id="admin-conv-field-defaultWriteRole"
            label={t('admin.convSettings.writeRole')}
            value={brouillon.defaultWriteRole}
            options={ROLES_ECRITURE.map((r) => ({ value: r, label: t(LIBELLES_ECRITURE[r]) }))}
            fallbackLabel={() => '—'}
            onValue={(valeur) => {
              if (estRoleEcriture(valeur)) poser({ defaultWriteRole: valeur });
            }}
            data={{ 'data-admin-conv-field': 'defaultWriteRole' }}
          />
          <AdminSwitch
            id="admin-conv-toggle-announcement"
            label={t('admin.convSettings.announcement')}
            checked={brouillon.isAnnouncementChannel}
            onToggle={(isAnnouncementChannel) => poser({ isAnnouncementChannel })}
            data={{ 'data-admin-conv-toggle': 'announcement' }}
          />
          <AdminTextInput
            id="admin-conv-field-slowModeSeconds"
            type="number"
            min={0}
            inputMode="numeric"
            label={t('admin.convSettings.slowMode')}
            value={String(brouillon.slowModeSeconds)}
            onValue={(valeur) => {
              const secondes = Number(valeur);
              if (valeur !== '' && Number.isInteger(secondes) && secondes >= 0) poser({ slowModeSeconds: secondes });
            }}
            data={{ 'data-admin-conv-field': 'slowModeSeconds' }}
          />
        </>
      )}

      <AdminSwitch
        id="admin-conv-toggle-autoTranslate"
        label={t('admin.convSettings.autoTranslate')}
        checked={brouillon.autoTranslateEnabled}
        disabled={e2ee}
        onToggle={(autoTranslateEnabled) => poser({ autoTranslateEnabled })}
        data={{ 'data-admin-conv-toggle': 'autoTranslate' }}
      />
      <AdminSwitch
        id="admin-conv-toggle-archive"
        label={t(conversation.isActive ? 'admin.convSettings.archive' : 'admin.convSettings.restore')}
        checked={conversation.isActive ? !brouillon.isActive : brouillon.isActive}
        onToggle={() => poser({ isActive: !brouillon.isActive })}
        data={{ 'data-admin-conv-toggle': 'archive' }}
      />
      <AdminSwitch
        id="admin-conv-toggle-close"
        label={t(conversation.closedAt === null ? 'admin.convSettings.close' : 'admin.convSettings.reopen')}
        checked={conversation.closedAt === null ? brouillon.closed : !brouillon.closed}
        onToggle={() => poser({ closed: !brouillon.closed })}
        data={{ 'data-admin-conv-toggle': 'close' }}
      />

      {!membre ? null : createur ? (
        <AdminInlineNotice tone="neutral" text={t('admin.convSettings.creatorProtected')} />
      ) : (
        <AdminSelect
          id="admin-conv-member-role"
          label={t('admin.convSettings.memberRole')}
          value={role}
          options={ROLES_MEMBRE.map((r) => ({ value: r, label: t(LIBELLES_MEMBRE[r]) }))}
          fallbackLabel={(valeur) => valeur || '—'}
          onValue={(valeur) => {
            setRole(valeur);
            confirmation.disarm();
          }}
          data={{ 'data-admin-conv-member-role': '' }}
        />
      )}

      <AdminReasonField
        id="admin-conv-reason"
        language={language}
        label={t('admin.convSettings.reason')}
        value={motif}
        onValue={setMotif}
        minLength={MOTIF_LONGUEUR_MINIMALE}
        required
        sovereign={souverain}
        whenSovereign="optional"
        data={{ 'data-admin-conv-reason': '' }}
      />

      <AdminFormActions
        language={language}
        primary={{
          label: t(confirme === 'save' ? 'admin.convSettings.confirm' : 'admin.convSettings.save'),
          tone: destructeur ? 'danger' : 'primary',
          busy: envoi,
          disabled: !peutEnregistrer,
          onClick: () => void enregistrer(),
          data: { 'data-admin-conv-save': '' },
        }}
        secondary={
          !membre || createur
            ? []
            : [
                {
                  label: t(confirme === 'remove' ? 'admin.convSettings.confirm' : 'admin.convSettings.remove'),
                  tone: 'danger',
                  disabled: !motifValide,
                  onClick: () => void retirer(),
                  data: { 'data-admin-conv-remove': '' },
                },
              ]
        }
        onCancel={onClose}
      />
    </AdminFormSheet>
  );
}
