import type { ReactNode } from 'react';

import { AdminBadge } from '@/components/admin/badges';
import { adminDate } from '@/lib/admin/interpret/time';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import { ADMIN_WRITABLE_CONSENTS, setAdminUserConsent, unlockAdminUser, type AdminConsent } from '@/lib/api/admin-user-security';
import { setAdminUserTwoFactor, setAdminUserVerification, type AdminProofChannel } from '@/lib/api/admin-user-verifications';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminPlainCatalogKey, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { useMemberGestures, type MemberGesture } from './admin-member-gestures';
import { INK, INK2, MemberSection, SectionButton } from './admin-member-parts';

/**
 * **LA SÉCURITÉ D'UN MEMBRE** (#8289, #8004) — ce qui protège le compte, dit en mots,
 * et les gestes qui le changent, chacun CONFIRMÉ et proposé seulement s'il a un effet :
 *
 * - le MOT DE PASSE : la feuille des quatre niveaux (#8051), centrée ;
 * - le VERROU : « Déverrouiller le compte » n'existe que tant que `lockedUntil` est futur ;
 * - la DOUBLE AUTHENTIFICATION : seul le retrait est offert (le chemin de récupération
 *   d'un appareil perdu) — l'armer exige une application que le MEMBRE a appairée, la
 *   passerelle le refuse sinon : un bouton voué au 409 n'est pas dessiné ;
 * - les PREUVES : e-mail, téléphone, âge, à poser ou à retirer — l'âge seulement quand le bloc
 *   `adminMetadata` est servi (sans lui on ignore l'état, donc l'effet) ;
 * - les CONSENTEMENTS : au rang souverain seulement, motif écrit d'au moins dix caractères —
 *   poser au nom d'autrui qu'il a consenti à l'usage de sa voix fabrique une pièce légale ;
 * - les SESSIONS : leur nombre, et l'onglet Sécurité qui les liste et les révoque une à une.
 *
 * Sans `canManageUsers`, aucun geste n'est dessiné (un 403 qui s'afficherait quand même se dit
 * comme un refus, jamais comme une panne). Hors ligne ils sont désactivés.
 */

const MOTIVE_MIN_OPTIONAL = 3;
const MOTIVE_MIN_SOVEREIGN = 10;

const PROOF_LABELS = {
  email: 'admin.people.proof.email',
  phone: 'admin.people.proof.phone',
  age: 'admin.people.proof.age',
} as const satisfies Readonly<Record<AdminProofChannel, string>>;

const CONSENT_LABELS = {
  voiceProfile: 'admin.people.consent.voiceProfile',
  voiceData: 'admin.people.consent.voiceData',
  dataProcessing: 'admin.people.consent.dataProcessing',
  voiceCloning: 'admin.people.consent.voiceCloning',
} as const satisfies Readonly<Record<AdminConsent, string>>;

const CONSENT_DATES = {
  voiceProfile: 'voiceProfileConsentAt',
  voiceData: 'voiceDataConsentAt',
  dataProcessing: 'dataProcessingConsentAt',
  voiceCloning: 'voiceCloningEnabledAt',
} as const satisfies Readonly<Record<AdminConsent, string>>;

const isFuture = (iso: string | null, now: Date): boolean => iso !== null && new Date(iso).getTime() > now.getTime();

