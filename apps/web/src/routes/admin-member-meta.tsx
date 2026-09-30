import type { ReactNode } from 'react';

import { AdminMetaPanel, AdminMetaRow, AdminMomentText, AdminTechnicalId } from '@/components/admin/meta';
import { interpretPresence } from '@/lib/admin/interpret/enums';
import { countryName, languageName, sentenceCase } from '@/lib/admin/interpret/language';
import { formatCount, formatPercent } from '@/lib/admin/interpret/numbers';
import { adminDate, adminMomentOf } from '@/lib/admin/interpret/time';
import { ageOf, deviceLabel, formatDays, formatYears } from '@/lib/admin/member-meta';
import type { AdminMemberMetadata, AdminUserDetail } from '@/lib/api/admin-user-detail';
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES MÉTADONNÉES D'UN MEMBRE, INTERPRÉTÉES** (#8005) — la colonne latérale de
 * la fiche. Chaque champ porte un libellé traduit et une valeur humaine : langue
 * NOMMÉE, pays nommé, date absolue ET relative, pourcentage, âge calculé, booléen
 * en mots, appareil lu depuis son agent utilisateur. Une phrase dessous quand le
 * sens n'est pas évident.
 *
 * Quatre panneaux, dont deux n'existent QUE si la passerelle les sert :
 * - « Identité et langues » : toujours ;
 * - « Métadonnées de compte » : seulement si le bloc `adminMetadata` est servi
 *   (BIGBOSS, ADMIN — `canViewSensitiveData`) ; jamais rempli de zéros sinon ;
 * - « Connexions » : seulement sous `canViewSensitiveData`, dont la marque est le
 *   nombre de codes de secours servi ;
 * - « Liens et parrainages » : les compteurs de la ligne, quand ils sont servis.
 *
 * Puis l'identifiant technique, seule ligne où un identifiant s'écrit.
 */
