import { useEffect, useState } from 'react';
import { useStore } from 'zustand/react';

import {
  ANNOUNCEMENT_DWELL_MS,
  ANNOUNCEMENT_MAX_WAIT_MS,
  currentPillAnnouncement,
  pillAnnouncementStore,
  type PillAnnouncement,
  type PillAnnouncementStoreApi,
  type PillAnnouncementTone,
} from '@/lib/view/sync-pill-announcements';

import { BatteryGlyph } from './battery-glyph';
import { FallGlyph } from './fall-glyph';
import { InactivityGlyph } from './inactivity-glyph';
import { PhoneCallGlyph } from './phone-call-glyph';
import { PhoneReachabilityGlyph } from './phone-reachability-glyph';

/**
 * **CE QUE LA PASTILLE ANNONCE, UNE ANNONCE APRÈS L'AUTRE** (#14147) — le défilement de la file
 * (`lib/view/sync-pill-announcements.ts`) : l'annonce de tête parle quatre secondes, puis cède ; la file vide, la
 * pastille disparaît. `suppressed` : la pastille dit plus urgent (un envoi échoué, la coupure du réseau) — la tête
 * attend sans que son temps de parole ne coure, et part sans avoir été dite si elle attend trop.
 */
export function useShownPillAnnouncement({
  store = pillAnnouncementStore,
  suppressed,
}: {
  readonly store?: PillAnnouncementStoreApi;
  readonly suppressed: boolean;
}): PillAnnouncement | null {
  const queue = useStore(store, (state) => state.queue);
  const [now, setNow] = useState(() => Date.now());
  const head = currentPillAnnouncement({ queue, now: Date.now() });
  const headId = head?.id ?? null;

  useEffect(() => {
    if (headId === null || suppressed) return undefined;
    const timer = setTimeout(() => store.getState().retire(headId), ANNOUNCEMENT_DWELL_MS);
    return () => clearTimeout(timer);
  }, [headId, suppressed, store]);

  /* Une file qui ne contient plus que des annonces périmées se vide : rien ne doit garder la pastille armée. */
  useEffect(() => {
    const stale = queue.filter((entry) => Date.now() - entry.at > ANNOUNCEMENT_MAX_WAIT_MS);
    stale.forEach((entry) => store.getState().retire(entry.id));
    const oldest = queue.find((entry) => Date.now() - entry.at <= ANNOUNCEMENT_MAX_WAIT_MS);
    if (oldest === undefined) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, oldest.at + ANNOUNCEMENT_MAX_WAIT_MS - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [queue, now, store]);

  return suppressed ? null : head;
}

const TEINTE: Readonly<Record<PillAnnouncementTone, { readonly fond: string; readonly encre: string }>> = {
  alert: { fond: 'var(--color-error)', encre: 'var(--color-ios-on-brand)' },
  warn: { fond: 'var(--color-warn)', encre: 'var(--color-ios-ink)' },
  good: { fond: 'var(--color-ios-card)', encre: 'var(--color-ios-ink)' },
};

/** La pastille d'une annonce : pleine comme les trois autres états, jamais du verre. */
export function PillAnnouncementBody({ announcement }: { readonly announcement: PillAnnouncement }) {
  const teinte = TEINTE[announcement.tone];
  return (
    <span
      key={announcement.id}
      data-sync-pill="announcement"
      data-sync-pill-announcement={announcement.key}
      className="flex max-w-full items-center gap-1.5 rounded-chip px-3 py-1.5 text-check font-semibold shadow-lg"
      style={{ backgroundColor: teinte.fond, color: teinte.encre }}
    >
      <PillAnnouncementIconOf icon={announcement.icon} />
      <span className="min-w-0 truncate">{announcement.text}</span>
    </span>
  );
}

function PillAnnouncementIconOf({ icon }: { readonly icon: PillAnnouncement['icon'] }) {
  if (icon.kind === 'phone') return <PhoneReachabilityGlyph reachable={icon.reachable} size={16} />;
  if (icon.kind === 'inactivity') return <InactivityGlyph responded={icon.responded} size={16} />;
  if (icon.kind === 'fall') return <FallGlyph responded={icon.responded} size={16} />;
  if (icon.kind === 'call') return <PhoneCallGlyph active={icon.active} size={16} />;
  return <BatteryGlyph level={icon.level ?? 0} tone={icon.level === null ? 'off' : 'low'} charging={icon.charging} width={18} ink="currentColor" />;
}
