import { memo, type CSSProperties, type ReactNode } from 'react';

import { attachmentSrc } from '@/lib/api/media-url';
import { callActions } from '@/lib/calls/call-actions';
import { translate } from '@/lib/i18n-catalog';
import { translateNotificationRow } from '@/lib/i18n-notification-row-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { notificationCallBack, type NotificationCallBack } from '@/lib/notifications/call-back';
import { notificationAccent } from '@/lib/notifications/categories';
import type { NotificationRecord } from '@/lib/notifications/record';
import {
  notificationQuickActions,
  notificationRowPresentation,
  type NotificationQuickAction,
  type NotificationRowPresentation,
  type RowFooter,
} from '@/lib/notifications/row-presentation';
import { notificationTarget, type NotificationTarget } from '@/lib/notifications/target';
import { shortRelativeTime } from '@/lib/relative-time';
import { initialsOf } from '@/lib/view/conversation';
import { Link } from '@/routes/route-table';

import { Avatar } from './avatar';
import { Glyph, GlyphSvg, type GlyphShape } from './glyph';
import { GLYPHS } from './glyphs';
import { CALLS_GLYPHS } from './glyphs-calls';
import { NOTIFICATIONS_GLYPHS } from './glyphs-notifications';
import { PROGRESSION_GLYPHS } from './glyphs-progression';
import { milestoneGlyph } from './milestone-glyph';
import { NotificationRowMenu } from './notification-row-menu';
import { NotificationSwipe } from './notification-swipe';

/**
 * **UNE LIGNE DE LA CLOCHE** (#6288) — miroir de `NotificationRowView`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationRowView.swift`) :
 * avatar teinté du TYPE et point de non-lu en haut à droite, titre sur deux
 * lignes (semi-gras non lu, moyen lu), corps sur deux lignes, le groupe
 * rappelé sous eux, la vignette du contenu social, l'heure relative courte ;
 * un voile de l'accent derrière une ligne non lue.
 *
 * **Ce qu'elle ouvre est un LIEN quand la destination existe**, un bouton
 * sinon (`notificationTarget`) : ouvrir en nouvel onglet, montrer l'adresse au
 * survol et précharger l'écran viennent avec le lien, par `Link` — jamais une
 * seconde écriture du clic de navigation. Une ligne sans destination web reste
 * un contrôle : elle se marque lue, sans prétendre ouvrir quoi que ce soit.
 *
 * **Le lecteur d'écran entend « Non lue » d'abord**, comme iOS
 * (`accessibilityDescription`), puis le titre, le corps et l'heure — le point
 * coloré est décoratif, et une couleur seule ne dit rien à qui ne la voit pas.
 *
 * Le texte servi est celui de la PASSERELLE (quatrième famille du Prisme,
 * résolue serveur) : aucune descente de langue ici.
 *
 * **Ce qu'elle dit est composé UNE fois** (#8727, miroir de #8724) par
 * `notificationRowPresentation` : aucun texte n'y paraît deux fois ; une
 * réaction ou une réponse sur un commentaire dit en pied le POST qui le porte,
 * avec l'icône du contenu ; un palier dit QUEL badge, par son médaillon ; la
 * personne venue par votre lien s'écrit, et s'ajoute tant qu'on n'est pas amis.
 */

export type NotificationRowProps = {
  readonly notification: NotificationRecord;
  readonly language: InterfaceLanguage;
  readonly now: Date;
  readonly onOpen: (id: string) => void;
  readonly onMarkRead: (id: string) => void;
  readonly onDelete: (id: string) => void;
  /** Les gestes de la ligne (Écrire, Se connecter) — sans lui, la ligne n'en propose aucun. */
  readonly onQuickAction?: (id: string, action: NotificationQuickAction) => void;
  /** L'acteur est déjà un ami : « Se connecter » ne se propose pas. */
  readonly isFriend?: boolean;
  /** Une demande est déjà partie vers l'acteur : le bouton le dit. */
  readonly connectRequested?: boolean;
};

