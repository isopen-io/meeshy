import { peakOf } from '@/components/admin/charts/chart-scale';
import type { AdminHourBucket, AdminLanguageShare, AdminMessageTypeShare } from '@/lib/api/admin-overview';
import type { AdminRankedConversation, AdminRankedMember } from '@/lib/api/admin-overview-queue';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import type { AdminTarget } from './admin-routes';
import { interpretActivityBucket, interpretConversationType, interpretMessageType } from './interpret/enums';
import { languageName, sentenceCase } from './interpret/language';
import { conversationLabel, personLabel } from './interpret/labels';
import { formatCount, formatPercent } from './interpret/numbers';
import { dayLabelsEndingToday, hourLabel } from './interpret/time';

/**
 * **LES SÉRIES DU TABLEAU DE BORD, MISES EN MOTS** (#8876, § 4) — des fonctions
 * PURES : ce que les décodeurs ont lu, la langue d'interface et l'horloge
 * entrent ; les données du graphique et SA phrase de synthèse sortent.
 *
 * Trois règles, que chaque témoin mesure :
 * - **aucun libellé servi n'est peint** : les jours viennent de la POSITION
 *   (`dayLabelsEndingToday`), les tranches d'activité de l'INDICE
 *   (`interpretActivityBucket`), les langues et les types de leur CODE — les
 *   libellés français et les couleurs du serveur sont ignorés dès le décodeur ;
 * - **la synthèse dit le fait, pas la forme** : le pic, la tête du classement,
 *   la part — une phrase qu'un lecteur d'écran lit à la place du dessin ;
 * - **une série vide n'a pas de phrase** : le cadre du graphique dit « Aucune
 *   donnée » lui-même, et une synthèse inventée pour du vide serait un mensonge.
 */

export type TimelinePoint = { readonly x: string; readonly value: number };
export type BarDatum = { readonly key: string; readonly label: string; readonly value: number; readonly target?: AdminTarget };
export type ShareDatum = { readonly key: string; readonly label: string; readonly value: number };

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

/** Les messages des 7 derniers jours : le dernier point est aujourd'hui. */
export function volumeView(
  days: readonly number[],
  now: Date,
  language: AdminLanguage,
): { readonly points: readonly TimelinePoint[]; readonly summary: string } {
  const labels = dayLabelsEndingToday(days.length, now, language);
  const points = days.map((value, index) => ({ x: labels[index] ?? '', value }));
  const peak = peakOf(points);
  const summary =
    peak === null || sum(days) === 0
      ? translateAdmin(language, 'admin.dash.volume.none')
      : translateAdmin(language, 'admin.dash.volume.summary', {
          day: points[peak.index]?.x ?? '',
          count: formatCount(peak.value, language),
        });
  return { points, summary };
}

/** Les tranches de trois heures, dans l'ordre chronologique du serveur ; chacune porte l'heure où elle COMMENCE. */
export function hourlyView(
  buckets: readonly AdminHourBucket[],
  language: AdminLanguage,
): { readonly data: readonly BarDatum[]; readonly summary: string } {
  const data = buckets.map((bucket) => ({
    key: `hour-${bucket.startHour}`,
    label: hourLabel(bucket.startHour, language),
    value: bucket.messages,
  }));
  const peak = peakOf(data);
  const busiest = peak === null ? undefined : buckets[peak.index];
  if (busiest === undefined || sum(buckets.map((bucket) => bucket.messages)) === 0) return { data, summary: '' };

  return {
    data,
    summary: translateAdmin(language, 'admin.dash.hourly.summary', {
      from: hourLabel(busiest.startHour, language),
      to: hourLabel((busiest.startHour + 3) % 24, language),
      count: formatCount(busiest.messages, language),
    }),
  };
}

