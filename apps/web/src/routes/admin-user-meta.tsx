import type { ReactNode } from 'react';

import { adminCount, adminDay, adminMoment } from '@/lib/admin/format';
import type { AdminUserDetail, AdminUserPrivate } from '@/lib/api/admin-user-detail';
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **TOUT CE QUE LA PASSERELLE SERT D'UN MEMBRE, RANGÉ** (#7845) — l'onglet
 * Profil de sa fiche. `decodeAdminUserDetail` décode une cinquantaine de
 * champs ; la fiche d'avant en montrait sept, et le reste était décodé,
 * persisté… et invisible.
 *
 * ## Rangé par QUESTION, pas par colonne
 *
 * Identité (qui est-ce ?), Compte (depuis quand, quel rôle ?), Langues (dans
 * quelle langue lit-il ? — le Prisme, dans l'ordre de ses rangs),
 * Vérifications, Sécurité, Consentements, Engagement, Métadonnées. Un
 * administrateur qui instruit une plainte cherche une réponse, pas un champ.
 *
 * ## Une date se LIT, elle ne se recopie pas (#6819)
 *
 * Tout horodatage passe par `adminMoment` (date et heure) ou `adminDay` (un
 * jour : naissance, fin de série) : la recette au navigateur interdit
 * l'ISO brut sur la fiche (`check-admin-souverain.mjs`). Une valeur absente se
 * dit par le tiret — jamais une ligne vide, qui ressemblerait à un oubli
 * d'affichage.
 *
 * ## Un consentement se lit en DATE
 *
 * « Donné le 3 mars » est ce qu'un administrateur cite ; « oui » ne dit ni
 * quand ni s'il a été retiré puis redonné. `null` se dit « — ».
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';

export function Section({ titre, id, children }: { readonly titre: string; readonly id?: string; readonly children: ReactNode }) {
  return (
    <section className="grid gap-2" {...(id === undefined ? {} : { 'data-admin-user-group': id })}>
      <h3 className="ps-1 text-caption font-semibold" style={{ color: INK2 }}>
        {titre}
      </h3>
      <dl
        className="grid divide-y rounded-card px-4"
        style={{ backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)', borderColor: 'var(--color-edge)' }}
      >
        {children}
      </dl>
    </section>
  );
}

export function Ligne({ label, valeur, id }: { readonly label: string; readonly valeur: string; readonly id?: string }) {
  return (
    <div
      className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2.5"
      style={{ borderColor: 'var(--color-edge)' }}
      {...(id === undefined ? {} : { 'data-admin-user-field': id })}
    >
      <dt className="shrink-0 text-caption" style={{ color: INK2 }}>
        {label}
      </dt>
      <dd className="min-w-0 break-words text-end text-body" style={{ color: INK }}>
        {valeur}
      </dd>
    </div>
  );
}

/** Une chaîne SERVIE, ou le tiret. */
const ouTiret = (valeur: string | null): string => (valeur === null || valeur === '' ? '—' : valeur);

/**
 * `prive` vient d'une lecture À PART, jamais persistée (`adminUserPrivateQueryOptions`) :
 * `undefined` tant qu'elle court — l'ellipse le dit, un tiret affirmerait
 * « aucune date de naissance » —, `null` si elle a échoué.
 */
export function AdminUserProfile({
  membre,
  prive,
  language,
}: {
  readonly membre: AdminUserDetail;
  readonly prive: AdminUserPrivate | null | undefined;
  readonly language: InterfaceLanguage;
}) {
  const t = (cle: AdminPlainCatalogKey) => translateAdmin(language, cle);
  const verifie = (date: string | null) => (date === null ? t('admin.user.notVerified') : adminMoment(date, language));
  const telephone = membre.phoneNumber === '' ? '' : `${membre.phoneCountryCode === '' ? '' : `${membre.phoneCountryCode} `}${membre.phoneNumber}`;
  const noms = [membre.firstName, membre.lastName].filter((n) => n !== '').join(' ');
  const emailEnAttente = prive?.pendingEmail ?? null;
  const telephoneEnAttente = prive?.pendingPhoneNumber ?? null;

  return (
    <div className="grid gap-5" data-admin-user-profile>
      <Section titre={t('admin.user.identity')} id="identity">
        <Ligne label={t('admin.edit.username')} valeur={`@${membre.username}`} id="username" />
        <Ligne label={t('admin.user.names')} valeur={ouTiret(noms)} id="names" />
        <Ligne label={t('admin.edit.email')} valeur={ouTiret(membre.email)} id="email" />
        {emailEnAttente === null ? null : <Ligne label={t('admin.user.pending')} valeur={emailEnAttente} id="pendingEmail" />}
        <Ligne label={t('admin.user.phone')} valeur={ouTiret(telephone)} id="phone" />
        {telephoneEnAttente === null ? null : (
          <Ligne label={t('admin.user.pending')} valeur={telephoneEnAttente} id="pendingPhone" />
        )}
        <Ligne
          label={t('admin.user.birthDate')}
          valeur={prive === undefined ? '…' : adminDay(prive?.birthDate ?? null, language)}
          id="birthDate"
        />
        <Ligne label={t('admin.edit.bio')} valeur={ouTiret(membre.bio)} id="bio" />
      </Section>

      <Section titre={t('admin.user.account')} id="account">
        <Ligne label={t('admin.user.role')} valeur={membre.role} id="role" />
        <Ligne label={t('admin.user.created')} valeur={adminMoment(membre.createdAt, language)} id="created" />
        <Ligne label={t('admin.user.updated')} valeur={adminMoment(membre.updatedAt, language)} id="updated" />
        <Ligne label={t('admin.user.lastActive')} valeur={adminMoment(membre.lastActiveAt, language)} id="lastActive" />
        <Ligne label={t('admin.user.onboarding')} valeur={adminMoment(membre.onboardingCompletedAt, language)} id="onboarding" />
        <Ligne
          label={translateAdmin(language, 'admin.user.terms', { version: membre.termsVersion ?? '—' })}
          valeur={adminMoment(membre.termsAcceptedAt, language)}
          id="terms"
        />
        <Ligne label={t('admin.user.timezone')} valeur={ouTiret(membre.timezone)} id="timezone" />
      </Section>

      <Section titre={t('admin.user.languages')} id="languages">
        <Ligne label={t('admin.user.systemLanguage')} valeur={ouTiret(membre.systemLanguage)} id="systemLanguage" />
        <Ligne label={t('admin.user.regionalLanguage')} valeur={ouTiret(membre.regionalLanguage)} id="regionalLanguage" />
        <Ligne label={t('admin.user.customLanguage')} valeur={ouTiret(membre.customDestinationLanguage)} id="customLanguage" />
        <Ligne label={t('admin.user.deviceLocale')} valeur={ouTiret(membre.deviceLocale)} id="deviceLocale" />
        <Ligne label={t('admin.user.deviceCountry')} valeur={ouTiret(membre.deviceCountry)} id="deviceCountry" />
      </Section>

      <Section titre={t('admin.user.verifications')} id="verifications">
        <Ligne label={t('admin.user.emailVerified')} valeur={verifie(membre.emailVerifiedAt)} id="emailVerified" />
        <Ligne label={t('admin.user.phoneVerified')} valeur={verifie(membre.phoneVerifiedAt)} id="phoneVerified" />
        <Ligne label={t('admin.user.ageVerified')} valeur={verifie(membre.ageVerifiedAt)} id="ageVerified" />
      </Section>

      <Section titre={t('admin.user.securityTitle')} id="security">
        <Ligne
          label={t('admin.user.twoFactor')}
          valeur={membre.twoFactorEnabled ? adminMoment(membre.twoFactorEnabledAt, language) : t('admin.users.inactive')}
          id="twoFactor"
        />
        <Ligne label={t('admin.user.failedLogins')} valeur={adminCount(membre.failedLoginAttempts, language)} id="failedLogins" />
        <Ligne label={t('admin.user.lastPasswordChange')} valeur={adminMoment(membre.lastPasswordChange, language)} id="lastPasswordChange" />
        {membre.lockedUntil === null ? null : (
          <Ligne
            label={translateAdmin(language, 'admin.user.locked', { date: adminMoment(membre.lockedUntil, language) })}
            valeur={ouTiret(membre.lockedReason)}
            id="locked"
          />
        )}
        <Ligne label={t('admin.user.blocked')} valeur={adminCount(membre.blockedCount, language)} id="blocked" />
      </Section>

      <Section titre={t('admin.user.consents')} id="consents">
        <Ligne label={t('admin.user.consent.dataProcessing')} valeur={adminMoment(membre.consents.dataProcessing, language)} id="consent-dataProcessing" />
        <Ligne label={t('admin.user.consent.analytics')} valeur={adminMoment(membre.consents.analytics, language)} id="consent-analytics" />
        <Ligne label={t('admin.user.consent.voiceProfile')} valeur={adminMoment(membre.consents.voiceProfile, language)} id="consent-voiceProfile" />
        <Ligne label={t('admin.user.consent.voiceData')} valeur={adminMoment(membre.consents.voiceData, language)} id="consent-voiceData" />
        <Ligne label={t('admin.user.consent.voiceCloning')} valeur={adminMoment(membre.consents.voiceCloning, language)} id="consent-voiceCloning" />
      </Section>

      <Section titre={t('admin.user.engagement')} id="engagement">
        <Ligne
          label={translateAdmin(language, 'admin.user.streak', {
            current: adminCount(membre.engagement.currentStreakDays, language),
            longest: adminCount(membre.engagement.longestStreakDays, language),
          })}
          valeur={adminDay(membre.engagement.lastStreakDate, language)}
          id="streak"
        />
        <Ligne label={t('admin.user.engagementScore')} valeur={adminCount(membre.engagement.engagementScore, language)} id="engagementScore" />
        <Ligne label={t('admin.user.meeshBalance')} valeur={adminCount(membre.engagement.meeshBalance, language)} id="meeshBalance" />
        <Ligne label={t('admin.user.meeshMinted')} valeur={adminCount(membre.engagement.meeshMintedLifetime, language)} id="meeshMinted" />
      </Section>

      <Section titre={t('admin.user.metadata')} id="metadata">
        <Ligne label={t('admin.user.id')} valeur={membre.id} id="id" />
        <Ligne label={t('admin.user.participations')} valeur={adminCount(membre.counts.participations, language)} id="participations" />
        <Ligne
          label={t('admin.activity.friendRequests')}
          valeur={`↑ ${adminCount(membre.counts.sentFriendRequests, language)} · ↓ ${adminCount(membre.counts.receivedFriendRequests, language)}`}
          id="friendRequests"
        />
        <Ligne label={t('admin.stats.shareLinks')} valeur={adminCount(membre.counts.createdShareLinks, language)} id="shareLinks" />
        <Ligne label={t('admin.stats.trackingLinks')} valeur={adminCount(membre.counts.createdTrackingLinks, language)} id="trackingLinks" />
        <Ligne label={t('admin.stats.affiliations')} valeur={adminCount(membre.counts.createdAffiliateTokens, language)} id="affiliations" />
      </Section>
    </div>
  );
}