export type SurfaceProps = {
  readonly className: string;
  readonly style: CSSProperties;
  readonly onClick: () => void;
  readonly children: ReactNode;
  /** Le raccourci que la surface ANNONCE (la bannière : Flèche bas ouvre l'aperçu, #8821). */
  readonly 'aria-keyshortcuts'?: string;
  readonly 'aria-description'?: string;
  /** `false` sur une surface qu'on BALAIE : un lien que le navigateur glisse annule le geste (`pointercancel`). */
  readonly draggable?: boolean;
};

export function TargetLink({ target, ...surface }: SurfaceProps & { readonly target: NotificationTarget }) {
  switch (target.route) {
    case 'thread':
      return <Link to="thread" params={target.params} {...surface} />;
    case 'story':
      return <Link to="story" params={target.params} {...surface} />;
    case 'post':
      return <Link to="post" params={target.params} {...surface} />;
    case 'discover':
      /* L'onglet « Demandes » voyage en `search` : la destination le PORTE
         (#7173), la ligne ne le reconstruit pas. */
      return <Link to="discover" search={target.search} {...surface} />;
    case 'userProfile':
      return <Link to="userProfile" params={target.params} {...surface} />;
    case 'progression':
      return <Link to="progression" {...surface} />;
    case 'settings':
      return <Link to="settings" {...surface} />;
  }
}

/**
 * « RAPPELER » (A6, C12) — posé à côté du menu de la ligne, HORS de son lien :
 * un appel manqué se rappelle en un tap, du même type, sans ouvrir le fil. Le
 * moteur d'appel n'est chargé qu'au geste (`callActions`).
 */
function CallBackButton({ language, callBack }: { readonly language: InterfaceLanguage; readonly callBack: NotificationCallBack }) {
  return (
    <button
      type="button"
      data-notification-call-back={callBack.media}
      aria-label={translate(language, 'call.callBack.named', { name: callBack.title })}
      onClick={() => callActions.start(callBack)}
      className="absolute top-1/2 end-12 grid size-11 -translate-y-1/2 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
    >
      {callBack.media === 'video' ? <GlyphSvg glyph={CALLS_GLYPHS.videoCamera} size={20} /> : <Glyph name="phone" size={20} />}
    </button>
  );
}

export const CONTENT_GLYPHS: Readonly<Record<Extract<RowFooter, { kind: 'content' }>['content'], GlyphShape>> = {
  story: NOTIFICATIONS_GLYPHS.circleDashed,
  reel: PROGRESSION_GLYPHS.filmStrip,
  mood: GLYPHS.smiley,
  status: GLYPHS.smiley,
  post: PROGRESSION_GLYPHS.article,
};

