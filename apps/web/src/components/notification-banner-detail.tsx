import type { CSSProperties, PointerEvent } from 'react';

import { translateNotificationRow } from '@/lib/i18n-notification-row-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { coqueCourante } from '@/lib/native-shell';
import { focusComposerInDocument } from '@/lib/notifications/composer-focus-intent';
import { bannerActions, bannerAudio, type BannerAction } from '@/lib/notifications/content-detail';
import type { NotificationRecord } from '@/lib/notifications/record';
import { navigate } from '@/lib/router';

import { BannerAudioPlayer } from './notification-banner-audio';

/**
 * **LE PIED DE LA BANNIÈRE IN-APP : CE QUE LE CONTENU FAIT FAIRE** (#8860,
 * jumeau web de `NotificationDetailCategories` iOS, #8858) — le lecteur d'un
 * vocal, l'effectif d'une invitation, puis les gestes : « Ouvrir la carte »
 * ou « Rejoindre », et « Répondre ». Rien pour un contenu qui n'appelle aucun
 * geste (une réaction, un post aimé) : aucun pied vide.
 *
 * Chaque geste ferme la bannière et la marque lue, comme le toucher du corps.
 * « Ouvrir la carte » part dans un nouvel onglet (Plans), ou dans l'app de
 * cartes sous la coque Android (`geo:`) — jamais une tuile chargée d'un tiers.
 */

const PILL = 30;

const stop = (event: PointerEvent<HTMLElement>) => event.stopPropagation();

const LABELS: Readonly<Record<BannerAction['kind'], 'notifications.banner.openMap' | 'notifications.banner.join' | 'notifications.banner.reply'>> = {
  'open-map': 'notifications.banner.openMap',
  join: 'notifications.banner.join',
  reply: 'notifications.banner.reply',
};

function pillStyle(accent: string, primary: boolean): CSSProperties {
  return primary
    ? {
        height: PILL,
        outlineColor: accent,
        backgroundImage: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 72%, var(--color-media-backdrop)))`,
        boxShadow: `0 2px 6px color-mix(in srgb, ${accent} 30%, transparent)`,
      }
    : { height: PILL, outlineColor: accent, color: accent, backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)` };
}

const PILL_CLASS = 'inline-flex items-center rounded-full px-3.5 text-chip font-semibold focus-visible:outline-2 focus-visible:outline-offset-2';

function ActionPill({ action, accent, language, onDone }: { readonly action: BannerAction; readonly accent: string; readonly language: InterfaceLanguage; readonly onDone: () => void }) {
  const label = translateNotificationRow(language, LABELS[action.kind]);
  const primary = action.kind !== 'reply';
  const className = `${PILL_CLASS}${primary ? ' text-ios-on-brand' : ''}`;
  if (action.kind === 'open-map') {
    return (
      <a data-banner-action={action.kind} href={action.href} target="_blank" rel="noopener noreferrer" onClick={onDone} className={className} style={pillStyle(accent, primary)}>
        {label}
      </a>
    );
  }
  const run = () => {
    navigate(action.path);
    if (action.kind === 'reply') focusComposerInDocument();
    onDone();
  };
  return (
    <button type="button" data-banner-action={action.kind} onClick={run} className={className} style={pillStyle(accent, primary)}>
      {label}
    </button>
  );
}

function membersLabel(language: InterfaceLanguage, count: number): string {
  return count === 1
    ? translateNotificationRow(language, 'notifications.banner.member')
    : translateNotificationRow(language, 'notifications.banner.members', { count: String(count) });
}

export function BannerDetailFooter({
  notification,
  accent,
  language,
  onDone,
  onPlayingChange,
}: {
  readonly notification: NotificationRecord;
  readonly accent: string;
  readonly language: InterfaceLanguage;
  readonly onDone: () => void;
  readonly onPlayingChange: (playing: boolean) => void;
}) {
  const actions = bannerActions(notification, { platform: coqueCourante()?.getPlatform?.() });
  const audio = bannerAudio(notification);
  const members = notification.context.contentDetail?.invite?.memberCount ?? null;
  if (actions.length === 0 && audio === null) return null;
  return (
    <div data-banner-actions className="flex flex-col gap-2.5 ps-3.5 pe-3.5 pb-4" onPointerDown={stop}>
      {audio === null ? null : (
        <BannerAudioPlayer audio={audio} audioKey={notification.id} accent={accent} language={language} onPlayingChange={onPlayingChange} />
      )}
      {actions.length === 0 ? null : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {members === null ? null : (
            <span data-banner-invite-members className="me-auto text-chip tabular-nums" style={{ color: 'var(--color-ios-ink-2)' }}>
              {membersLabel(language, members)}
            </span>
          )}
          {actions.map((action) => (
            <ActionPill key={action.kind} action={action} accent={accent} language={language} onDone={onDone} />
          ))}
        </div>
      )}
    </div>
  );
}
