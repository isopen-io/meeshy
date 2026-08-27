'use client';

import { memo } from 'react';
import { Ghost, Mail, Cake, Globe, MapPin, Link2, CalendarClock, Ban, ShieldCheck, Settings2, History, X } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import type {
  ParticipantProfile,
  ParticipantEntryCapabilities,
} from '@/hooks/queries/use-participant-profile';

/**
 * Les capacités, dans l'ordre où elles comptent pour qui lit la fiche.
 *
 * La carte n'énonce que les REFUS. Lister sept autorisations dont six accordées
 * noierait l'unique information utile, et une fiche qui récite des permissions
 * se lit comme un formulaire plutôt que comme une présentation.
 *
 * `canViewHistory` vient en tête : c'est la restriction qui explique le plus de
 * comportements observables — quelqu'un qui ne réagit jamais à ce qui précède
 * son arrivée ne l'ignore pas, il ne l'a jamais vu.
 */
const CAPABILITY_ORDER: readonly (keyof ParticipantEntryCapabilities)[] = [
  'canViewHistory',
  'canSendMessages',
  'canSendImages',
  'canSendFiles',
  'canSendVideos',
  'canSendAudios',
  'canSendLinks',
  'canSendLocations',
];

/**
 * Vocabulaire ALIGNÉ sur `bubble.joinNotice.rule.*`, qui énonce déjà les mêmes
 * règles dans l'avis d'arrivée — « messages », « photos », « fichiers ». Deux
 * formulations concurrentes pour une seule règle se liraient comme deux règles.
 * Jumeau iOS : `ParticipantProfileSheet.deniedLabel`.
 */
/**
 * Les mêmes droits, énoncés à l'ENDROIT — un interrupteur se lit « ce qu'il
 * accorde », pas « ce qu'il refuse ». Le libellé négatif de la lecture (« Ne
 * peut pas… ») deviendrait illisible à côté d'un interrupteur allumé.
 */
const CAPABILITY_ALLOWED_FALLBACK: Record<keyof ParticipantEntryCapabilities, string> = {
  canViewHistory: 'Voir les messages antérieurs',
  canSendMessages: 'Écrire des messages',
  canSendImages: 'Envoyer des photos',
  canSendFiles: 'Envoyer des fichiers',
  canSendVideos: 'Envoyer des vidéos',
  canSendAudios: 'Envoyer de l’audio',
  canSendLinks: 'Envoyer des liens',
  canSendLocations: 'Partager sa position',
};

const CAPABILITY_DENIED_FALLBACK: Record<keyof ParticipantEntryCapabilities, string> = {
  canViewHistory: 'Ne voit pas les messages antérieurs à son arrivée',
  canSendMessages: 'Ne peut pas écrire de messages',
  canSendImages: 'Ne peut pas envoyer de photos',
  canSendFiles: 'Ne peut pas envoyer de fichiers',
  canSendVideos: 'Ne peut pas envoyer de vidéos',
  canSendAudios: 'Ne peut pas envoyer d’audio',
  canSendLinks: 'Ne peut pas envoyer de liens',
  canSendLocations: 'Ne peut pas partager sa position',
};

interface ParticipantProfileCardProps {
  readonly profile: ParticipantProfile;
  readonly className?: string;
  /**
   * Fourni quand le lecteur peut écrire les droits de ce visiteur. Son absence
   * met la section en lecture seule.
   *
   * La carte ne décide pas de ce droit : l'arbitrage appartient au gateway, qui
   * sert ou non `entryLink`, et au conteneur qui branche ce callback. Une carte
   * qui trancherait elle-même rejouerait côté client une règle d'autorisation.
   */
  readonly onToggleCapability?: (capability: keyof ParticipantEntryCapabilities, value: boolean) => void;
  /**
   * Fourni quand le lecteur peut poser/retirer l'octroi d'historique par date
   * sur CE participant. `null` retire l'octroi. Même règle que
   * `onToggleCapability` : la carte ne décide pas de ce droit —
   * `profile.canGrantHistory` en est la réponse sûre, et seul le conteneur la
   * consulte pour brancher ce callback ou non.
   */
  readonly onSetHistoryGrant?: (historyVisibleFrom: string | null) => void;
  /** Écriture de l'octroi en cours — désactive le contrôle. */
  readonly historyGrantPending?: boolean;
  /** Message à afficher après un échec d'écriture (le rollback est déjà fait). */
  readonly historyGrantError?: string | null;
}

