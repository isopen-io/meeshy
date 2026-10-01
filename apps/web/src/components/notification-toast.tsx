import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'zustand/react';

import { attachmentSrc } from '@/lib/api/media-url';
import { translateNotificationRow } from '@/lib/i18n-notification-row-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { notificationAccent, notificationFamily } from '@/lib/notifications/categories';
import { openConversationPreview } from '@/lib/notifications/conversation-preview';
import { inAppBannerStore } from '@/lib/notifications/in-app-banner';
import { BANNER_LIFETIME_MS, bannerPresentation, bannerSwipeOutcome, type BannerPresentation } from '@/lib/notifications/in-app-banner-view';
import type { NotificationRecord } from '@/lib/notifications/record';
import { notificationTarget } from '@/lib/notifications/target';
import { initialsOf } from '@/lib/view/conversation';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';
import { markNotificationReadAction } from '@/lib/view/use-notifications';

import { Avatar } from './avatar';
import { GlyphSvg } from './glyph';
import { GLYPHS } from './glyphs';
import { milestoneGlyph } from './milestone-glyph';
import { preloadConversationPreview } from './conversation-preview-chunks';
import { CategoryGlyphView } from './notification-category-glyph';
import { CONTENT_GLYPHS, MilestoneMedallion, TargetLink, type SurfaceProps } from './notification-row';

/**
 * **LA BANNIÈRE IN-APP, EN RELIEF** (#8727, jumelle de `NotificationToastView`
 * iOS, #8723 — directive porteur 2026-09-29 : « un design plus sexy avec du
 * relief »). Une plaque de verre posée sur un voile DENSE (le texte reste
 * lisible sur une photo, correction qu'iOS a payée), bordée d'un reflet en
 * haut qui vire à l'accent du type en bas, détachée de l'écran par deux
 * ombres — une large et douce (la hauteur), une courte teintée (le contact).
 * L'avatar porte la pastille du TYPE, la ligne de titre porte l'heure, et
 * l'aperçu ne paraît qu'UNE fois (`bannerPresentation`).
 *
 * Gestes : toucher ouvre (et marque lue) ; balayer vers le HAUT ferme ; tirer
 * vers le BAS — ou Flèche bas au clavier — ouvre la conversation en APERÇU
 * (#8821, `conversation-preview-sheet.tsx`) ; la croix et Échap ferment au
 * clavier ; survoler ou focaliser suspend le départ.
 * Elle part seule après 7 s. Entrée en ressort ; sous « réduire les
 * animations », un fondu.
 */

const CARD_RADIUS = 22;
const THUMB = 30;

const timeFormat = (language: InterfaceLanguage) => new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' });

function Leading({ notification, banner, accent }: { readonly notification: NotificationRecord; readonly banner: BannerPresentation; readonly accent: string }) {
  if (banner.milestone !== null) return <MilestoneMedallion glyph={milestoneGlyph(banner.milestone)} accent={accent} />;
  const avatar = notification.actor?.avatar ?? null;
  return (
    <span className="relative shrink-0" style={{ filter: 'drop-shadow(0 2px 4px var(--color-scrim-soft))' }}>
      <Avatar initials={initialsOf(notification.actor?.displayName ?? banner.headline)} color={accent} size={44} {...(avatar === null ? {} : { src: avatar })} />
      <span
        data-banner-type-badge
        aria-hidden="true"
        className="absolute grid place-items-center rounded-full text-ios-on-brand"
        style={{
          right: -3,
          bottom: -3,
          width: 20,
          height: 20,
          backgroundImage: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 78%, var(--color-media-backdrop)))`,
          boxShadow: '0 0 0 2px var(--color-ios-surface)',
        }}
      >
        <CategoryGlyphView category={notificationFamily(notification.type)} size={10} />
      </span>
    </span>
  );
}

/** La case du contenu visé : sa vignette, ou son icône teintée — la même case, jamais deux dispositions. */
function ContentTile({ notification, banner, accent }: { readonly notification: NotificationRecord; readonly banner: BannerPresentation; readonly accent: string }) {
  const thumbnail = notification.metadata.postThumbnailUrl;
  if (thumbnail === undefined && banner.content === null) return null;
  const box = { width: THUMB, height: THUMB, borderRadius: 8, flexShrink: 0 } as const;
  if (thumbnail !== undefined) {
    return <img src={attachmentSrc(thumbnail)} alt="" aria-hidden="true" decoding="async" className="object-cover" style={{ ...box, backgroundColor: `color-mix(in srgb, ${accent} 13%, transparent)` }} />;
  }
  return (
    <span aria-hidden="true" className="grid place-items-center" style={{ ...box, color: accent, backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)` }}>
      <GlyphSvg glyph={CONTENT_GLYPHS[banner.content ?? 'post']} size={14} />
    </span>
  );
}

