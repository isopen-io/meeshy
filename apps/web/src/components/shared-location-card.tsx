import { useState } from 'react';

import { MeeshyMeter } from '@/components/kit/meeshy-meter';
import { Sheet } from '@/components/sheet';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { SharedLocation } from '@/lib/api/shared-locations';
import { directionsHref, positionCardOf, remainingWords } from '@/lib/shared-locations/position-card';
import { ProfileShareLocationRow } from '@/routes/user-profile-share-location';

/**
 * **LA FEUILLE BASSE D'UNE PERSONNE SUR LA CARTE** (#18881) — la précision que son cercle ouvre, le moment de
 * la dernière mise à jour, le temps qui reste en jauge, l'itinéraire et « Partager la mienne » (le geste de la
 * fiche, réemployé tel quel). Tout vient de la charge servie : le lieu et la distance ne le sont pas, la
 * feuille ne les invente pas. Quand la personne ne partage plus, elle le dit au lieu de rester vide.
 */
const AT = (language: InterfaceLanguage, iso: string): string => new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

const ActionLink = ({ href, label, ...rest }: { readonly href: string; readonly label: string } & Readonly<Record<`data-${string}`, string>>) => (
  <a
    {...rest}
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="grid min-h-[48px] place-items-center rounded-card px-4 text-body font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
    style={{ backgroundColor: 'var(--color-brand)', color: 'var(--color-on-brand, #fff)' }}
  >
    {label}
  </a>
);

export function SharedLocationCard({
  language,
  userId,
  name,
  location,
  now = Date.now,
  onClose,
}: {
  readonly language: InterfaceLanguage;
  readonly userId: string;
  readonly name: string;
  /** `undefined` : la personne ne partage plus (arrêt, terme, baisse sous Ami). */
  readonly location: SharedLocation | undefined;
  readonly now?: () => number;
  readonly onClose: () => void;
}) {
  const [notice, setNotice] = useState('');
  const card = location === undefined ? null : positionCardOf({ location, now: now() });
  if (location === undefined || card === null) {
    return (
      <Sheet title={name} presentation="bottom" bodyAs="div" onClose={onClose} dialogData={{ 'data-shared-location-ended': userId }}>
        <p role="status" className="px-4 pb-6 text-body" style={{ color: 'var(--color-ink)' }}>
          {translateCircles(language, 'positions.card.ended', { name })}
        </p>
      </Sheet>
    );
  }
  const sharedFor = translateCircles(language, 'positions.card.sharedFor', { duration: remainingWords(language, card.totalMinutes) });
  const remaining = translateCircles(language, 'positions.card.remaining', { time: remainingWords(language, card.remainingMinutes) });
  return (
    <Sheet title={name} presentation="bottom" bodyAs="div" onClose={onClose} dialogData={{ 'data-shared-location-card': userId }}>
      <div className="grid gap-4 px-4 pb-6">
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
        <ProfileShareLocationRow language={language} person={{ id: userId, username: name, displayName: name, avatar: null }} offered onNotice={setNotice} />
        {notice === '' ? null : (
          <p role="status" className="text-caption" style={{ color: 'var(--color-ink-muted)' }}>
            {notice}
          </p>
        )}
      </div>
    </Sheet>
  );
}
