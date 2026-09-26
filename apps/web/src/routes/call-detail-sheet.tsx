import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import type { ReactNode } from 'react';

import { Avatar } from '@/components/avatar';
import { Glyph } from '@/components/glyph';
import { Sheet } from '@/components/sheet';
import type { CallRecord } from '@/lib/api/calls';
import { callActions } from '@/lib/calls/call-actions';
import type { CallMedia } from '@/lib/calls/call-store';
import { callAvatarOf, callDisplayNameOf, callDurationLabel } from '@/lib/calls/view';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { shortRelativeTime } from '@/lib/relative-time';
import { initialsOf } from '@/lib/view/conversation';
import { CallGlyph, DIRECTION_GLYPHS, DIRECTION_LABEL } from '@/routes/calls-parts';
import { Link } from '@/routes/route-table';

/**
 * **LA FICHE D'UN APPEL** (#6383) — miroir de `CallDetailSheet.swift` : toucher
 * une ligne du journal ouvre QUI (avatar, nom), la ligne d'état « direction ·
 * heure » (rouge pour un manqué), les deux RAPPELS (vocal et vidéo, quel que
 * soit le type d'origine), puis le type, la date complète et la durée.
 *
 * iOS y ajoute « Données » et « Numéro » : le journal servi (`CallRecord`) ne
 * porte ni l'un ni l'autre, et une ligne vide est un état qui ment — elles ne
 * s'affichent pas. Le web garde en échange ce que la ligne offrait avant la
 * fiche : ouvrir le FIL de la conversation.
 */

const INK = 'var(--color-ios-ink)';
const INK_2 = 'var(--color-ios-ink-2)';
const MISSED_INK = 'var(--color-error)';
const BRAND = 'var(--color-ios-brand)';
const CARD = 'var(--color-ios-card)';
const EDGE = '1px solid color-mix(in srgb, var(--color-ios-ink-3) 18%, transparent)';

function fullDate(iso: string, language: InterfaceLanguage): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

function DetailRow({ label, marker, children }: { readonly label: string; readonly marker: string; readonly children: ReactNode }) {
  return (
    <div {...{ [marker]: true }} className="flex items-center justify-between gap-4 px-4 py-3" style={{ borderBottom: EDGE }}>
      <dt className="text-body" style={{ color: INK_2 }}>{label}</dt>
      <dd className="text-end text-body font-medium tabular-nums" style={{ color: INK }}>{children}</dd>
    </div>
  );
}

function RedialButton({ media, label, onPress }: { readonly media: CallMedia; readonly label: string; readonly onPress: () => void }) {
  return (
    <button
      type="button"
      data-call-detail-redial={media}
      onClick={onPress}
      className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-[14px] py-3 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ minHeight: 64, backgroundColor: CARD, color: BRAND, outlineColor: BRAND }}
    >
      {media === 'video' ? <CallGlyph name="videoCamera" size={22} /> : <Glyph name="phone" size={22} />}
      {label}
    </button>
  );
}

export function CallDetailSheet({
  language,
  record,
  now,
  onClose,
}: {
  readonly language: InterfaceLanguage;
  readonly record: CallRecord;
  readonly now: Date;
  readonly onClose: () => void;
}) {
  const name = callDisplayNameOf(record, translate(language, 'calls.unknown'));
  const avatar = callAvatarOf(record);
  const missed = record.direction === 'missed';
  const duration = callDurationLabel(record.durationSec);
  const redial = (media: CallMedia) => {
    callActions.start({ conversationId: record.conversationId, media, title: name, avatar, isGroup: record.conversationType !== 'direct' });
    onClose();
  };

  return (
    <Sheet title={translate(language, 'calls.detail.title')} bodyAs="div" onClose={onClose}>
      <div data-call-detail={record.callId} className="min-h-0 flex-1 overflow-y-auto px-4">
        <div className="mx-auto grid w-full max-w-xl gap-6 pb-12 pt-4">
          <div className="grid justify-items-center gap-2 text-center">
            <Avatar initials={initialsOf(name)} color={colorForName(name)} size={72} {...(avatar === null ? {} : { src: avatar })} />
            <p data-call-detail-name className="text-title font-bold" style={{ color: INK }}>{name}</p>
            <p
              data-call-detail-status={record.direction}
              className="flex items-center gap-1 text-caption font-medium"
              style={{ color: missed ? MISSED_INK : INK_2 }}
            >
              <CallGlyph name={DIRECTION_GLYPHS[record.direction]} size={12} />
              {`${translate(language, DIRECTION_LABEL[record.direction])} · ${shortRelativeTime(new Date(record.startedAt), now, language)}`}
            </p>
          </div>

          <div className="flex gap-3">
            <RedialButton media="audio" label={translate(language, 'call.action.audio')} onPress={() => redial('audio')} />
            <RedialButton media="video" label={translate(language, 'call.action.video')} onPress={() => redial('video')} />
          </div>

          <dl className="overflow-hidden rounded-[14px]" style={{ backgroundColor: CARD }}>
            <DetailRow label={translate(language, 'calls.detail.type')} marker="data-call-detail-type">
              {translate(language, record.isVideo ? 'call.action.video' : 'call.action.audio')}
            </DetailRow>
            <DetailRow label={translate(language, 'calls.detail.date')} marker="data-call-detail-date">
              <time dateTime={record.startedAt}>{fullDate(record.startedAt, language)}</time>
            </DetailRow>
            {duration === '' ? null : (
              <DetailRow label={translate(language, 'calls.detail.duration')} marker="data-call-detail-duration">
                {duration}
              </DetailRow>
            )}
          </dl>

          <Link
            to="thread"
            params={{ conversation: record.conversationId }}
            data-call-detail-open
            onClick={onClose}
            className="flex items-center justify-center gap-2 rounded-[14px] px-4 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 44, backgroundColor: CARD, color: BRAND, outlineColor: BRAND }}
          >
            {translate(language, 'calls.detail.open')}
          </Link>
        </div>
      </div>
    </Sheet>
  );
}