/** Les quatre tranches d'engagement, par INDICE (très actifs → inactifs) ; la phrase donne la part des comptes actifs sur 7 jours. */
export function engagementView(
  buckets: readonly number[],
  language: AdminLanguage,
): { readonly data: readonly ShareDatum[]; readonly summary: string } {
  const data = buckets.map((value, index) => ({
    key: `bucket-${index}`,
    label: interpretActivityBucket(index, language).label,
    value,
  }));
  const total = sum(buckets);
  if (total === 0) return { data, summary: '' };

  const active = (buckets[0] ?? 0) + (buckets[1] ?? 0);
  return {
    data,
    summary: translateAdmin(language, 'admin.dash.engagement.summary', { share: formatPercent(active / total, 'ratio', language) }),
  };
}

/** Les langues des messages, nommées dans la langue d'interface — jamais « FR » ni « Unknown ». */
export function languagesView(
  shares: readonly AdminLanguageShare[],
  language: AdminLanguage,
): { readonly data: readonly BarDatum[]; readonly summary: string } {
  const data = shares.map((share) => ({
    key: share.code,
    label: sentenceCase(languageName(share.code, language), language),
    value: share.count,
  }));
  const peak = peakOf(data);
  const top = peak === null ? undefined : data[peak.index];
  if (top === undefined || sum(data.map((datum) => datum.value)) === 0) return { data, summary: '' };

  return {
    data,
    summary: translateAdmin(language, 'admin.dash.languages.summary', { language: top.label, count: formatCount(top.value, language) }),
  };
}

/** Les types de messages, du plus envoyé au moins envoyé : le graphique n'en nomme que quatre, le reste se replie dans « Autres ». */
export function typesView(
  shares: readonly AdminMessageTypeShare[],
  language: AdminLanguage,
): { readonly data: readonly ShareDatum[]; readonly summary: string } {
  const ordered = [...shares].sort((a, b) => b.count - a.count);
  const data = ordered.map((share) => ({ key: share.type, label: interpretMessageType(share.type, language).label, value: share.count }));
  const total = sum(data.map((datum) => datum.value));
  const top = data[0];
  if (top === undefined || total === 0) return { data, summary: '' };

  return {
    data,
    summary: translateAdmin(language, 'admin.dash.types.summary', {
      type: top.label,
      share: formatPercent(top.value / total, 'ratio', language),
    }),
  };
}

/**
 * Le classement des conversations. Une conversation SANS titre se dit par ses
 * membres (« Awa et Jean ») quand la passerelle les sert — au rang d'administration
 * seulement —, sinon par son type (« Conversation privée »).
 */
function conversationDatumLabel(row: AdminRankedConversation, language: AdminLanguage): string {
  if (row.title !== null || row.members !== null) {
    return conversationLabel({ title: row.title, participants: row.members?.participants, total: row.members?.total }, language);
  }
  return row.type === null ? conversationLabel({}, language) : interpretConversationType(row.type, language).label;
}

export function rankedConversationsView(
  rows: readonly AdminRankedConversation[],
  language: AdminLanguage,
): { readonly data: readonly BarDatum[]; readonly summary: string } {
  const data = rows.map((row): BarDatum => ({
    key: row.id,
    label: conversationDatumLabel(row, language),
    value: row.count,
    target: { kind: 'entity', entity: 'conversation', id: row.id },
  }));
  return { data, summary: leaderSummary(data, 'admin.dash.rank.conversations.summary', language) };
}

export function rankedMembersView(
  rows: readonly AdminRankedMember[],
  language: AdminLanguage,
): { readonly data: readonly BarDatum[]; readonly summary: string } {
  const data = rows.map((row): BarDatum => ({
    key: row.id,
    label: personLabel(row, language),
    value: row.count,
    target: { kind: 'entity', entity: 'user', id: row.id },
  }));
  return { data, summary: leaderSummary(data, 'admin.dash.rank.members.summary', language) };
}

function leaderSummary(
  data: readonly BarDatum[],
  key: 'admin.dash.rank.conversations.summary' | 'admin.dash.rank.members.summary',
  language: AdminLanguage,
): string {
  const peak = peakOf(data);
  const leader = peak === null ? undefined : data[peak.index];
  return leader === undefined ? '' : translateAdmin(language, key, { name: leader.label, count: formatCount(leader.value, language) });
}
