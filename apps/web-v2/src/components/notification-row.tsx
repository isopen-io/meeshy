import { memo, type CSSProperties, type ReactNode } from 'react';

import { attachmentSrc } from '@/lib/api/media-url';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { notificationAccent } from '@/lib/notifications/categories';
import { notificationTitle, type NotificationRecord } from '@/lib/notifications/record';
import { notificationTarget, type NotificationTarget } from '@/lib/notifications/target';
import { shortRelativeTime } from '@/lib/relative-time';
import { initialsOf } from '@/lib/view/conversation';
import { Link } from '@/routes/route-table';

import { Avatar } from './avatar';
import { NotificationRowMenu } from './notification-row-menu';

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
 */

export type NotificationRowProps = {
  readonly notification: NotificationRecord;
  readonly language: InterfaceLanguage;
  readonly now: Date;
  readonly onOpen: (id: string) => void;
  readonly onMarkRead: (id: string) => void;
  readonly onDelete: (id: string) => void;
};

type SurfaceProps = { readonly className: string; readonly style: CSSProperties; readonly onClick: () => void; readonly children: ReactNode };

function TargetLink({ target, ...surface }: SurfaceProps & { readonly target: NotificationTarget }) {
  switch (target.route) {
    case 'thread':
      return <Link to="thread" params={target.params} {...surface} />;
    case 'story':
      return <Link to="story" params={target.params} {...surface} />;
    case 'post':
      return <Link to="post" params={target.params} {...surface} />;
    case 'progression':
      return <Link to="progression" {...surface} />;
    case 'settings':
      return <Link to="settings" {...surface} />;
  }
}

function NotificationRowView({ notification, language, now, onOpen, onMarkRead, onDelete }: NotificationRowProps) {
  const { id, context, metadata, state } = notification;
  const accent = notificationAccent(notification.type);
  const unread = !state.isRead;
  const title = notificationTitle(notification);
  const target = notificationTarget(notification);
  const group = context.conversationType !== undefined && context.conversationType !== 'direct' ? context.conversationTitle : undefined;
  const avatar = notification.actor?.avatar ?? null;

  const surface: SurfaceProps = {
    className:
      'flex w-full items-start gap-3 py-3 pr-14 pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2',
    style: {
      outlineColor: 'var(--color-ios-brand)',
      ...(unread ? { backgroundColor: `color-mix(in srgb, ${accent} 7%, transparent)` } : {}),
    },
    onClick: () => onOpen(id),
    children: (
      <>
        <span className="relative shrink-0">
          <Avatar initials={initialsOf(title)} color={accent} size={44} {...(avatar === null ? {} : { src: avatar })} />
          {unread ? (
            <span
              aria-hidden="true"
              className="absolute rounded-full"
              style={{ top: -1, right: -1, width: 9, height: 9, backgroundColor: accent, boxShadow: '0 0 0 2px var(--color-ios-surface)' }}
            />
          ) : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {unread ? <span className="sr-only">{`${translate(language, 'notifications.unread')}. `}</span> : null}
          <span
            data-notification-title
            className={`line-clamp-2 text-secondary ${unread ? 'font-semibold' : 'font-medium'}`}
            style={{ color: 'var(--color-ios-ink)' }}
          >
            {title}
          </span>
          {notification.content === '' ? null : (
            <span data-notification-body className="line-clamp-2 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {notification.content}
            </span>
          )}
          {group === undefined ? null : (
            <span className="truncate text-chip" style={{ color: 'var(--color-ios-ink-2)' }}>
              {group}
            </span>
          )}
        </span>
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
      className="group relative"
      style={{ borderBottom: '1px solid var(--color-edge)' }}
    >
      {target === null ? (
        <button type="button" className={surface.className} style={surface.style} onClick={surface.onClick}>
          {surface.children}
        </button>
      ) : (
        <TargetLink target={target} {...surface} />
      )}
      <NotificationRowMenu language={language} unread={unread} onMarkRead={() => onMarkRead(id)} onDelete={() => onDelete(id)} />
    </li>
  );
}

export const NotificationRow = memo(NotificationRowView);