export function AdminMemberMeta({
  membre,
  language,
  now = () => new Date(),
  onAnnounce,
}: {
  readonly membre: AdminUserDetail;
  readonly language: InterfaceLanguage;
  readonly now?: () => Date;
  readonly onAnnounce?: (message: string) => void;
}) {
  const moment = now();
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const when = (iso: string | null, variant: 'both' | 'relative' = 'both') => <AdminMomentText moment={adminMomentOf(iso, moment, language)} variant={variant} />;
  const sensitive = membre.twoFactorBackupCodesRemaining !== null;
  const metadata = membre.adminMetadata;
  const hidden = interpretPresence('unknown', language);
  const notProvided = t('admin.value.notProvided');
  const fullName = [membre.firstName, membre.lastName].filter((part) => part !== '').join(' ');
  const rank = (code: string) => (code === '' ? t('admin.value.noLanguage') : sentenceCase(languageName(code, language), language));
  const signIn = (place: string, device: string): ReactNode => {
    const where = place === '' ? t('admin.people.meta.placeUnknown') : place;
    const what = deviceLabel(device, language);
    return what === null ? where : translateAdmin(language, 'admin.people.meta.signDetail', { place: where, device: what });
  };

  return (
    <>
      <AdminMetaPanel title={t('admin.people.meta.identity')}>
        {fullName === '' ? null : <AdminMetaRow anchor="name" label={t('admin.meta.name')} value={fullName} />}
        <AdminMetaRow anchor="systemLanguage" label={t('admin.meta.systemLanguage')} value={rank(membre.systemLanguage)} explain={t('admin.people.meta.prismExplain')} />
        <AdminMetaRow anchor="regionalLanguage" label={t('admin.meta.regionalLanguage')} value={rank(membre.regionalLanguage)} />
        <AdminMetaRow anchor="customLanguage" label={t('admin.meta.customLanguage')} value={rank(membre.customDestinationLanguage)} />
        <AdminMetaRow anchor="timezone" label={t('admin.meta.timezone')} value={membre.timezone === '' ? notProvided : membre.timezone} />
        {sensitive ? <AdminMetaRow anchor="registrationCountry" label={t('admin.people.meta.registrationCountry')} value={countryName(membre.registrationCountry, language)} /> : null}
        {membre.profileCompletionRate === null ? null : (
          <AdminMetaRow anchor="completion" label={t('admin.meta.completion')} value={formatPercent(membre.profileCompletionRate, 'hundred', language)} />
        )}
        <AdminMetaRow anchor="createdAt" label={t('admin.user.created')} value={when(membre.createdAt)} />
        <AdminMetaRow
          anchor="lastActive"
          label={t('admin.user.lastActive')}
          value={membre.lastActiveAt === null ? hidden.label : when(membre.lastActiveAt)}
          explain={membre.lastActiveAt === null ? hidden.explain : null}
        />
        <AdminMetaRow anchor="updatedAt" label={t('admin.meta.updated')} value={when(membre.updatedAt)} />
      </AdminMetaPanel>

      {metadata === null ? null : <AccountMetadata metadata={metadata} language={language} now={moment} />}

      {sensitive ? (
        <AdminMetaPanel title={t('admin.people.meta.sign')}>
          <AdminMetaRow anchor="lastLogin" label={t('admin.people.meta.lastLogin')} value={signIn(membre.lastLoginLocation, membre.lastLoginDevice)} />
          <AdminMetaRow anchor="registration" label={t('admin.people.meta.registration')} value={signIn(membre.registrationLocation, membre.registrationDevice)} />
          <AdminMetaRow
            anchor="failedLogins"
            label={t('admin.meta.failedLogins')}
            value={formatCount(membre.failedLoginAttempts, language)}
            explain={membre.failedLoginAttempts > 0 ? t('admin.people.meta.failedLoginsExplain') : null}
          />
          <AdminMetaRow
            anchor="lock"
            label={t('admin.people.meta.lock')}
            value={
              membre.lockedUntil !== null && new Date(membre.lockedUntil).getTime() > moment.getTime()
                ? translateAdmin(language, 'admin.people.lock.until', { date: adminDate(membre.lockedUntil, language) })
                : t('admin.people.meta.lockNone')
            }
            explain={membre.lockedReason}
          />
          <AdminMetaRow
            anchor="passwordChanged"
            label={t('admin.password.field')}
            value={
              membre.lastPasswordChange === null
                ? t('admin.people.password.neverChanged')
                : translateAdmin(language, 'admin.people.password.changedOn', { date: adminDate(membre.lastPasswordChange, language) })
            }
          />
          {membre.twoFactorEnabled ? (
            <AdminMetaRow
              anchor="backupCodes"
              label={t('admin.people.meta.backupCodes')}
              value={translateAdmin(language, 'admin.people.twoFactor.codes', { count: formatCount(membre.twoFactorBackupCodesRemaining, language) })}
            />
          ) : null}
        </AdminMetaPanel>
      ) : null}

      {membre.counts === null ? null : (
        <AdminMetaPanel title={t('admin.people.meta.links')}>
          <AdminMetaRow anchor="shareLinks" label={t('admin.people.meta.shareLinks')} value={formatCount(membre.counts.shareLinks, language)} />
          <AdminMetaRow anchor="trackingLinks" label={t('admin.people.meta.trackingLinks')} value={formatCount(membre.counts.trackingLinks, language)} />
          <AdminMetaRow anchor="affiliateTokens" label={t('admin.people.meta.affiliateTokens')} value={formatCount(membre.counts.affiliateTokens, language)} />
          <AdminMetaRow anchor="referralsGiven" label={t('admin.people.meta.referralsGiven')} value={formatCount(membre.counts.affiliateRelations, language)} />
          <AdminMetaRow anchor="referralsReceived" label={t('admin.people.meta.referralsReceived')} value={formatCount(membre.counts.referredRelations, language)} />
          <AdminMetaRow anchor="requestsSent" label={t('admin.people.meta.requestsSent')} value={formatCount(membre.counts.sentFriendRequests, language)} />
          <AdminMetaRow anchor="requestsReceived" label={t('admin.people.meta.requestsReceived')} value={formatCount(membre.counts.receivedFriendRequests, language)} />
        </AdminMetaPanel>
      )}

      <AdminMetaPanel title={t('admin.kit.techId')}>
        <AdminTechnicalId language={language} id={membre.id} {...(onAnnounce === undefined ? {} : { onAnnounce })} />
      </AdminMetaPanel>
    </>
  );
}

const CONSENTS = [
  ['consent-voiceProfile', 'admin.people.consent.voiceProfile', 'voiceProfileConsentAt'],
  ['consent-voiceData', 'admin.people.consent.voiceData', 'voiceDataConsentAt'],
  ['consent-dataProcessing', 'admin.people.consent.dataProcessing', 'dataProcessingConsentAt'],
  ['consent-analytics', 'admin.people.consent.analytics', 'analyticsConsentAt'],
  ['consent-voiceCloning', 'admin.people.consent.voiceCloning', 'voiceCloningEnabledAt'],
] as const satisfies readonly (readonly [string, AdminPlainCatalogKey, keyof AdminMemberMetadata])[];

