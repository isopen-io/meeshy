import type { AdminEntityRef } from '@/components/admin/entity-chip';
import type { AdminTrackingBucket, AdminTrackingDay, AdminTrackingLinkRow } from '@/lib/api/admin-tracking-links';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { interpretRedirectStatus, interpretTrackingTarget, trackingLinkStateOf } from './interpret/enums';
import { countryName, sentenceCase } from './interpret/language';
import { conversationLabel, personLabel, postLabel } from './interpret/labels';
import { adminDayLabel } from './interpret/time';
import type { AdminTone, Interpreted } from './interpret/types';

/**
 * **CE QU'UN LIEN DE SUIVI DIT, EN MOTS** (#8876, #6729) — des fonctions pures, sans
 * écran : sa cible nommée, ses agrégats nommés (pays, appareils, redirections), sa
 * courbe aux jours réels.
 *
 * Ce que la passerelle sert comme code est toujours traduit : un pays n'est jamais
 * « FR », un statut de redirection jamais « pending », un appareil jamais « mobile »
 * brut — et deux codes que personne ne sait nommer ne produisent pas deux fois le
 * même mot.
 */
export const trackingLinkState = (link: AdminTrackingLinkRow, now: Date, language: AdminLanguage): Interpreted =>
  trackingLinkStateOf({ isActive: link.isActive, expiresAt: link.expiresAt }, now, language);

const POST_TYPES: ReadonlySet<string> = new Set(['POST', 'REEL', 'STORY', 'STATUS']);

/**
 * La cible du lien, en PUCE : une publication (« Reel de Awa Diop »), une
 * conversation, un profil. `null` pour un site externe (aucune entité). Une cible
 * dont le nom n'a pas pu être résolu (publication ou profil disparus) est barrée et
 * dit « supprimé » — la puce n'a alors plus de fiche où mener. Une conversation
 * sans titre reste cliquable : le nom absent peut être un simple groupe sans titre.
 */
export function trackingTargetRef(link: AdminTrackingLinkRow, language: AdminLanguage): AdminEntityRef | null {
  const target = link.target;
  if (target === null || link.targetType === 'EXTERNAL') return null;
  const kind = interpretTrackingTarget(target.type, language).label;

  if (POST_TYPES.has(target.type)) {
    return target.label === null
      ? { kind: 'post', id: target.id, label: kind, deleted: true }
      : { kind: 'post', id: target.id, label: postLabel({ type: target.type, author: { displayName: target.label } }, language) };
  }
  if (target.type === 'CONVERSATION') {
    return { kind: 'conversation', id: target.id, label: conversationLabel({ title: target.label }, language) };
  }
  if (target.type === 'PROFILE') {
    return target.label === null
      ? { kind: 'user', id: target.id, label: personLabel(null, language), deleted: true }
      : { kind: 'user', id: target.id, label: personLabel({ displayName: target.label }, language) };
  }
  return null;
}

/** La conversation d'où le lien a été posé, quand il y en a une. */
export function trackingConversationRef(link: AdminTrackingLinkRow, language: AdminLanguage): AdminEntityRef | null {
  if (link.conversation === null) return null;
  return { kind: 'conversation', id: link.conversation.id, label: conversationLabel({ title: link.conversation.title }, language) };
}

const DAY_MS = 86_400_000;
const MAX_DAYS = 90;

const utcDay = (day: string): number => Date.parse(`${day}T00:00:00.000Z`);

export type TrackingDaySeries = {
  readonly points: readonly { readonly x: string; readonly value: number }[];
  readonly total: number;
  readonly peak: { readonly day: string; readonly count: number } | null;
};

/**
 * La courbe des clics par jour UTC. La passerelle ne sert que les jours AVEC des
 * clics : tracer tels quels ces points relierait un lundi à un jeudi par une droite,
 * comme si rien ne s'était passé entre les deux. Les jours sans clic, entre le
 * premier et le dernier, valent donc ZÉRO ; au-delà de 90 jours, on garde les plus
 * récents.
 */
export function trackingDaySeries(days: readonly AdminTrackingDay[], language: AdminLanguage): TrackingDaySeries {
  const counted = new Map(days.map((day) => [day.date, day.count]));
  const ordered = [...counted.keys()].sort();
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (first === undefined || last === undefined) return { points: [], total: 0, peak: null };

  const length = Math.round((utcDay(last) - utcDay(first)) / DAY_MS) + 1;
  const filled = Array.from({ length }, (_, index) => {
    const date = new Date(utcDay(first) + index * DAY_MS).toISOString().slice(0, 10);
    return { date, count: counted.get(date) ?? 0 };
  }).slice(-MAX_DAYS);

  const top = filled.reduce<(typeof filled)[number] | null>((best, day) => (best === null || day.count > best.count ? day : best), null);
  return {
    points: filled.map((day) => ({ x: adminDayLabel(day.date, language), value: day.count })),
    total: filled.reduce((sum, day) => sum + day.count, 0),
    peak: top === null || top.count === 0 ? null : { day: adminDayLabel(top.date, language), count: top.count },
  };
}

