import type { BatteryAnnouncementKind } from '@meeshy/shared/types/battery-constants';
import type { BatteryAnnouncement, BatteryReaderState } from '@meeshy/shared/types/battery';

import { translateBattery, type BatteryCatalogKey } from '@/lib/i18n-battery-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { batteryToneOf, type BatteryTone } from './battery-tone';

export { BATTERY_TONE_COLOR, batteryToneOf, type BatteryTone } from './battery-tone';

/**
 * **CE QUE LA BATTERIE DIT** (#14147) — lois pures : la teinte d'un état servi, la phrase d'une annonce de la
 * pastille, l'icône de l'avatar et le détail de la fiche. La PHASE est celle que le serveur a décidée
 * (`batteryEpisodeStep` ne tourne que côté passerelle) : ce module ne rejuge rien, il NOMME. Il lit le catalogue
 * de la batterie, que l'appelant a chargé (`useBatteryCatalog`).
 */

type AnnouncementPhrase = { readonly withLevel: BatteryCatalogKey; readonly bare: BatteryCatalogKey };

const PHRASES: Readonly<Record<BatteryAnnouncementKind, AnnouncementPhrase>> = {
  low: { withLevel: 'battery.announce.low', bare: 'battery.announce.lowBare' },
  threshold: { withLevel: 'battery.announce.threshold', bare: 'battery.announce.lowBare' },
  critical: { withLevel: 'battery.announce.critical', bare: 'battery.announce.criticalBare' },
  'critical-drop': { withLevel: 'battery.announce.criticalDrop', bare: 'battery.announce.criticalBare' },
  'probably-off': { withLevel: 'battery.announce.probablyOff', bare: 'battery.announce.probablyOff' },
  charging: { withLevel: 'battery.announce.charging', bare: 'battery.announce.charging' },
  'back-on': { withLevel: 'battery.announce.backOn', bare: 'battery.announce.backOn' },
  recharged: { withLevel: 'battery.announce.recharged', bare: 'battery.announce.recharged' },
  ended: { withLevel: 'battery.announce.ended', bare: 'battery.announce.ended' },
};

/**
 * La phrase d'une annonce. Le palier franchi (`threshold`) se dit par son PALIER, pas par le niveau mesuré :
 * « batterie à 20 % », annoncé une fois par épisode, même relevé à 19.
 */
export function batteryAnnouncementText(
  language: InterfaceLanguage,
  { name, announcement }: { readonly name: string | null; readonly announcement: BatteryAnnouncement },
): string {
  const who = name ?? translateBattery(language, 'battery.someone');
  const phrase = PHRASES[announcement.kind];
  const level = announcement.kind === 'threshold' ? (announcement.threshold ?? announcement.level) : announcement.level;
  const text = translateBattery(language, level === null ? phrase.bare : phrase.withLevel);
  return text.replace('{name}', who).replace('{level}', String(level ?? ''));
}

export type BatteryBadge = {
  readonly tone: BatteryTone;
  readonly level: number;
  readonly charging: boolean;
  /** Ce que le lecteur d'écran entend avec le nom de la personne. */
  readonly spoken: string;
};

export function batteryBadgeOf(state: BatteryReaderState, language: InterfaceLanguage): BatteryBadge {
  const tone = batteryToneOf(state);
  const level = String(state.level);
  const spoken =
    tone === 'off'
      ? translateBattery(language, 'battery.a11y.off')
      : state.charging
        ? translateBattery(language, 'battery.a11y.charging', { level })
        : translateBattery(language, 'battery.a11y.level', { level });
  return { tone, level: state.level, charging: state.charging, spoken };
}

const HEADLINE: Readonly<Record<BatteryReaderState['phase'], BatteryCatalogKey>> = {
  low: 'battery.phase.low',
  critical: 'battery.phase.critical',
  off: 'battery.phase.off',
  charging: 'battery.phase.charging',
};

/** « 45 min », « 1 h 35 min », « 2 h » — les unités de la langue, par `Intl`. */
export function batteryDurationText(language: InterfaceLanguage, minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const unit = (value: number, kind: 'hour' | 'minute') => new Intl.NumberFormat(language, { style: 'unit', unit: kind, unitDisplay: 'short' }).format(value);
  if (hours === 0) return unit(rest, 'minute');
  return rest === 0 ? unit(hours, 'hour') : `${unit(hours, 'hour')} ${unit(rest, 'minute')}`;
}

const MINUTE_MS = 60_000;

function measuredText(language: InterfaceLanguage, measuredAt: string, now: number): string {
  const minutes = Math.floor(Math.max(0, now - Date.parse(measuredAt)) / MINUTE_MS);
  if (minutes < 1) return translateBattery(language, 'battery.detail.measuredNow');
  const relative = new Intl.RelativeTimeFormat(language, { numeric: 'always' });
  const ago = minutes < 60 ? relative.format(-minutes, 'minute') : relative.format(-Math.floor(minutes / 60), 'hour');
  return translateBattery(language, 'battery.detail.measured', { ago });
}

export type BatteryDetail = {
  readonly tone: BatteryTone;
  readonly headline: string;
  readonly level: string;
  /** Ce qui suit, dans l'ordre : charge, mode économie, autonomie, âge du relevé, appareil. */
  readonly lines: readonly string[];
};

/**
 * Le détail d'un état servi. L'autonomie n'est dite que pendant une DÉCHARGE : en charge ou présumé éteint, une
 * durée restante serait fausse. Un téléphone présumé éteint dit son DERNIER niveau connu, pas un niveau présent.
 */
export function batteryDetailOf(state: BatteryReaderState, language: InterfaceLanguage, now: number): BatteryDetail {
  const tone = batteryToneOf(state);
  const level = String(state.level);
  const discharging = tone === 'low' || tone === 'critical';
  const lines = [
    ...(state.charging ? [translateBattery(language, 'battery.detail.charging')] : []),
    ...(state.lowPower && tone !== 'off' ? [translateBattery(language, 'battery.detail.lowPower')] : []),
    ...(discharging && state.estimatedMinutes !== undefined
      ? [translateBattery(language, 'battery.detail.estimate', { duration: batteryDurationText(language, state.estimatedMinutes) })]
      : []),
    measuredText(language, state.measuredAt, now),
    ...(state.deviceLabel === undefined ? [] : [translateBattery(language, 'battery.detail.device', { device: state.deviceLabel })]),
  ];
  return {
    tone,
    headline: translateBattery(language, HEADLINE[state.phase]),
    level: translateBattery(language, tone === 'off' ? 'battery.detail.lastLevel' : 'battery.detail.level', { level }),
    lines,
  };
}