/** `historyVisibleFrom` (ISO 8601) → valeur d'un `<input type="date">`. */
function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

/** Aucune date future : un plancher futur masquerait tout, y compris au participant lui-même. */
function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ProfileRowProps {
  readonly testId: string;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly value: string | null;
  /** Fourni par la personne, mais hors du cercle du lecteur. */
  readonly withheld?: boolean;
  readonly withheldLabel?: string;
}

/**
 * Une ligne de fiche. `withheld` distingue « il n'y a rien » de « il y a
 * quelque chose que vous ne voyez pas » — sans cette nuance, un visiteur qui a
 * tout rempli et un visiteur qui n'a rien donné s'affichent pareil, et l'hôte
 * ne peut pas savoir si sa condition d'entrée a été honorée.
 */
function ProfileRow({ testId, icon, label, value, withheld, withheldLabel }: ProfileRowProps) {
  return (
    <div
      data-testid={testId}
      data-withheld={withheld ? 'true' : undefined}
      className="flex items-center gap-2 text-sm"
    >
      <span className="flex-shrink-0 text-gray-400 dark:text-gray-500">{icon}</span>
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span
        className={cn(
          'ml-auto truncate',
          withheld ? 'italic text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'
        )}
      >
        {withheld ? withheldLabel : value}
      </span>
    </div>
  );
}

/**
 * Fiche d'un participant — écrite d'abord pour ceux qui n'ont PAS de compte.
 *
 * Sur le web, l'immense majorité des gens arrivent par invitation : le visiteur
 * sans compte est le cas courant, pas le cas limite. Il a rempli un formulaire
 * pour entrer, et rien de ce qu'il y a écrit n'était lisible ensuite.
 *
 * Le fantôme et la mention « sans compte » vont ENSEMBLE : un glyphe seul ne se
 * lit ni par un lecteur d'écran, ni par quelqu'un qui ignore la convention.
 *
 * Les coordonnées suivent la règle posée côté gateway — servies `null` à un
 * membre ordinaire, accompagnées de `hasEmail` / `hasBirthday`. La carte le
 * traduit en trois états et pas deux : absent (aucune ligne), fourni-et-masqué
 * (ligne en italique), fourni-et-visible (valeur).
 */
