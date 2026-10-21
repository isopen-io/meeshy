import { useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';

import { getUserPresenceStatus } from '@meeshy/shared/utils/user-presence';

import { AdminBadge, AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminButton } from '@/components/admin/button';
import { AdminGlyph } from '@/components/admin/admin-glyph';
import { AdminInlineField, type AdminInlineStatus } from '@/components/admin/inline-field';
import { BRAND, INK, INK2, INK3 } from '@/components/admin/tone';
import { interpretPresence, interpretRole } from '@/lib/admin/interpret/enums';
import { adminDate } from '@/lib/admin/interpret/time';
import { ageOf, formatYears } from '@/lib/admin/member-meta';
import { useAdminMotive } from '@/lib/admin/use-admin-motive';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import { ADMIN_ROLES } from '@/lib/admin/user-list';
import type { AdminDeps } from '@/lib/api/admin';
import { updateAdminUser, type AdminUserEdit } from '@/lib/api/admin-user-actions';
import { adminUserDetailQueryKey, type AdminUserDetail } from '@/lib/api/admin-user-detail';
import { unlockAdminUser } from '@/lib/api/admin-user-security';
import { apiDeps } from '@/lib/api/deps';
import type { ApiFailure, ApiResult } from '@/lib/api/http';
import { translateAdmin, type AdminPlainCatalogKey, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { useMemberGestures, type MemberGesture } from './admin-member-gestures';
import { GLASS_CARD_CLASS, GLASS_CARD_EDGE, refusalOf } from './admin-member-parts';

/**
 * **L'ÉDITION RAPIDE D'UN MEMBRE, EN TÊTE DE SA FICHE** (demande porteur 2026-10-13, #10562) —
 * « éditer d'un coup les informations d'un utilisateur : son profil, son âge, en ligne ou hors
 * ligne, ses droits, son pseudo, son nom affiché, remettre à zéro ses tentatives, régénérer un
 * mot de passe ».
 *
 * Une section CONDENSÉE et REPLIABLE (le repli est retenu par navigateur) : chaque information
 * s'édite là où elle s'affiche (`AdminInlineField`) — un clic ou Entrée ouvre la zone, la perte
 * du focus ou Entrée valide, Échap annule. L'écriture est OPTIMISTE et propre à chaque champ :
 * le membre servi remplace le détail en cache, un refus remet l'instantané et se dit sous le
 * champ. Deux champs n'écrivent pas au premier geste, parce qu'ils retirent quelque chose :
 * changer le RÔLE (ses droits) et DÉSACTIVER le compte (ses sessions) passent par la feuille de
 * confirmation, où l'ADMIN trouve le motif déjà proposé (`useAdminMotive`).
 *
 * Ce qui ne s'édite pas se LIT : la présence (calculée par la loi partagée, dite en mots). Les
 * GESTES du compte sont des boutons DANS la carte, SOUS les champs, et restent visibles carte
 * repliée, du plus courant au plus lourd : les actions en un clic (`leading` : activer, valider
 * une preuve), « Régénérer le mot de passe » et « Bannir », qui ouvrent leurs feuilles, puis la
 * suppression (`trailing`), en dernier ; « Remettre à zéro » les tentatives (le même `unlock` que la section Sécurité, qui
 * vide aussi le verrou) vit sous leur compteur. Sans `canManageUsers`, tout se lit et rien ne
 * s'offre.
 */
const FOLD_KEY = 'meeshy.admin.quickEdit.folded';

/**
 * LA RANGÉE DES GESTES (#11410, relu sur la capture de la recette à 430 px) — sur un téléphone,
 * une COLONNE de gros boutons de même largeur ; dès 28 rem de carte, une rangée qui passe à la
 * ligne. Les gestes intégrés (actions en un clic, suppression) prennent la même grille.
 */
export const GESTURE_ROW = 'grid grid-cols-1 gap-2 @md:flex @md:flex-wrap @md:items-center';

function readFolded(): boolean {
  try {
    return window.localStorage.getItem(FOLD_KEY) === '1';
  } catch {
    return false;
  }
}

function writeFolded(folded: boolean): void {
  try {
    window.localStorage.setItem(FOLD_KEY, folded ? '1' : '0');
  } catch {
    return;
  }
}

type FieldId = 'username' | 'displayName' | 'firstName' | 'lastName' | 'birthDate' | 'active' | 'attempts';

/**
 * L'ÉCRITURE PAR CHAMP — un état par champ (deux champs peuvent partir l'un après l'autre sans
 * que le second soit avalé par le premier), le membre rendu écrit dans le cache, la liste des
 * comptes invalidée.
 */
function useFieldWrites({ userId, language, onAnnounce }: { readonly userId: string; readonly language: AdminLanguage; readonly onAnnounce: (texte: string) => void }) {
  const client = useQueryClient();
  const [statuses, setStatuses] = useState<Partial<Record<FieldId, AdminInlineStatus>>>({});
  const [failures, setFailures] = useState<Partial<Record<FieldId, ApiFailure>>>({});
  const set = (id: FieldId, status: AdminInlineStatus, failure: ApiFailure | null) => {
    setStatuses((before) => ({ ...before, [id]: status }));
    setFailures((before) => {
      const { [id]: _dropped, ...rest } = before;
      return failure === null ? rest : { ...rest, [id]: failure };
    });
  };

  async function write(
    id: FieldId,
    gesture: () => Promise<ApiResult<AdminUserDetail>>,
    optimistic: (before: AdminUserDetail) => AdminUserDetail,
    success: AdminPlainCatalogKey = 'admin.edit.saved',
  ): Promise<void> {
    const key = adminUserDetailQueryKey(userId);
    const snapshot = client.getQueryData<AdminUserDetail>(key);
    if (snapshot !== undefined) client.setQueryData(key, optimistic(snapshot));
    set(id, { phase: 'saving' }, null);
    const result = await gesture();
    if (!result.ok) {
      if (snapshot !== undefined) client.setQueryData(key, snapshot);
      const message = refusalOf(result, language);
      set(id, { phase: 'error', message }, result);
      onAnnounce(message);
      return;
    }
    client.setQueryData(key, result.data);
    void client.invalidateQueries({ queryKey: ['admin', 'users'] });
    const message = translateAdmin(language, success);
    set(id, { phase: 'saved', message }, null);
    onAnnounce(message);
  }

  return { statusOf: (id: FieldId): AdminInlineStatus => statuses[id] ?? { phase: 'idle' }, failureOf: (id: FieldId) => failures[id] ?? null, write };
}

const withEdit = (membre: AdminUserDetail, edit: AdminUserEdit): AdminUserDetail => ({
  ...membre,
  ...(edit.username === undefined ? {} : { username: edit.username }),
  ...(edit.firstName === undefined ? {} : { firstName: edit.firstName }),
  ...(edit.lastName === undefined ? {} : { lastName: edit.lastName }),
  ...(edit.displayName === undefined ? {} : { displayName: edit.displayName ?? '' }),
  ...(edit.birthDate === undefined || membre.adminMetadata === null ? {} : { adminMetadata: { ...membre.adminMetadata, birthDate: edit.birthDate } }),
});

export function AdminMemberQuickEdit({
  membre,
  language,
  onAnnounce,
  onOpenPassword,
  onOpenBan,
  leading,
  trailing,
  deps = apiDeps,
  now = () => new Date(),
}: {
  readonly membre: AdminUserDetail;
  readonly language: AdminLanguage;
  readonly onAnnounce: (texte: string) => void;
  readonly onOpenPassword: () => void;
  readonly onOpenBan: () => void;
  /** Les gestes COURANTS du compte (activer, valider une preuve), rangés en tête de la rangée. */
  readonly leading?: ReactNode;
  /** Le geste le plus LOURD (supprimer, restaurer), rangé en dernier — jamais celui qu'on touche d'abord. */
  readonly trailing?: ReactNode;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
}) {
  const reach = useAdminReach();
  const motive = useAdminMotive(language);
  const writable = reach.can('canManageUsers');
  const [folded, setFolded] = useState(readFolded);
  const bodyId = useId();
  const titleId = useId();
  const writes = useFieldWrites({ userId: membre.id, language, onAnnounce });
  const gestures = useMemberGestures({ membre, language, onAnnounce });
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const moment = now();

  const toggle = () => {
    const next = !folded;
    setFolded(next);
    writeFolded(next);
  };

  const profile = (id: Exclude<FieldId, 'attempts' | 'active'>, edit: AdminUserEdit) =>
    void writes.write(
      id,
      () => updateAdminUser({ ...deps, userId: membre.id, edit }),
      (before) => withEdit(before, edit),
    );

  const changeRole = (role: string) => {
    const label = interpretRole(role, language).label;
    const gesture: MemberGesture = {
      id: 'quick-role',
      title: translateAdmin(language, 'admin.quickEdit.roleTitle', { role: label }),
      body: t('admin.edit.warnRole'),
      confirmLabel: t('admin.quickEdit.roleConfirm'),
      tone: 'danger',
      motive: { label: t('admin.edit.reason'), minLength: 0, required: false },
      success: 'admin.quickEdit.roleDone',
      call: (reason) => updateAdminUser({ ...deps, userId: membre.id, edit: { role }, ...(reason === null || reason === '' ? {} : { reason }) }),
    };
    gestures.ask(gesture);
  };

  const changeActive = (value: string) => {
    if (value === 'active') {
      void writes.write(
        'active',
        () => updateAdminUser({ ...deps, userId: membre.id, edit: { isActive: true }, ...(motive.fallback === undefined ? {} : { reason: motive.fallback }) }),
        (before) => ({ ...before, isActive: true, deactivatedAt: null }),
        'admin.quick.activated',
      );
      return;
    }
    gestures.ask({
      id: 'quick-deactivate',
      title: t('admin.quickEdit.deactivateTitle'),
      body: t('admin.edit.warnDeactivate'),
      confirmLabel: t('admin.quickEdit.deactivateConfirm'),
      tone: 'danger',
      motive: { label: t('admin.edit.reason'), minLength: 0, required: false },
      success: 'admin.quickEdit.deactivateDone',
      call: (reason) => updateAdminUser({ ...deps, userId: membre.id, edit: { isActive: false }, ...(reason === null || reason === '' ? {} : { reason }) }),
    });
  };

  const resetAttempts = () =>
    void writes.write(
      'attempts',
      () => unlockAdminUser({ ...deps, userId: membre.id, ...(motive.fallback === undefined ? {} : { reason: motive.fallback }) }),
      (before) => ({ ...before, failedLoginAttempts: 0, lockedUntil: null, lockedReason: null }),
      'admin.quickEdit.attemptsDone',
    );

  const metadata = membre.adminMetadata;
  const birthIso = metadata?.birthDate ?? null;
  const age = ageOf(birthIso, moment);
  const birthDisplay =
    birthIso === null
      ? ''
      : age === null
        ? adminDate(birthIso, language, { timeZone: 'UTC' })
        : translateAdmin(language, 'admin.quickEdit.birthValue', { date: adminDate(birthIso, language, { timeZone: 'UTC' }), age: formatYears(age, language) });

  const presence = interpretPresence(getUserPresenceStatus({ isOnline: membre.isOnline, lastActiveAt: membre.lastActiveAt }, moment.getTime()), language);
  const locked = membre.lockedUntil !== null && new Date(membre.lockedUntil).getTime() > moment.getTime();
  const needsReset = membre.failedLoginAttempts > 0 || locked;
  const pseudoTaken = writes.failureOf('username')?.code === 'USERNAME_TAKEN';
  const suggestions = pseudoTaken ? (writes.failureOf('username')?.suggestions ?? []) : [];
  const roles = ADMIN_ROLES.map((role) => ({ value: role, label: interpretRole(role, language).label }));
  const field = { language, readOnly: !writable } as const;

  return (
    <section aria-labelledby={titleId} data-admin-quick-edit={folded ? 'folded' : 'open'} className={`${GLASS_CARD_CLASS} @container grid gap-4 p-4 md:p-5`} style={GLASS_CARD_EDGE}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-full" style={{ width: 40, height: 40, color: BRAND, backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 12%, transparent)' }}>
          <AdminGlyph name="pencilSimple" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-body font-semibold" style={{ color: INK }}>
            {t('admin.quickEdit.title')}
          </h2>
          {folded ? null : (
            <p className="text-caption" style={{ color: INK2 }}>
              {t('admin.quickEdit.subtitle')}
            </p>
          )}
        </div>
        <button
          type="button"
          data-admin-quick-edit-toggle=""
          aria-expanded={!folded}
          aria-controls={bodyId}
          aria-label={t(folded ? 'admin.quickEdit.unfold' : 'admin.quickEdit.fold')}
          onClick={toggle}
          className="grid shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ width: 44, height: 44, color: BRAND, outlineColor: BRAND }}
        >
          <AdminGlyph name={folded ? 'caretDown' : 'caretUp'} size={18} />
        </button>
      </div>

      {folded ? null : (
        <div id={bodyId} className="grid gap-4">
          <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
            <div className="grid gap-2">
              <AdminInlineField
                {...field}
                id="username"
                label={t('admin.create.username')}
                value={membre.username}
                display={`@${membre.username}`}
                status={pseudoTaken ? { phase: 'error', message: t('admin.create.usernameTaken') } : writes.statusOf('username')}
                onCommit={(username) => (username === '' ? undefined : profile('username', { username }))}
              />
              {suggestions.length === 0 ? null : (
                <div className="flex flex-wrap items-center gap-2" data-admin-quick-suggestions="">
                  <span className="text-caption" style={{ color: INK2 }}>
                    {t('admin.identity.suggestions')}
                  </span>
                  {suggestions.map((suggestion) => (
                    <AdminButton key={suggestion} data={{ 'data-admin-quick-suggestion': suggestion }} onClick={() => profile('username', { username: suggestion })}>
                      {suggestion}
                    </AdminButton>
                  ))}
                </div>
              )}
            </div>
            <AdminInlineField
              {...field}
              id="displayName"
              label={t('admin.edit.displayName')}
              value={membre.displayName}
              status={writes.statusOf('displayName')}
              onCommit={(displayName) => profile('displayName', { displayName: displayName === '' ? null : displayName })}
            />
            <AdminInlineField {...field} id="firstName" label={t('admin.create.firstName')} value={membre.firstName} status={writes.statusOf('firstName')} onCommit={(firstName) => profile('firstName', { firstName })} />
            <AdminInlineField {...field} id="lastName" label={t('admin.create.lastName')} value={membre.lastName} status={writes.statusOf('lastName')} onCommit={(lastName) => profile('lastName', { lastName })} />
            {metadata === null ? null : (
              <AdminInlineField
                {...field}
                id="birthDate"
                kind="date"
                label={t('admin.quickEdit.birthDate')}
                value={birthIso === null ? '' : birthIso.slice(0, 10)}
                display={birthDisplay}
                status={writes.statusOf('birthDate')}
                onCommit={(birthDate) => (birthDate === '' ? undefined : profile('birthDate', { birthDate }))}
              />
            )}
            <AdminInlineField
              {...field}
              id="role"
              kind="select"
              label={t('admin.user.role')}
              value={membre.role}
              options={roles}
              onCommit={changeRole}
            />
            <AdminInlineField
              {...field}
              id="active"
              kind="select"
              label={t('admin.quickEdit.account')}
              value={membre.isActive ? 'active' : 'inactive'}
              status={writes.statusOf('active')}
              options={[
                { value: 'active', label: t('admin.quickEdit.active') },
                { value: 'inactive', label: t('admin.quickEdit.inactive') },
              ]}
              onCommit={changeActive}
            />
            <div className="grid gap-1 rounded-card px-3 py-2" data-admin-quick-presence={presence.raw}>
              <span className="text-caption font-medium" style={{ color: INK3 }}>
                {t('admin.quickEdit.presence')}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <AdminInterpretedBadge value={presence} />
                {membre.isOnline || membre.lastActiveAt === null ? null : (
                  <span className="text-caption" style={{ color: INK2 }}>
                    {translateAdmin(language, 'admin.quickEdit.lastSeen', { date: adminDate(membre.lastActiveAt, language) })}
                  </span>
                )}
              </span>
            </div>
          </div>

          <div className="grid gap-3 rounded-card p-3" data-admin-quick-attempts={String(membre.failedLoginAttempts)} style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 4%, transparent)' }}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-caption font-medium" style={{ color: INK3 }}>
                  {t('admin.quickEdit.attempts')}
                </p>
                <p className="flex flex-wrap items-center gap-2 text-body font-semibold" style={{ color: INK }}>
                  {membre.failedLoginAttempts === 0 ? t('admin.quickEdit.attemptsNone') : translateAdmin(language, 'admin.quickEdit.attemptsCount', { count: membre.failedLoginAttempts.toLocaleString(language) })}
                  {locked ? (
                    <AdminBadge tone="warning" glyph="lock">
                      {translateAdmin(language, 'admin.people.lock.until', { date: adminDate(membre.lockedUntil, language) })}
                    </AdminBadge>
                  ) : null}
                </p>
              </div>
              {writable && needsReset ? (
                <AdminButton tone="primary" busy={writes.statusOf('attempts').phase === 'saving'} disabled={gestures.offline} data={{ 'data-admin-quick-reset': '' }} onClick={resetAttempts}>
                  <AdminGlyph name="arrowClockwise" size={16} />
                  {t('admin.quickEdit.attemptsReset')}
                </AdminButton>
              ) : null}
            </div>
            {(() => {
              const status = writes.statusOf('attempts');
              return status.phase === 'error' ? (
                <p role="alert" className="text-caption" style={{ color: 'var(--color-danger)' }} data-admin-quick-attempts-error="">
                  {status.message}
                </p>
              ) : null;
            })()}
          </div>

        </div>
      )}
      {writable || leading !== undefined || trailing !== undefined ? (
        <div role="group" aria-label={t('admin.quickEdit.gestures')} className={GESTURE_ROW} data-admin-quick-gestures="">
          {leading}
          {writable ? (
            <>
              <AdminButton tone="secondary" size="lg" disabled={gestures.offline} data={{ 'data-admin-quick-password': '' }} onClick={onOpenPassword}>
                <AdminGlyph name="lock" size={18} />
                {t('admin.quickEdit.regeneratePassword')}
              </AdminButton>
              <AdminButton tone="danger" size="lg" disabled={gestures.offline} data={{ 'data-admin-quick-ban': '' }} onClick={onOpenBan}>
                <AdminGlyph name="prohibit" size={18} />
                {t('admin.ban.open')}
              </AdminButton>
            </>
          ) : null}
          {trailing}
        </div>
      ) : null}
      {gestures.sheet}
    </section>
  );
}