/** Le médaillon d'un palier : l'icône du badge sur un disque en relief, teinté du type — la ligne dit QUEL badge avant qu'on la lise. */
export function MilestoneMedallion({ glyph, accent }: { readonly glyph: GlyphShape; readonly accent: string }) {
  return (
    <span
      data-notification-milestone
      aria-hidden="true"
      className="grid place-items-center rounded-full"
      style={{
        width: 44,
        height: 44,
        color: `color-mix(in srgb, ${accent} 70%, var(--color-ios-ink))`,
        backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${accent} 38%, transparent), color-mix(in srgb, ${accent} 14%, transparent))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 45%, transparent), 0 3px 8px color-mix(in srgb, ${accent} 30%, transparent)`,
      }}
    >
      <GlyphSvg glyph={glyph} size={20} />
    </span>
  );
}

function footerGlyph(footer: RowFooter): GlyphShape | null {
  if (footer.kind === 'conversation') return NOTIFICATIONS_GLYPHS.chatCircle;
  if (footer.kind === 'plain') return null;
  return footer.expired ? GLYPHS.clock : CONTENT_GLYPHS[footer.content];
}

/** Le pied : OÙ ça s'est passé — le groupe d'un message, le post d'une réaction ou d'un commentaire. Même gabarit pour tous. */
function RowFooterLine({ footer }: { readonly footer: RowFooter }) {
  const glyph = footerGlyph(footer);
  const expired = footer.kind === 'content' && footer.expired;
  return (
    <span
      data-notification-footer={footer.kind}
      className="mt-0.5 flex min-w-0 items-center gap-1.5 text-chip"
      style={{ color: expired ? 'var(--color-error)' : 'var(--color-ios-ink-2)' }}
    >
      {glyph === null ? null : (
        <span aria-hidden="true" className="grid shrink-0 place-items-center">
          <GlyphSvg glyph={glyph} size={12} />
        </span>
      )}
      <span className="truncate">{footer.text}</span>
    </span>
  );
}

/**
 * Les gestes de la ligne, HORS de son lien (un bouton dans un lien ne reçoit
 * pas ses touches), alignés sur le texte sous l'avatar : « Se connecter » est
 * le geste primaire tant qu'il reste à faire, « Écrire » l'accompagne.
 */
function QuickActions({
  actions,
  language,
  connectRequested,
  onQuickAction,
}: {
  readonly actions: readonly NotificationQuickAction[];
  readonly language: InterfaceLanguage;
  readonly connectRequested: boolean;
  readonly onQuickAction: (action: NotificationQuickAction) => void;
}) {
  return (
    <div data-notification-quick-actions className="flex flex-wrap gap-2 pe-4 pb-3" style={{ paddingInlineStart: 72 }}>
      {actions.map((action) => {
        const sent = action.kind === 'connect' && connectRequested;
        const primary = action.kind === 'connect' && !sent;
        const label = translateNotificationRow(
          language,
          action.kind === 'write' ? 'notifications.quick.write' : sent ? 'notifications.quick.connect.sent' : 'notifications.quick.connect',
        );
        const glyph = action.kind === 'write' ? NOTIFICATIONS_GLYPHS.chatCircle : sent ? GLYPHS.check : NOTIFICATIONS_GLYPHS.userPlus;
        return (
          <button
            key={action.kind}
            type="button"
            data-quick-action={action.kind}
            disabled={sent}
            onClick={() => onQuickAction(action)}
            className="flex items-center gap-1.5 rounded-full px-3.5 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default"
            style={{
              minHeight: 44,
              outlineColor: 'var(--color-ios-brand)',
              color: primary ? 'var(--color-ios-on-brand)' : 'var(--color-ios-brand)',
              backgroundColor: primary ? 'var(--color-ios-brand)' : 'color-mix(in srgb, var(--color-ios-brand) 14%, transparent)',
            }}
          >
            <GlyphSvg glyph={glyph} size={14} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function RowText({
  presentation,
  unread,
  language,
}: {
  readonly presentation: NotificationRowPresentation;
  readonly unread: boolean;
  readonly language: InterfaceLanguage;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      {unread ? <span className="sr-only">{`${translate(language, 'notifications.unread')}. `}</span> : null}
      <span
        data-notification-title
        className={`line-clamp-2 text-secondary ${unread ? 'font-semibold' : 'font-medium'}`}
        style={{ color: 'var(--color-ios-ink)' }}
      >
        {presentation.title}
      </span>
      {presentation.body === null ? null : (
        <span data-notification-body className="line-clamp-2 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {presentation.body}
        </span>
      )}
      {presentation.quote === null ? null : (
        <span data-notification-quote className="truncate text-chip italic" style={{ color: 'var(--color-ios-ink-2)' }}>
          {presentation.quote}
        </span>
      )}
      {presentation.footer === null ? null : <RowFooterLine footer={presentation.footer} />}
    </span>
  );
}

function NotificationRowView({
  notification,
  language,
  now,
  onOpen,
  onMarkRead,
  onDelete,
  onQuickAction,
  isFriend = false,
  connectRequested = false,
}: NotificationRowProps) {
  const { id, metadata, state } = notification;
  const accent = notificationAccent(notification.type);
  const unread = !state.isRead;
  const presentation = notificationRowPresentation(notification, { language, now });
  const target = notificationTarget(notification);
  const avatar = notification.actor?.avatar ?? null;
  const callBack = notificationCallBack(notification);
  const actions = onQuickAction === undefined ? [] : notificationQuickActions(notification, { isFriend });

  const surface: SurfaceProps = {
    className: `flex w-full items-start gap-3 py-3 ${callBack === null ? 'pe-14' : 'pe-24'} ps-4 text-start focus-visible:outline-2 focus-visible:-outline-offset-2`,
    style: { outlineColor: 'var(--color-ios-brand)' },
    onClick: () => onOpen(id),
    draggable: false,
    children: (
      <>
        <span className="relative shrink-0">
          {presentation.leading.kind === 'milestone' ? (
            <MilestoneMedallion glyph={milestoneGlyph(presentation.leading.glyph)} accent={accent} />
          ) : (
            /* Les initiales d'une PERSONNE viennent de son nom, jamais du titre :
               « Marie est sur Meeshy ! » y lisait « ME » (#8143). Le titre ne
               sert qu'aux notifications sans acteur (annonces système). */
            <Avatar
              initials={initialsOf(notification.actor?.displayName ?? presentation.title)}
              color={accent}
              size={44}
              {...(avatar === null ? {} : { src: avatar })}
            />
          )}
          {unread ? (
            <span
              aria-hidden="true"
              className="absolute rounded-full"
              style={{ top: -1, right: -1, width: 9, height: 9, backgroundColor: accent, boxShadow: '0 0 0 2px var(--color-ios-surface)' }}
            />
          ) : null}
        </span>
        <RowText presentation={presentation} unread={unread} language={language} />
        {metadata.postThumbnailUrl === undefined ? null : (
          <img
            /* `PostMedia.thumbnailUrl` est une RÉFÉRENCE de média, pas une
               adresse (#6388) : la clé nue se résoudrait contre le CHEMIN du
               document (`/notifications/2026/09/…`, où le SPA rend son
               `index.html`) et l'adresse héritée contre la RACINE de la
               passerelle. `attachmentSrc` est le site unique de la règle. */
            src={attachmentSrc(metadata.postThumbnailUrl)}
            alt=""
            width={44}
            height={44}
            loading="lazy"
            decoding="async"
            className="shrink-0 object-cover"
            style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)` }}
          />
        )}
        <span data-notification-time className="shrink-0 text-chip font-medium tabular-nums" style={{ color: 'var(--color-ios-ink-2)' }}>
          {shortRelativeTime(new Date(state.createdAt), now)}
        </span>
      </>
    ),
  };

  return (
    <li
      data-notification={id}
      data-notification-type={notification.type}
      data-read={unread ? 'false' : 'true'}
      className="group"
      style={{
        borderBottom: '1px solid var(--color-edge)',
        ...(unread ? { backgroundColor: `color-mix(in srgb, ${accent} 7%, transparent)` } : {}),
      }}
    >
      {/* Glisser vers la fin de la ligne la SUPPRIME (#8960) — le fond de la
          rangée glisse avec elle, la corbeille se révèle dessous. */}
      <NotificationSwipe
        onDelete={() => onDelete(id)}
        background={unread ? `color-mix(in srgb, ${accent} 7%, var(--color-canvas))` : 'var(--color-canvas)'}
      >
        <div className="relative">
          {target === null ? (
            <button type="button" className={surface.className} style={surface.style} onClick={surface.onClick}>
              {surface.children}
            </button>
          ) : (
            <TargetLink target={target} {...surface} />
          )}
          {callBack === null ? null : <CallBackButton language={language} callBack={callBack} />}
          <NotificationRowMenu language={language} unread={unread} onMarkRead={() => onMarkRead(id)} onDelete={() => onDelete(id)} />
        </div>
      </NotificationSwipe>
      {actions.length === 0 || onQuickAction === undefined ? null : (
        <QuickActions actions={actions} language={language} connectRequested={connectRequested} onQuickAction={(action) => onQuickAction(id, action)} />
      )}
    </li>
  );
}

export const NotificationRow = memo(NotificationRowView);