function Row({ anchor, title, state, hint, action }: { readonly anchor: string; readonly title: string; readonly state: ReactNode; readonly hint?: string; readonly action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3" data-admin-security={anchor}>
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium" style={{ color: INK }}>
          {title}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-0.5">{state}</div>
        {hint === undefined ? null : (
          <p className="pt-0.5 text-caption" style={{ color: INK2 }}>
            {hint}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function AdminMemberSecuritySection({
  membre,
  language,
  sessions,
  onAnnounce,
  onOpenPassword,
  onOpenSessions,
  deps = apiDeps,
  now = () => new Date(),
}: {
  readonly membre: AdminUserDetail;
  readonly language: AdminLanguage;
  /** Le nombre de sessions actives servi par `…/stats`, `null` tant qu'il ne l'est pas. */
  readonly sessions: number | null;
  readonly onAnnounce: (texte: string) => void;
  readonly onOpenPassword: () => void;
  readonly onOpenSessions: () => void;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
}) {
  const reach = useAdminReach();
  const gestures = useMemberGestures({ membre, language, onAnnounce });
  const writable = reach.can('canManageUsers');
  const moment = now();
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const metadata = membre.adminMetadata;

  const button = (gesture: MemberGesture, label: string, tone: 'primary' | 'secondary' | 'danger' = 'secondary') =>
    writable ? (
      <SectionButton tone={tone} disabled={gestures.offline} data={{ 'data-admin-action': gesture.id }} onClick={() => gestures.ask(gesture)}>
        {label}
      </SectionButton>
    ) : null;

  const unlock: MemberGesture = {
    id: 'unlock',
    title: t('admin.people.unlock.title'),
    body: t('admin.people.unlock.body'),
    confirmLabel: t('admin.people.unlock.confirm'),
    tone: 'primary',
    motive: { label: t('admin.edit.reason'), minLength: MOTIVE_MIN_OPTIONAL, required: false },
    success: 'admin.people.unlock.done',
    call: (reason) => unlockAdminUser({ ...deps, userId: membre.id, ...(reason === null || reason === '' ? {} : { reason }) }),
  };

  const removeTwoFactor: MemberGesture = {
    id: 'remove-two-factor',
    title: t('admin.people.twoFactor.title'),
    body: t('admin.people.twoFactor.body'),
    confirmLabel: t('admin.people.twoFactor.confirm'),
    tone: 'danger',
    motive: { label: t('admin.people.motive.required'), minLength: MOTIVE_MIN_SOVEREIGN, required: true },
    success: 'admin.people.twoFactor.done',
    call: (reason) => setAdminUserTwoFactor({ ...deps, userId: membre.id, enabled: false, ...(reason === null ? {} : { reason }) }),
  };

  const proofGesture = (channel: AdminProofChannel, verified: boolean): MemberGesture => ({
    id: `${verified ? 'verify' : 'unverify'}-${channel}`,
    title: translateAdmin(language, verified ? 'admin.people.proof.verifyTitle' : 'admin.people.proof.unverifyTitle', { proof: t(PROOF_LABELS[channel]) }),
    body: t(verified ? 'admin.people.proof.verifyBody' : 'admin.people.proof.unverifyBody'),
    confirmLabel: t(verified ? 'admin.people.proof.verifyConfirm' : 'admin.people.proof.unverifyConfirm'),
    tone: verified ? 'primary' : 'danger',
    motive: { label: t('admin.edit.reason'), minLength: MOTIVE_MIN_OPTIONAL, required: false },
    success: 'admin.people.proof.done',
    call: (reason) => setAdminUserVerification({ ...deps, userId: membre.id, channel, verified, ...(reason === null || reason === '' ? {} : { reason }) }),
  });

  const consentGesture = (consent: AdminConsent, granted: boolean): MemberGesture => ({
    id: `${granted ? 'grant' : 'revoke'}-consent-${consent}`,
    title: translateAdmin(language, granted ? 'admin.people.consent.grantTitle' : 'admin.people.consent.revokeTitle', { consent: t(CONSENT_LABELS[consent]) }),
    body: t(granted ? 'admin.people.consent.grantBody' : 'admin.people.consent.revokeBody'),
    confirmLabel: t(granted ? 'admin.people.consent.grantConfirm' : 'admin.people.consent.revokeConfirm'),
    tone: granted ? 'primary' : 'danger',
    motive: { label: t('admin.people.motive.required'), minLength: MOTIVE_MIN_SOVEREIGN, required: true },
    success: 'admin.people.consent.done',
    call: (reason) => setAdminUserConsent({ ...deps, userId: membre.id, consent, granted, reason: reason ?? '' }),
  });

  const proofRows: readonly { readonly channel: AdminProofChannel; readonly at: string | null }[] = [
    ...(membre.email === '' ? [] : [{ channel: 'email' as const, at: membre.emailVerifiedAt }]),
    ...(membre.phoneNumber === '' ? [] : [{ channel: 'phone' as const, at: membre.phoneVerifiedAt }]),
    ...(metadata === null ? [] : [{ channel: 'age' as const, at: metadata.ageVerifiedAt }]),
  ];

  const locked = isFuture(membre.lockedUntil, moment);

  return (
    <>
      <MemberSection name="security" titre={t('admin.tab.security')} language={language} dirty={null} state={gestures.state}>
        <Row
          anchor="password"
          title={t('admin.password.field')}
          state={
            <span className="text-caption" style={{ color: INK2 }}>
              {membre.lastPasswordChange === null
                ? t('admin.people.password.neverChanged')
                : translateAdmin(language, 'admin.people.password.changedOn', { date: adminDate(membre.lastPasswordChange, language) })}
            </span>
          }
          action={
            <SectionButton tone="danger" data={{ 'data-admin-password-open': '' }} onClick={onOpenPassword}>
              {t('admin.password.title')}
            </SectionButton>
          }
        />

        {locked ? (
          <Row
            anchor="lock"
            title={t('admin.people.lock.title')}
            state={
              <AdminBadge tone="warning" glyph="lock">
                {translateAdmin(language, 'admin.people.lock.until', { date: adminDate(membre.lockedUntil, language) })}
              </AdminBadge>
            }
            hint={membre.lockedReason ?? t('admin.people.lock.explain')}
            action={button(unlock, t('admin.people.unlock.confirm'), 'primary')}
          />
        ) : null}

        <Row
          anchor="two-factor"
          title={t('admin.user.twoFactor')}
          state={
            membre.twoFactorEnabled ? (
              <>
                <AdminBadge tone="success" glyph="shieldCheck">
                  {t('admin.people.twoFactor.on')}
                </AdminBadge>
                {membre.twoFactorBackupCodesRemaining === null ? null : (
                  <span className="text-caption" style={{ color: INK2 }}>
                    {translateAdmin(language, 'admin.people.twoFactor.codes', { count: String(membre.twoFactorBackupCodesRemaining) })}
                  </span>
                )}
              </>
            ) : (
              <AdminBadge tone="neutral">{t('admin.people.twoFactor.off')}</AdminBadge>
            )
          }
          hint={membre.twoFactorEnabled ? t('admin.security.twoFactorHint') : t('admin.people.twoFactor.offExplain')}
          action={membre.twoFactorEnabled ? button(removeTwoFactor, t('admin.people.twoFactor.confirm'), 'danger') : null}
        />

        {proofRows.map(({ channel, at }) => (
          <Row
            key={channel}
            anchor={`proof-${channel}`}
            title={t(PROOF_LABELS[channel])}
            state={
              at === null ? (
                <AdminBadge tone="neutral">{t('admin.contact.unverified')}</AdminBadge>
              ) : (
                <AdminBadge tone="success" glyph="checkCircle">
                  {translateAdmin(language, 'admin.people.proof.verifiedOn', { date: adminDate(at, language) })}
                </AdminBadge>
              )
            }
            action={
              at === null
                ? button(proofGesture(channel, true), t('admin.contact.markVerified'))
                : button(proofGesture(channel, false), t('admin.contact.markUnverified'))
            }
          />
        ))}

        {reach.isSovereign && metadata !== null ? (
          <div className="grid gap-3" data-admin-security="consents">
            <p className="text-body font-semibold" style={{ color: INK }}>
              {t('admin.voice.consents')}
            </p>
            {ADMIN_WRITABLE_CONSENTS.map((consent) => {
              const at = metadata[CONSENT_DATES[consent]];
              return (
                <Row
                  key={consent}
                  anchor={`consent-${consent}`}
                  title={t(CONSENT_LABELS[consent])}
                  state={
                    at === null ? (
                      <AdminBadge tone="neutral">{t('admin.people.consent.notGiven')}</AdminBadge>
                    ) : (
                      <AdminBadge tone="success" glyph="checkCircle">
                        {translateAdmin(language, 'admin.people.consent.givenOn', { date: adminDate(at, language) })}
                      </AdminBadge>
                    )
                  }
                  action={
                    at === null
                      ? button(consentGesture(consent, true), t('admin.people.consent.grantConfirm'))
                      : button(consentGesture(consent, false), t('admin.people.consent.revokeConfirm'), 'danger')
                  }
                />
              );
            })}
            <p className="text-caption" style={{ color: INK2 }}>
              {t('admin.people.consent.analyticsReadOnly')}
            </p>
          </div>
        ) : null}

        <Row
          anchor="sessions"
          title={t('admin.stats.activeSessions')}
          state={
            sessions === null ? null : (
              <span className="font-semibold tabular-nums" data-admin-sessions-count={String(sessions)} style={{ color: INK }}>
                {sessions.toLocaleString(language)}
              </span>
            )
          }
          action={
            <SectionButton data={{ 'data-admin-sessions-open': '' }} onClick={onOpenSessions}>
              {t('admin.security.sessionsOpen')}
            </SectionButton>
          }
        />
      </MemberSection>
      {gestures.sheet}
    </>
  );
}