function AccountMetadata({ metadata, language, now }: { readonly metadata: AdminMemberMetadata; readonly language: InterfaceLanguage; readonly now: Date }) {
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const notProvided = t('admin.value.notProvided');
  const yesNo = (value: boolean) => t(value ? 'admin.value.yes' : 'admin.value.no');
  const age = ageOf(metadata.birthDate, now);

  return (
    <AdminMetaPanel title={t('admin.people.meta.accountTitle')}>
      <AdminMetaRow
        anchor="deviceLocale"
        label={t('admin.people.meta.deviceLocale')}
        value={metadata.deviceLocale === null ? notProvided : sentenceCase(languageName(metadata.deviceLocale, language), language)}
        explain={t('admin.people.meta.deviceLocaleExplain')}
      />
      <AdminMetaRow anchor="deviceCountry" label={t('admin.people.meta.deviceCountry')} value={metadata.deviceCountry === null ? notProvided : countryName(metadata.deviceCountry, language)} />
      <AdminMetaRow
        anchor="age"
        label={t('admin.people.meta.age')}
        value={
          metadata.birthDate === null
            ? notProvided
            : translateAdmin(language, 'admin.people.meta.ageValue', {
                age: age === null ? notProvided : formatYears(age, language),
                date: adminDate(metadata.birthDate, language),
              })
        }
        explain={metadata.birthDate === null ? null : t('admin.people.meta.ageExplain')}
      />
      <AdminMetaRow
        anchor="ageVerified"
        label={t('admin.people.meta.ageVerified')}
        value={metadata.ageVerifiedAt === null ? t('admin.contact.unverified') : translateAdmin(language, 'admin.people.proof.verifiedOn', { date: adminDate(metadata.ageVerifiedAt, language) })}
      />
      {CONSENTS.map(([anchor, label, field]) => {
        const at = metadata[field];
        const given = typeof at === 'string' ? at : null;
        return (
          <AdminMetaRow
            key={anchor}
            anchor={anchor}
            label={t(label)}
            value={given === null ? t('admin.people.consent.notGiven') : translateAdmin(language, 'admin.people.consent.givenOn', { date: adminDate(given, language) })}
          />
        );
      })}
      <AdminMetaRow
        anchor="terms"
        label={t('admin.people.meta.terms')}
        value={
          metadata.termsAcceptedAt === null
            ? t('admin.people.meta.termsNone')
            : translateAdmin(language, 'admin.people.meta.termsValue', {
                version: metadata.termsVersion ?? notProvided,
                date: adminDate(metadata.termsAcceptedAt, language),
              })
        }
      />
      <AdminMetaRow
        anchor="onboarding"
        label={t('admin.people.meta.onboarding')}
        value={
          metadata.onboardingCompletedAt === null
            ? t('admin.people.meta.onboardingNone')
            : translateAdmin(language, 'admin.people.meta.onboardingDone', { date: adminDate(metadata.onboardingCompletedAt, language) })
        }
      />
      <AdminMetaRow
        anchor="streak"
        label={t('admin.people.meta.streak')}
        value={translateAdmin(language, 'admin.people.meta.streakValue', {
          current: formatDays(metadata.currentStreakDays, language),
          longest: formatDays(metadata.longestStreakDays, language),
        })}
      />
      <AdminMetaRow anchor="engagement" label={t('admin.people.meta.engagement')} value={formatCount(metadata.engagementScore, language)} explain={t('admin.people.meta.engagementExplain')} />
      <AdminMetaRow anchor="meesh" label={t('admin.people.meta.meesh')} value={formatCount(metadata.meeshBalance, language)} />
      <AdminMetaRow
        anchor="blocked"
        label={t('admin.people.meta.blocked')}
        value={metadata.blockedCount === 0 ? t('admin.people.meta.blockedNone') : translateAdmin(language, 'admin.people.meta.blockedCount', { count: formatCount(metadata.blockedCount, language) })}
      />
      <AdminMetaRow anchor="pendingEmail" label={t('admin.people.meta.pendingEmail')} value={yesNo(metadata.hasPendingEmail)} explain={metadata.hasPendingEmail ? t('admin.people.meta.pendingExplain') : null} />
      <AdminMetaRow anchor="pendingPhone" label={t('admin.people.meta.pendingPhone')} value={yesNo(metadata.hasPendingPhone)} explain={metadata.hasPendingPhone ? t('admin.people.meta.pendingExplain') : null} />
    </AdminMetaPanel>
  );
}
