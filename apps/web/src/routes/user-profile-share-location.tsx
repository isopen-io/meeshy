import {
  SHARED_LOCATION_DEFAULT_PRECISION,
  SHARED_LOCATION_DURATIONS_MINUTES,
  type SharedLocationDurationMinutes,
  type SharedLocationPrecision,
} from '@meeshy/shared/types/shared-location-constants';
import { memo, useState } from 'react';
import { useStore } from 'zustand/react';

import { Sheet } from '@/components/sheet';
import type { PersonSummary } from '@/lib/api/friend-requests';
import { translate } from '@/lib/i18n-catalog';
import { translateCircles, type CirclesCatalogKey } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { SharedLocationRosterEntry } from '@/lib/shared-locations/shared-location-roster';
import type { SharedLocationShareProblem, SharedLocationSharingCenter } from '@/lib/shared-locations/shared-location-sharing';
import { sharedLocationSharingCenter } from '@/lib/shared-locations/shared-location-sharing-live';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';

import { BRAND, FOCUS, INK, INK_2 } from './user-profile-style';

/**
 * **PARTAGER MA POSITION DEPUIS LA FICHE D'UN AMI** (#18345, iso
 * `ProfileShareLocationRow.swift`) : la durée (1 h, 8 h) et ce que la personne voit
 * (la ville par défaut, le quartier, l'endroit exact) se choisissent dans une feuille,
 * puis la ligne dit « X voit votre position (…) jusqu'à HH:MM » et « Arrêter » d'un
 * geste, tant que ça dure.
 *
 * - **Offerte dès Ami** : l'hôte le sait par la relation ; la passerelle rejuge la loi à
 *   chaque envoi. La ligne RESTE tant qu'un partage court, même si le cercle est descendu
 *   sous Ami : « Arrêter » ne disparaît jamais avant le partage.
 * - La position ne se suit que tant que Meeshy est ouvert ; un onglet fermé laisse le
 *   terme serveur couper le partage.
 */

const PRECISIONS_SHOWN: readonly SharedLocationPrecision[] = ['city', 'neighborhood', 'exact'];
const SURFACE = `color-mix(in srgb, ${BRAND} 8%, transparent)`;
const DANGER = 'var(--color-error)';

const PRECISION_KEY = {
  exact: 'shareLocation.precision.exact',
  neighborhood: 'shareLocation.precision.neighborhood',
  city: 'shareLocation.precision.city',
} as const satisfies Readonly<Record<SharedLocationPrecision, CirclesCatalogKey>>;

const DURATION_KEY = { 60: 'shareLocation.oneHour', 480: 'shareLocation.eightHours' } as const satisfies Readonly<Record<SharedLocationDurationMinutes, CirclesCatalogKey>>;

export const SHARE_LOCATION_PROBLEM_KEY = {
  'location-denied': 'shareLocation.denied',
  'location-unavailable': 'shareLocation.unavailable',
  offline: 'shareLocation.offline',
  unconfirmed: 'shareLocation.offline',
  'rate-limited': 'shareLocation.rateLimited',
  invalid: 'shareLocation.failed',
  'not-sharing': 'shareLocation.failed',
  unavailable: 'shareLocation.failed',
  failed: 'shareLocation.failed',
} as const satisfies Readonly<Record<SharedLocationShareProblem, CirclesCatalogKey>>;

const timeOf = (language: InterfaceLanguage, at: number): string => new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(at);

export const ProfileShareLocationRowView = memo(function ProfileShareLocationRowView({
  language,
  name,
  entry,
  busy,
  onShare,
  onStop,
}: {
  readonly language: InterfaceLanguage;
  readonly name: string;
  readonly entry: SharedLocationRosterEntry | null;
  readonly busy: boolean;
  readonly onShare: () => void;
  readonly onStop: () => void;
}) {
  if (entry === null) {
    return (
      <button
        type="button"
        data-share-location=""
        disabled={busy}
        aria-busy={busy}
        aria-label={translateCircles(language, 'shareLocation.action.a11y', { name })}
        onClick={onShare}
        className={`flex w-full items-center justify-center gap-2 rounded-card px-3.5 text-body font-semibold ${FOCUS}`}
        style={{ minHeight: 48, color: BRAND, backgroundColor: SURFACE, outlineColor: BRAND, opacity: busy ? 0.6 : 1 }}
      >
        <span aria-hidden="true">📍</span>
        {translateCircles(language, 'shareLocation.action')}
      </button>
    );
  }
  const precision = translateCircles(language, PRECISION_KEY[entry.precision]).toLocaleLowerCase(language);
  return (
    <div data-share-location-active="" className="flex items-center gap-3 rounded-card px-3.5 py-3" style={{ backgroundColor: SURFACE }}>
      <span role="status" className="min-w-0 flex-1 text-body font-semibold" style={{ color: INK }}>
        <span aria-hidden="true">📍 </span>
        {translateCircles(language, 'shareLocation.active', { name, precision, time: timeOf(language, entry.until) })}
      </span>
      <button
        type="button"
        data-share-location-stop=""
        disabled={busy}
        aria-busy={busy}
        aria-label={translateCircles(language, 'shareLocation.stop.a11y', { name })}
        onClick={onStop}
        className={`grid shrink-0 place-items-center rounded-chip px-3 text-caption font-semibold ${FOCUS}`}
        style={{ minHeight: 44, color: DANGER, border: `1.5px solid color-mix(in srgb, ${DANGER} 45%, transparent)`, outlineColor: DANGER }}
      >
        {translateCircles(language, 'shareLocation.stop')}
      </button>
    </div>
  );
});