export type TrackingDatum = { readonly key: string; readonly label: string; readonly value: number };

/** Fusionne les seaux qui portent le MÊME libellé (deux codes inconnus → un seul « Pays inconnu »), du plus grand au plus petit. */
export function mergeByLabel(items: readonly TrackingDatum[]): readonly TrackingDatum[] {
  const merged = items.reduce<ReadonlyMap<string, TrackingDatum>>((acc, item) => {
    const existing = acc.get(item.label);
    return new Map([...acc, [item.label, existing === undefined ? item : { ...existing, value: existing.value + item.value }]]);
  }, new Map());
  return [...merged.values()].sort((left, right) => right.value - left.value);
}

/** Mobile, tablette, ordinateur — nommés ; tout autre appareil servi est un nom de modèle, posé tel quel avec une majuscule ; absent → « Non renseigné ». */
export function trackingDeviceLabel(code: string | null | undefined, language: AdminLanguage): string {
  const raw = code?.trim() ?? '';
  if (raw === '') return translateAdmin(language, 'admin.value.notProvided');
  switch (raw.toLowerCase()) {
    case 'mobile':
      return translateAdmin(language, 'admin.tracking.device.mobile');
    case 'tablet':
      return translateAdmin(language, 'admin.tracking.device.tablet');
    case 'desktop':
      return translateAdmin(language, 'admin.tracking.device.desktop');
    default:
      return sentenceCase(raw, language);
  }
}

/** Un nom servi en clair (navigateur, système, source sociale) : posé tel quel, « Non renseigné » quand il manque. */
export function trackingPlainLabel(value: string | null | undefined, language: AdminLanguage): string {
  const raw = value?.trim() ?? '';
  return raw === '' ? translateAdmin(language, 'admin.value.notProvided') : raw;
}

const datum = (bucket: AdminTrackingBucket, label: string): TrackingDatum => ({ key: bucket.key, label, value: bucket.count });

export const trackingCountryData = (buckets: readonly AdminTrackingBucket[], language: AdminLanguage): readonly TrackingDatum[] =>
  mergeByLabel(buckets.map((bucket) => datum(bucket, countryName(bucket.key, language))));

export const trackingDeviceData = (buckets: readonly AdminTrackingBucket[], language: AdminLanguage): readonly TrackingDatum[] =>
  mergeByLabel(buckets.map((bucket) => datum(bucket, trackingDeviceLabel(bucket.key, language))));

export const trackingPlainData = (buckets: readonly AdminTrackingBucket[], language: AdminLanguage): readonly TrackingDatum[] =>
  mergeByLabel(buckets.map((bucket) => datum(bucket, sentenceCase(trackingPlainLabel(bucket.key, language), language))));

/** Les redirections, nommées, avec le ton de leur état (réussie, en attente, échouée) — réservé aux distributions d'état. */
export function trackingRedirectData(
  buckets: readonly AdminTrackingBucket[],
  language: AdminLanguage,
): { readonly data: readonly TrackingDatum[]; readonly tones: Readonly<Record<string, AdminTone>> } {
  const interpreted = buckets.map((bucket) => ({ bucket, meaning: interpretRedirectStatus(bucket.key, language) }));
  return {
    data: mergeByLabel(interpreted.map(({ bucket, meaning }) => datum(bucket, meaning.label))),
    tones: Object.fromEntries(interpreted.map(({ bucket, meaning }) => [bucket.key, meaning.tone])),
  };
}

/** Le premier de la liste (déjà triée du plus grand au plus petit), pour la phrase de synthèse d'un graphique. */
export const topDatum = (data: readonly TrackingDatum[]): TrackingDatum | null => data[0] ?? null;

export type TrackingGesture = 'deactivate' | 'reactivate';

/**
 * Le geste offert — et seulement s'il a un effet ET que le lecteur peut l'exercer :
 * un lien actif se désactive, un lien désactivé se réactive ; la route exige le rang
 * d'administration en plus de la lecture (un auditeur voit les campagnes, il n'en
 * ferme pas), donc sans ce rang AUCUN geste n'est dessiné.
 */
export function trackingLinkGesture(link: { readonly isActive: boolean }, reach: { readonly hasAdminRank: boolean }): TrackingGesture | null {
  if (!reach.hasAdminRank) return null;
  return link.isActive ? 'deactivate' : 'reactivate';
}