export const ParticipantProfileCard = memo(function ParticipantProfileCard({
  profile,
  className,
  onToggleCapability,
  onSetHistoryGrant,
  historyGrantPending,
  historyGrantError,
}: ParticipantProfileCardProps) {
  const { t } = useI18n('conversations');

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim()
    || profile.displayName
    || profile.username
    || '';

  const joinedLabel = profile.joinedAt
    ? new Date(profile.joinedAt).toLocaleDateString()
    : null;
  const birthdayLabel = profile.birthday
    ? new Date(profile.birthday).toLocaleDateString()
    : null;

  const capabilities = profile.entryCapabilities;
  const deniedCapabilities = capabilities
    ? CAPABILITY_ORDER.filter((capability) => !capabilities[capability])
    : [];

  const entryLinkExpiry = profile.entryLink?.expiresAt
    ? new Date(profile.entryLink.expiresAt).toLocaleDateString()
    : null;

  // Les exigences d'entrée se lisent ensemble : « pseudo · email » dit en un
  // coup d'œil ce que l'hôte a demandé pour laisser passer. Une ligne par
  // exigence transformerait trois booléens en trois lignes de formulaire.
  const entryLinkRequirements = profile.entryLink
    ? [
        profile.entryLink.requireNickname && t('participantProfile.requireNickname', 'pseudo'),
        profile.entryLink.requireEmail && t('participantProfile.requireEmail', 'email'),
        profile.entryLink.requireBirthday && t('participantProfile.requireBirthday', 'date de naissance'),
      ].filter((requirement): requirement is string => Boolean(requirement))
    : [];

  return (
    <div className={cn('space-y-3', className)} data-testid="participant-profile-card">
      <div className="flex items-center gap-2">
        {profile.isAnonymous && (
          <Ghost
            className="h-5 w-5 flex-shrink-0 text-purple-600 dark:text-purple-400"
            aria-hidden="true"
          />
        )}
        <div className="min-w-0">
          <div
            data-testid="participant-profile-name"
            className="truncate text-base font-semibold text-gray-900 dark:text-gray-50"
          >
            {fullName}
          </div>
          <div
            data-testid="participant-profile-username"
            className="truncate text-xs text-gray-500 dark:text-gray-400"
          >
            @{profile.username}
          </div>
        </div>
        {profile.isAnonymous && (
          <span
            data-testid="participant-profile-no-account"
            className="ml-auto flex-shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
          >
            {t('participantProfile.noAccount', 'sans compte')}
          </span>
        )}
      </div>

      <div className="space-y-1.5 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
        {profile.language && (
          <ProfileRow
            testId="participant-profile-language"
            icon={<Globe className="h-3.5 w-3.5" />}
            label={t('participantProfile.language', 'Langue')}
            value={profile.language.toUpperCase()}
          />
        )}
        {profile.country && (
          <ProfileRow
            testId="participant-profile-country"
            icon={<MapPin className="h-3.5 w-3.5" />}
            label={t('participantProfile.country', 'Pays')}
            value={profile.country}
          />
        )}
        {joinedLabel && (
          <ProfileRow
            testId="participant-profile-joined"
            icon={<CalendarClock className="h-3.5 w-3.5" />}
            label={t('participantProfile.joined', 'Arrivé le')}
            value={joinedLabel}
          />
        )}
        {profile.shareLinkName && (
          <ProfileRow
            testId="participant-profile-link"
            icon={<Link2 className="h-3.5 w-3.5" />}
            label={t('participantProfile.viaLink', 'Par le lien')}
            value={profile.shareLinkName}
          />
        )}
        {profile.hasEmail && (
          <ProfileRow
            testId="participant-profile-email"
            icon={<Mail className="h-3.5 w-3.5" />}
            label={t('participantProfile.email', 'Email')}
            value={profile.email}
            withheld={!profile.email}
            withheldLabel={t('participantProfile.withheld', 'fourni, réservé aux modérateurs')}
          />
        )}
        {profile.hasBirthday && (
          <ProfileRow
            testId="participant-profile-birthday"
            icon={<Cake className="h-3.5 w-3.5" />}
            label={t('participantProfile.birthday', 'Naissance')}
            value={birthdayLabel}
            withheld={!profile.birthday}
            withheldLabel={t('participantProfile.withheld', 'fourni, réservé aux modérateurs')}
          />
        )}
      </div>

      {profile.entryCapabilities && (
        <div className="space-y-1.5" data-testid="participant-profile-capabilities">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t('participantProfile.capabilities', 'Dans cette conversation')}
          </div>
          {onToggleCapability && capabilities ? (
            // En lecture, la carte n'énonce que les refus. En ÉDITION il faut
            // les huit : on ne peut pas accorder un droit qu'on ne montre pas.
            <ul className="space-y-1">
              {CAPABILITY_ORDER.map((capability) => {
                const allowed = capabilities[capability];
                return (
                  <li key={capability} className="flex items-center gap-2 text-sm">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={allowed}
                      data-testid={`participant-profile-toggle-${capability}`}
                      onClick={() => onToggleCapability(capability, !allowed)}
                      className={cn(
                        'relative h-5 w-9 flex-shrink-0 rounded-full transition-colors',
                        allowed ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                          allowed ? 'translate-x-4' : 'translate-x-0.5'
                        )}
                      />
                    </button>
                    <span className="text-gray-600 dark:text-gray-300">
                      {t(`participantProfile.allowed.${capability}`, CAPABILITY_ALLOWED_FALLBACK[capability])}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : deniedCapabilities.length === 0 ? (
            <div
              data-testid="participant-profile-no-restriction"
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
            >
              <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" aria-hidden="true" />
              {t('participantProfile.noRestriction', 'Aucune restriction')}
            </div>
          ) : (
            <ul className="space-y-1">
              {deniedCapabilities.map((capability) => (
                <li
                  key={capability}
                  data-testid={`participant-profile-denied-${capability}`}
                  className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
                >
                  <Ban className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" aria-hidden="true" />
                  {t(`participantProfile.denied.${capability}`, CAPABILITY_DENIED_FALLBACK[capability])}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/*
        L'octroi d'historique par DATE — vaut pour TOUT participant, pas
        seulement les visiteurs sans compte, d'où une section séparée de
        `entryCapabilities` ci-dessus (réservée aux anonymes). Muette pour un
        membre ordinaire : `historyVisibleFrom` et `onSetHistoryGrant` sont
        alors tous deux absents, et il n'existe volontairement aucun signal
        « un octroi existe » à qui n'a pas le droit de le savoir.
      */}
      {(onSetHistoryGrant || profile.historyVisibleFrom) && (
        <div className="space-y-1.5" data-testid="participant-profile-history-grant">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t('participantProfile.historyGrant.title', 'Historique')}
          </div>
          {onSetHistoryGrant ? (
            <div className="flex items-center gap-2 text-sm">
              <History className="h-3.5 w-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
              <span className="text-gray-500 dark:text-gray-400">
                {t('participantProfile.historyGrant.label', 'Voit l’historique depuis')}
              </span>
              <input
                type="date"
                data-testid="participant-profile-history-grant-input"
                className="ml-auto rounded border border-gray-200 bg-transparent px-1.5 py-0.5 text-sm text-gray-800 disabled:opacity-50 dark:border-gray-700 dark:text-gray-100"
                max={todayDateInputValue()}
                value={profile.historyVisibleFrom ? toDateInputValue(profile.historyVisibleFrom) : ''}
                disabled={historyGrantPending}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) return;
                  onSetHistoryGrant(new Date(`${value}T00:00:00.000Z`).toISOString());
                }}
              />
              {profile.historyVisibleFrom && (
                <button
                  type="button"
                  data-testid="participant-profile-history-grant-clear"
                  aria-label={t('participantProfile.historyGrant.clear', 'Retirer')}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600 disabled:opacity-50 dark:hover:text-gray-200"
                  disabled={historyGrantPending}
                  onClick={() => onSetHistoryGrant(null)}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          ) : (
            profile.historyVisibleFrom && (
              <ProfileRow
                testId="participant-profile-history-grant-readonly"
                icon={<History className="h-3.5 w-3.5" />}
                label={t('participantProfile.historyGrant.label', 'Voit l’historique depuis')}
                value={new Date(profile.historyVisibleFrom).toLocaleDateString()}
              />
            )
          )}
          {historyGrantError && (
            <div
              data-testid="participant-profile-history-grant-error"
              className="text-xs text-red-500 dark:text-red-400"
            >
              {historyGrantError}
            </div>
          )}
        </div>
      )}

      {profile.entryLink && (
        <div
          className="space-y-1.5 rounded-lg border border-dashed border-gray-200 p-3 dark:border-gray-700"
          data-testid="participant-profile-entry-link"
        >
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t('participantProfile.entryLink', 'Réglages du lien')}
          </div>

          {!profile.entryLink.isActive && (
            <div
              data-testid="participant-profile-entry-link-inactive"
              className="text-sm text-amber-600 dark:text-amber-400"
            >
              {t('participantProfile.linkInactive', 'Ce lien a été désactivé')}
            </div>
          )}

          <ProfileRow
            testId="participant-profile-entry-link-uses"
            icon={<Link2 className="h-3.5 w-3.5" />}
            label={t('participantProfile.linkUses', 'Entrées')}
            value={
              profile.entryLink.maxUses === null
                ? String(profile.entryLink.currentUses)
                : `${profile.entryLink.currentUses} / ${profile.entryLink.maxUses}`
            }
          />

          {entryLinkExpiry && (
            <ProfileRow
              testId="participant-profile-entry-link-expiry"
              icon={<CalendarClock className="h-3.5 w-3.5" />}
              label={t('participantProfile.linkExpires', 'Expire le')}
              value={entryLinkExpiry}
            />
          )}

          {entryLinkRequirements.length > 0 && (
            <ProfileRow
              testId="participant-profile-entry-link-requirements"
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              label={t('participantProfile.linkRequires', 'Exige')}
              value={entryLinkRequirements.join(' · ')}
            />
          )}

          {profile.entryLink.allowedCountries.length > 0 && (
            <ProfileRow
              testId="participant-profile-entry-link-countries"
              icon={<MapPin className="h-3.5 w-3.5" />}
              label={t('participantProfile.linkCountries', 'Pays admis')}
              value={profile.entryLink.allowedCountries.join(', ')}
            />
          )}

          {profile.entryLink.allowedLanguages.length > 0 && (
            <ProfileRow
              testId="participant-profile-entry-link-languages"
              icon={<Globe className="h-3.5 w-3.5" />}
              label={t('participantProfile.linkLanguages', 'Langues admises')}
              value={profile.entryLink.allowedLanguages.join(', ').toUpperCase()}
            />
          )}
        </div>
      )}
    </div>
  );
});
