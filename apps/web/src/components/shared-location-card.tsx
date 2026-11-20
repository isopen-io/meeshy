import { useId, useState, type ReactNode } from 'react';

import { Glyph } from '@/components/glyph';
import { MeeshyMeter } from '@/components/kit/meeshy-meter';
import { translate } from '@/lib/i18n-catalog';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { SharedLocation } from '@/lib/api/shared-locations';
import type { SharedLocationSharingCenter } from '@/lib/shared-locations/shared-location-sharing';
import { directionsHref, positionCardOf, remainingWords } from '@/lib/shared-locations/position-card';
import { useMinute } from '@/lib/view/use-minute';
import { ProfileShareLocationRow } from '@/routes/user-profile-share-location';

/**
 * **LA FEUILLE BASSE D'UNE PERSONNE SUR LA CARTE** (#18881) — la précision que son cercle ouvre, le moment de
 * la dernière mise à jour, le temps qui reste en jauge, l'itinéraire et « Partager la mienne » (le geste de la
 * fiche, réemployé tel quel, offert seulement si le cercle servi l'ouvre). Tout vient de la charge servie : le
 * lieu et la distance ne le sont pas, la feuille ne les invente pas. Quand la personne ne partage plus, elle le
 * dit au lieu de rester vide.
 *
 * NON MODALE (revue #18881) : la feuille se pose sous la carte, qui reste manipulable — glisser, zoomer, toucher
 * une autre épingle — comme la feuille à crans d'iOS. Une modale rendait la carte inerte derrière son voile.
 * Le temps restant se relit à la minute.
 */
const AT = (language: InterfaceLanguage, iso: string): string => new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

const ActionLink = ({ href, label, ...rest }: { readonly href: string; readonly label: string } & Readonly<Record<`data-${string}`, string>>) => (
  <a
    {...rest}
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="grid min-h-[48px] place-items-center rounded-card px-4 text-body font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
    style={{ backgroundColor: 'var(--color-brand)', /* harmony-exempt: repli d'un jeton de charte défini (--color-on-brand), jamais rendu — filet de contraste de l'encre sur l'aplat de marque */ color: 'var(--color-on-brand, #fff)' }}
  >
    {label}
  </a>
);

function Panel({
  language,
  name,
  data,
  onClose,
  children,
}: {
  readonly language: InterfaceLanguage;
  readonly name: string;
  readonly data: Readonly<Record<`data-${string}`, string>>;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section
      {...data}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onClose();
      }}
      className="grid gap-2 rounded-t-card pb-2"
      style={{ backgroundColor: 'var(--color-ios-surface)', color: 'var(--color-ios-ink)', borderTop: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-3 px-4 pt-2">
        <h2 id={titleId} className="flex-1 text-title font-bold" style={{ color: 'var(--color-ios-ink)' }}>
          {name}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="grid place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ minHeight: 44, minWidth: 44, color: 'var(--color-ios-ink-2)' }}
          aria-label={translate(language, 'common.close')}
        >
          <Glyph name="x" size={20} />
        </button>
      </div>
      {children}
    </section>
  );
}

export function SharedLocationCard({
  language,
  userId,
  name,
  location,
  shareOffered,
  sharing,
  now = Date.now,
  onClose,
}: {
  readonly language: InterfaceLanguage;
  readonly userId: string;
  readonly name: string;
  /** `undefined` : la personne ne partage plus (arrêt, terme, baisse sous Ami). */
  readonly location: SharedLocation | undefined;
  /** Le verdict servi de la paire ouvre le partage de MA position vers elle. */
  readonly shareOffered: boolean;
  /** Mon partage (par défaut celui du compte ouvert) ; `null` : aucun. */
  readonly sharing?: SharedLocationSharingCenter | null;
  readonly now?: () => number;
  readonly onClose: () => void;
}) {
  useMinute();
  const [notice, setNotice] = useState('');
  const card = location === undefined ? null : positionCardOf({ location, now: now() });
  if (location === undefined || card === null) {
    return (
      <Panel language={language} name={name} data={{ 'data-shared-location-ended': userId }} onClose={onClose}>
        <p role="status" className="px-4 pb-4 text-body" style={{ color: 'var(--color-ink)' }}>
          {translateCircles(language, 'positions.card.ended', { name })}
        </p>
      </Panel>
    );
  }
  const sharedFor = translateCircles(language, 'positions.card.sharedFor', { duration: remainingWords(language, card.totalMinutes) });
  const remaining = translateCircles(language, 'positions.card.remaining', { time: remainingWords(language, card.remainingMinutes) });
  return (
    <Panel language={language} name={name} data={{ 'data-shared-location-card': userId }} onClose={onClose}>
      <div className="grid gap-4 px-4 pb-4">
        <div className="grid gap-1">
          <p className="text-body font-semibold" style={{ color: 'var(--color-ink)' }}>
            {translateCircles(language, `positions.card.${card.precision}`)}
          </p>
          <p className="text-caption" style={{ color: 'var(--color-ink-muted)' }}>
            {translateCircles(language, 'positions.card.updated', { time: AT(language, location.updatedAt) })}
          </p>
        </div>
        <MeeshyMeter value={card.remainingMinutes} total={card.totalMinutes} label={sharedFor} spokenValue={remaining} title={sharedFor} valueText={remaining} size={8} kind="accent" />
        <ActionLink href={directionsHref(location)} label={translateCircles(language, 'positions.card.directions')} data-shared-location-directions="" />
        <ProfileShareLocationRow
          language={language}
          person={{ id: userId, username: name, displayName: name, avatar: null }}
          offered={shareOffered}
          onNotice={setNotice}
          {...(sharing === undefined ? {} : { center: sharing })}
        />
        <p role="status" className="text-caption empty:hidden" style={{ color: 'var(--color-ink-muted)' }}>
          {notice}
        </p>
      </div>
    </Panel>
  );
}
