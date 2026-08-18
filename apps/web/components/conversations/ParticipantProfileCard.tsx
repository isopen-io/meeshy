'use client';

import { memo } from 'react';
import { Ghost, Mail, Cake, Globe, MapPin, Link2, CalendarClock } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import type { ParticipantProfile } from '@/hooks/queries/use-participant-profile';

interface ParticipantProfileCardProps {
  readonly profile: ParticipantProfile;
  readonly className?: string;
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
    </div>
  );
});