function Choice<T extends string | number>({
  name,
  value,
  selected,
  label,
  onSelect,
}: {
  readonly name: string;
  readonly value: T;
  readonly selected: boolean;
  readonly label: string;
  readonly onSelect: (value: T) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-card px-3" style={{ minHeight: 44, color: INK }}>
      <input type="radio" name={name} value={String(value)} checked={selected} onChange={() => onSelect(value)} style={{ accentColor: BRAND }} />
      <span className="text-body">{label}</span>
    </label>
  );
}

/** La feuille du choix : durée et précision, la ville par défaut (on ouvre plus, jamais l'inverse). */
export function ShareLocationChoiceSheet({
  language,
  name,
  onShare,
  onClose,
}: {
  readonly language: InterfaceLanguage;
  readonly name: string;
  readonly onShare: (choice: { readonly precision: SharedLocationPrecision; readonly durationMinutes: SharedLocationDurationMinutes }) => void;
  readonly onClose: () => void;
}) {
  const [precision, setPrecision] = useState<SharedLocationPrecision>(SHARED_LOCATION_DEFAULT_PRECISION);
  const [durationMinutes, setDuration] = useState<SharedLocationDurationMinutes>(SHARED_LOCATION_DURATIONS_MINUTES[0]);
  return (
    <Sheet title={translateCircles(language, 'shareLocation.sheetTitle', { name })} presentation="bottom" bodyAs="div" closeLabel={translate(language, 'common.cancel')} onClose={onClose} dialogData={{ 'data-share-location-sheet': '' }}>
      <div className="grid gap-4 px-4 pb-4">
        <fieldset className="grid gap-1">
          <legend className="pb-1 text-caption font-semibold" style={{ color: INK_2 }}>
            {translateCircles(language, 'shareLocation.duration')}
          </legend>
          {SHARED_LOCATION_DURATIONS_MINUTES.map((minutes) => (
            <Choice key={minutes} name="share-location-duration" value={minutes} selected={durationMinutes === minutes} label={translateCircles(language, DURATION_KEY[minutes])} onSelect={setDuration} />
          ))}
        </fieldset>
        <fieldset className="grid gap-1">
          <legend className="pb-1 text-caption font-semibold" style={{ color: INK_2 }}>
            {translateCircles(language, 'shareLocation.precisionTitle')}
          </legend>
          {PRECISIONS_SHOWN.map((option) => (
            <Choice key={option} name="share-location-precision" value={option} selected={precision === option} label={translateCircles(language, PRECISION_KEY[option])} onSelect={setPrecision} />
          ))}
        </fieldset>
        <p className="text-caption" style={{ color: INK_2 }}>
          {translateCircles(language, 'shareLocation.explain', { name })} {translateCircles(language, 'shareLocation.refresh')}
        </p>
        <button
          type="button"
          data-share-location-confirm=""
          onClick={() => onShare({ precision, durationMinutes })}
          className={`grid place-items-center rounded-chip px-4 text-body font-bold ${FOCUS}`}
          style={{ minHeight: 48, color: 'var(--color-on-state)', backgroundColor: 'var(--ios-indigo-600)', outlineColor: BRAND }}
        >
          {translateCircles(language, 'shareLocation.confirm')}
        </button>
      </div>
    </Sheet>
  );
}

type RowProps = {
  readonly language: InterfaceLanguage;
  readonly person: PersonSummary;
  /** Dès Ami : l'hôte le lit dans la relation. */
  readonly offered: boolean;
  readonly onNotice: (message: string) => void;
};

/** `center` absent : aucun compte connecté, aucune ligne. */
export function ProfileShareLocationRow({ center = sharedLocationSharingCenter(), ...props }: RowProps & { readonly center?: SharedLocationSharingCenter | null }) {
  return center === null ? null : <LiveShareLocationRow {...props} center={center} />;
}

function LiveShareLocationRow({ language, person, offered, onNotice, center }: RowProps & { readonly center: SharedLocationSharingCenter }) {
  const ready = useCirclesCatalog(language);
  const [choosing, setChoosing] = useState(false);
  useStore(center.store, (state) => state.roster);
  const busy = useStore(center.store, (state) => state.busy);
  if (!ready || !center.showsRow(person.id, offered)) return null;
  const name = person.displayName ?? person.username;
  const tell = (problem: SharedLocationShareProblem | null): void => {
    if (problem !== null) onNotice(translateCircles(language, SHARE_LOCATION_PROBLEM_KEY[problem]));
  };
  return (
    <>
      <ProfileShareLocationRowView
        language={language}
        name={name}
        entry={center.entry(person.id)}
        busy={busy}
        onShare={() => setChoosing(true)}
        onStop={() => void center.stopSharing(person.id).then(tell)}
      />
      {choosing ? (
        <ShareLocationChoiceSheet
          language={language}
          name={name}
          onClose={() => setChoosing(false)}
          onShare={({ precision, durationMinutes }) => {
            setChoosing(false);
            void center.share({ userId: person.id, precision, durationMinutes }).then(tell);
          }}
        />
      ) : null}
    </>
  );
}