function useEnterAnimation(key: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof element.animate !== 'function') return;
    const reduced = prefersReducedMotion();
    element.animate(
      reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: 'translateY(-110%) scale(0.96)' },
            { opacity: 1, transform: 'translateY(0) scale(1)' },
          ],
      { duration: reduced ? 180 : 460, easing: reduced ? 'ease-out' : 'cubic-bezier(0.2, 1.25, 0.35, 1)' },
    );
  }, [key]);
  return ref;
}

export function NotificationBanner({ notification, onDismiss }: { readonly notification: NotificationRecord; readonly onDismiss: () => void }) {
  const language = currentInterfaceLanguage();
  const receivedAt = useMemo(() => new Date(), [notification.id]);
  const banner = useMemo(() => bannerPresentation(notification, { language, now: receivedAt }), [notification, language, receivedAt]);
  const accent = notificationAccent(notification.type);
  const target = notificationTarget(notification);
  const [held, setHeld] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragFrom = useRef<number | null>(null);
  const dragged = useRef(false);
  const card = useEnterAnimation(notification.id);

  useEffect(() => {
    if (held) return;
    const handle = setTimeout(onDismiss, BANNER_LIFETIME_MS);
    return () => clearTimeout(handle);
  }, [held, notification.id, onDismiss]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  /* L'APERÇU (#8821) — tirer vers le bas, ou Flèche bas au clavier, ouvre la
     conversation en aperçu sans quitter l'écran. Sans conversation (un post
     aimé, un badge), rien ne s'annonce : aucun geste ne promet ce qu'il ne
     fait pas. */
  const previewId = notification.context.conversationId;
  const openPreview = () => {
    if (previewId === undefined) return;
    openConversationPreview(previewId);
    onDismiss();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragFrom.current = event.clientY;
    dragged.current = false;
    if (previewId !== undefined) void preloadConversationPreview();
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragFrom.current === null) return;
    const delta = event.clientY - dragFrom.current;
    if (Math.abs(delta) > 6 && !dragged.current) {
      dragged.current = true;
      /* Le geste CAPTURE le pointeur dès qu'il glisse : à la souris, la carte
         résiste au tirage et le curseur la quitte — relâché dessous, le
         `pointerup` n'aurait atteint personne. Pas avant : capturé dès l'appui,
         le clic d'un simple toucher viserait la carte, plus le lien. */
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* Un pointeur synthétique n'a pas toujours de capture : le geste reste suivi par la carte. */
      }
    }
    /* Vers le haut la carte suit le doigt ; vers le bas elle résiste — elle
       dit qu'elle s'ouvre, elle ne descend pas. */
    setDragY(delta < 0 ? delta : previewId === undefined ? 0 : Math.min(18, delta * 0.25));
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    setDragY(0);
    if (from === null) return;
    const outcome = bannerSwipeOutcome(event.clientY - from);
    if (outcome === 'dismiss') onDismiss();
    if (outcome === 'preview') openPreview();
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' || previewId === undefined) return;
    event.preventDefault();
    openPreview();
  };

  const open = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    void markNotificationReadAction(notification.id);
    onDismiss();
  };

  const time = timeFormat(language).format(receivedAt);
  const surface: SurfaceProps = {
    className: 'flex w-full items-center gap-3 pt-3 pb-4 ps-3.5 pe-12 text-start focus-visible:outline-2 focus-visible:-outline-offset-2',
    style: { outlineColor: 'var(--color-ios-brand)', borderRadius: CARD_RADIUS },
    onClick: open,
    /* Un LIEN se glisse nativement à la souris : Chromium lance son
       glisser-déposer et annule le geste (`pointercancel`) — ni le balayage
       ni le tirage n'aboutissaient jamais au pointeur. */
    draggable: false,
    ...(previewId === undefined
      ? {}
      : { 'aria-keyshortcuts': 'ArrowDown', 'aria-description': translateNotificationRow(language, 'notifications.banner.previewHint') }),
    children: (
      <>
        <Leading notification={notification} banner={banner} accent={accent} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span data-banner-headline className="min-w-0 flex-1 truncate text-secondary font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              {banner.headline}
            </span>
            <span className="shrink-0 text-chip font-medium tabular-nums" style={{ color: 'var(--color-ios-ink-2)' }}>
              {time}
            </span>
          </span>
          {banner.body === null && banner.content === null && notification.metadata.postThumbnailUrl === undefined ? null : (
            <span className="flex min-w-0 items-center gap-2">
              <ContentTile notification={notification} banner={banner} accent={accent} />
              {banner.body === null ? null : (
                <span data-banner-body className="line-clamp-2 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                  {banner.body}
                </span>
              )}
            </span>
          )}
        </span>
      </>
    ),
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={translateNotificationRow(language, 'notifications.banner.label')}
      data-in-app-banner={notification.id}
      className="pointer-events-none fixed inset-x-0 flex justify-center px-2"
      style={{ top: 'calc(env(safe-area-inset-top) + 8px)', zIndex: 1050 }}
    >
      <div
        ref={card}
        className="glass-prominent pointer-events-auto relative w-full"
        style={{
          maxWidth: 440,
          borderRadius: CARD_RADIUS,
          touchAction: 'none',
          transform: dragY === 0 ? undefined : `translateY(${dragY}px)`,
          opacity: dragY === 0 ? 1 : Math.max(0.35, 1 + dragY / 120),
          backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${accent} 10%, transparent), transparent 70%)`,
          boxShadow: `0 16px 36px -10px var(--color-scrim), 0 2px 6px color-mix(in srgb, ${accent} 26%, transparent)`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onKeyDown={onKeyDown}
        onPointerCancel={() => {
          dragFrom.current = null;
          setDragY(0);
        }}
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
      >
        {/* Le liseré : un REFLET en haut (la lumière tombe sur l'arête), l'accent du type en bas. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: CARD_RADIUS,
            padding: 1,
            backgroundImage: `linear-gradient(180deg, var(--color-on-media-3), color-mix(in srgb, ${accent} 40%, transparent))`,
            WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', // harmony-exempt: masque alpha technique, la couleur ne se voit pas
            WebkitMaskComposite: 'xor',
            mask: 'linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)', // harmony-exempt: masque alpha technique, la couleur ne se voit pas
          }}
        />
        {target === null ? (
          <button type="button" {...surface} />
        ) : (
          <TargetLink target={target} {...surface} />
        )}
        <button
          type="button"
          data-banner-dismiss
          aria-label={translateNotificationRow(language, 'notifications.banner.dismiss')}
          onClick={onDismiss}
          className="absolute top-1 end-1 grid size-11 place-items-center rounded-full focus-visible:outline-2"
          style={{ color: 'var(--color-ios-ink-2)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <GlyphSvg glyph={GLYPHS.x} size={14} />
        </button>
        {/* La poignée : dit sans mot que la carte se balaie. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full"
          style={{ left: '50%', transform: 'translateX(-50%)', bottom: 5, width: 36, height: 4, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-2) 45%, transparent)' }}
        />
      </div>
    </div>
  );
}

/** L'hôte monté par la coquille : la bannière courante, ou rien. */
export function NotificationToastHost() {
  const current = useStore(inAppBannerStore, (state) => state.current);
  const dismiss = useStore(inAppBannerStore, (state) => state.dismiss);
  if (current === null) return null;
  const banner = <NotificationBanner key={current.id} notification={current} onDismiss={dismiss} />;
  /* Hors de `#root` : une visionneuse ouverte le rend inerte, et la bannière
     doit rester touchable au-dessus d'elle (comme l'appel, `call-layer.tsx`). */
  return typeof document === 'undefined' ? banner : createPortal(banner, document.body);
}
