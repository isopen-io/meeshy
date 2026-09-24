import { useState, type ReactNode } from 'react';

import { Sheet } from '@/components/sheet';
import { adminConversationTypeLabel } from '@/lib/admin/enum-labels';
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
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { ActionButton } from '@/routes/link-page-parts';

/**
 * **CONFIGURER UNE CONVERSATION, DEPUIS LA FICHE D'UN MEMBRE** (#7845 E1–E3).
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
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';
const BRAND = 'var(--color-ios-brand)';

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

const CONTROLE = { minHeight: 44, backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)', color: INK } as const;

function Champ({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-caption" style={{ color: INK2 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Interrupteur({
  label,
  actif,
  data,
  disabled = false,
  onBascule,
}: {
  readonly label: string;
  readonly actif: boolean;
  readonly data: string;
  readonly disabled?: boolean;
  readonly onBascule: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={actif}
      disabled={disabled}
      data-admin-conv-toggle={data}
      onClick={onBascule}
      className="flex items-center justify-between gap-3 rounded-chip px-4 text-start text-body disabled:opacity-50"
      style={CONTROLE}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className="relative h-6 w-10 shrink-0 rounded-full"
        style={{ backgroundColor: actif ? BRAND : 'color-mix(in srgb, var(--color-ios-ink-3) 35%, transparent)' }}
      >
        <span className="absolute top-0.5 size-5 rounded-full bg-white" style={{ insetInlineStart: actif ? 18 : 2 }} />
      </span>
    </button>
  );
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
  /** Le membre DONT on consulte la fiche — celui dont le rôle se règle ici. */
  readonly userId: string;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  readonly onAnnounce: (texte: string) => void;
  /** Appelé après toute écriture réussie : l'hôte invalide sa liste. */
  readonly onChanged: () => void;
  readonly deps?: AdminDeps;
}) {
  const t = (cle: AdminPlainCatalogKey) => translateAdmin(language, cle);
  const [brouillon, setBrouillon] = useState<Brouillon>(() => brouillonDe(conversation));
  const roleServi = conversation.membership?.role ?? '';
  const [role, setRole] = useState(roleServi);
  const [motif, setMotif] = useState('');
  const [confirme, setConfirme] = useState<'save' | 'remove' | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const createur = roleServi === 'creator';
  const membre = conversation.membership !== null && conversation.membership.isActive;
  const direct = conversation.type === 'direct';
  const e2ee = conversation.settings.encryptionMode === 'e2ee';

  const edit = conversationEditFrom(conversation, brouillon);
  const champs = conversationEditFieldsOf(edit);
  const roleChange = !createur && role !== roleServi && estRoleMembre(role);
  const motifValide = motif.trim().length >= MOTIF_LONGUEUR_MINIMALE;
  const destructeur = edit.isActive === false || edit.closed === true;
  const peutEnregistrer = motifValide && !envoi && (champs.length > 0 || roleChange);

  const poser = (partie: Partial<Brouillon>) => {
    setBrouillon((avant) => ({ ...avant, ...partie }));
    setConfirme(null);
  };

  const echec = (resultat: ApiFailure) =>
    onAnnounce(t(resultat.code === 'CREATOR_PROTECTED' ? 'admin.convSettings.creatorProtected' : 'admin.convSettings.failed'));

  async function enregistrer() {
    if (!peutEnregistrer) return;
    if (destructeur && confirme !== 'save') {
      setConfirme('save');
      return;
    }
    setEnvoi(true);
    if (champs.length > 0) {
      const resultat = await updateAdminConversation({ ...deps, conversationId: conversation.id, edit, reason: motif });
      if (!resultat.ok) {
        setEnvoi(false);
        echec(resultat);
        return;
      }
    }
    if (roleChange && estRoleMembre(role)) {
      const resultat = await setAdminConversationMemberRole({ ...deps, conversationId: conversation.id, userId, role, reason: motif });
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
      setConfirme('remove');
      return;
    }
    setEnvoi(true);
    const resultat = await removeAdminConversationMember({ ...deps, conversationId: conversation.id, userId, reason: motif });
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
    <Champ label={t(label)}>
      <input
        data-admin-conv-field={id}
        value={brouillon[id]}
        {...(id === 'avatar' || id === 'banner' ? { type: 'url', inputMode: 'url' as const } : {})}
        onInput={(event) => poser({ [id]: event.currentTarget.value })}
        className="rounded-chip px-4 text-body"
        style={CONTROLE}
      />
    </Champ>
  );

  return (
    <Sheet title={t('admin.convSettings.title')} bodyAs="div" onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" data-admin-conv-settings={conversation.id}>
        <div className="grid gap-4">
          <p className="truncate text-caption" style={{ color: INK2 }}>
            {conversation.title ?? conversation.identifier ?? conversation.id} · {adminConversationTypeLabel(language, conversation.type)}
          </p>

          {texte('title', 'admin.convSettings.titleField')}
          {texte('description', 'admin.convSettings.description')}
          {texte('avatar', 'admin.convSettings.avatar')}
          {texte('banner', 'admin.convSettings.banner')}

          {direct ? null : (
            <>
              <Champ label={t('admin.convSettings.writeRole')}>
                <select
                  data-admin-conv-field="defaultWriteRole"
                  value={brouillon.defaultWriteRole}
                  onChange={(event) => {
                    const valeur = event.currentTarget.value;
                    if (estRoleEcriture(valeur)) poser({ defaultWriteRole: valeur });
                  }}
                  className="rounded-chip px-4 text-body"
                  style={CONTROLE}
                >
                  {brouillon.defaultWriteRole === '' ? <option value="">—</option> : null}
                  {ROLES_ECRITURE.map((r) => (
                    <option key={r} value={r}>
                      {t(LIBELLES_ECRITURE[r])}
                    </option>
                  ))}
                </select>
              </Champ>
              <Interrupteur
                label={t('admin.convSettings.announcement')}
                actif={brouillon.isAnnouncementChannel}
                data="announcement"
                onBascule={() => poser({ isAnnouncementChannel: !brouillon.isAnnouncementChannel })}
              />
              <Champ label={t('admin.convSettings.slowMode')}>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  data-admin-conv-field="slowModeSeconds"
                  value={String(brouillon.slowModeSeconds)}
                  onInput={(event) => {
                    const secondes = Number(event.currentTarget.value);
                    if (event.currentTarget.value !== '' && Number.isInteger(secondes) && secondes >= 0) poser({ slowModeSeconds: secondes });
                  }}
                  className="rounded-chip px-4 text-body tabular-nums"
                  style={CONTROLE}
                />
              </Champ>
            </>
          )}

          <Interrupteur
            label={t('admin.convSettings.autoTranslate')}
            actif={brouillon.autoTranslateEnabled}
            data="autoTranslate"
            disabled={e2ee}
            onBascule={() => poser({ autoTranslateEnabled: !brouillon.autoTranslateEnabled })}
          />
          <Interrupteur
            label={t(conversation.isActive ? 'admin.convSettings.archive' : 'admin.convSettings.restore')}
            actif={conversation.isActive ? !brouillon.isActive : brouillon.isActive}
            data="archive"
            onBascule={() => poser({ isActive: !brouillon.isActive })}
          />
          <Interrupteur
            label={t(conversation.closedAt === null ? 'admin.convSettings.close' : 'admin.convSettings.reopen')}
            actif={conversation.closedAt === null ? brouillon.closed : !brouillon.closed}
            data="close"
            onBascule={() => poser({ closed: !brouillon.closed })}
          />

          {!membre ? null : createur ? (
            <p className="rounded-card px-4 py-3 text-caption" style={{ color: INK2, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 10%, transparent)' }}>
              {t('admin.convSettings.creatorProtected')}
            </p>
          ) : (
            <Champ label={t('admin.convSettings.memberRole')}>
              <select
                data-admin-conv-member-role
                value={role}
                onChange={(event) => {
                  setRole(event.currentTarget.value);
                  setConfirme(null);
                }}
                className="rounded-chip px-4 text-body"
                style={CONTROLE}
              >
                {estRoleMembre(roleServi) ? null : <option value={roleServi}>{roleServi || '—'}</option>}
                {ROLES_MEMBRE.map((r) => (
                  <option key={r} value={r}>
                    {t(LIBELLES_MEMBRE[r])}
                  </option>
                ))}
              </select>
            </Champ>
          )}

          <Champ label={t('admin.convSettings.reason')}>
            <input
              data-admin-conv-reason
              value={motif}
              onInput={(event) => setMotif(event.currentTarget.value)}
              className="rounded-chip px-4 text-body"
              style={CONTROLE}
            />
          </Champ>

          <div className="grid gap-2 pt-2">
            <ActionButton
              tone={destructeur ? 'danger' : 'primary'}
              data={{ 'data-admin-conv-save': '' }}
              disabled={!peutEnregistrer}
              onClick={() => void enregistrer()}
            >
              {t(confirme === 'save' ? 'admin.convSettings.confirm' : 'admin.convSettings.save')}
            </ActionButton>
            {!membre || createur ? null : (
              <ActionButton tone="danger" data={{ 'data-admin-conv-remove': '' }} disabled={!motifValide || envoi} onClick={() => void retirer()}>
                {t(confirme === 'remove' ? 'admin.convSettings.confirm' : 'admin.convSettings.remove')}
              </ActionButton>
            )}
            <ActionButton tone="secondary" onClick={onClose}>
              {translate(language, 'common.cancel')}
            </ActionButton>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
