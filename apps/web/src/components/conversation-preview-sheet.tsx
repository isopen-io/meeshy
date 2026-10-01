import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { translateNotificationRow } from '@/lib/i18n-notification-row-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { Link } from '@/routes/route-table';

import { GlyphSvg } from './glyph';
import { GLYPHS } from './glyphs';
import { MEDIA_GLYPHS } from './glyphs-media';

/**
 * **LA FEUILLE DE L'APERÇU D'UNE CONVERSATION** (#8821, jumelle de la
 * `.sheet(item: $notificationPreviewConversation)` iOS, `RootViewLayers`) —
 * ouverte en tirant la bannière vers le bas, elle pose le FIL lui-même
 * (`routes/thread.tsx` en aperçu : il défile, sous son en-tête complet en
 * verre, sans chevron retour) par-dessus l'écran courant, qu'on ne quitte pas.
 *
 * Elle se ferme par le geste INVERSE (la poignée tirée vers le bas), en
 * touchant hors d'elle, par la croix, Échap ou le retour arrière ; la flèche
 * d'angle ouvre la conversation complète.
 *
 * POSÉE SUR `document.body`, et `#root` rendu INERTE tant qu'elle vit : le
 * clavier ne s'échappe pas vers l'écran recouvert. Pas de `<dialog>` modal :
 * la couche supérieure du navigateur recouvrirait les menus que le fil pose
 * lui-même sur `document.body` (menu du message, actions d'une rangée). À
 * `z-index` 30 — celui des menus flottants de la coquille, qu'elle recouvre
 * par l'ordre du document —, ces menus, montés APRÈS elle, restent au-dessus.
 */

/** Au-delà de 96 px tirés vers le bas, la poignée ferme l'aperçu ; en deçà, la feuille revient. */
export const previewSheetDragOutcome = (translationY: number): 'close' | 'none' => (translationY > 96 ? 'close' : 'none');

const CORNER = 22;

function useInertBackdrop(): void {
  useEffect(() => {
    const root = document.getElementById('root');
    if (root === null || root.hasAttribute('inert')) return;
    root.setAttribute('inert', '');
    return () => root.removeAttribute('inert');
  }, []);
}

function useFocusInside(body: { readonly current: HTMLElement | null }): void {
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    body.current?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, [body]);
}

function useEnterAnimation(panel: { readonly current: HTMLElement | null }): void {
  useEffect(() => {
    const element = panel.current;
    if (element === null || typeof element.animate !== 'function') return;
    const reduced = prefersReducedMotion();
    element.animate(
      reduced ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
      { duration: reduced ? 180 : 420, easing: reduced ? 'ease-out' : 'cubic-bezier(0.2, 1.1, 0.35, 1)' },
    );
  }, [panel]);
}

function capture(event: PointerEvent<HTMLElement>): void {
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    /* Un pointeur synthétique (lecteur d'écran, témoin) n'a pas de capture : le geste reste suivi par l'élément. */
  }
}

export function ConversationPreviewSheet({
  conversationId,
  onClose,
  children,
}: {
  readonly conversationId: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const language = currentInterfaceLanguage();
  const panel = useRef<HTMLDivElement | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const dragFrom = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  useBackDismiss(onClose, { escape: true });
  useInertBackdrop();
  useFocusInside(body);
  useEnterAnimation(panel);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragFrom.current = event.clientY;
    capture(event);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragFrom.current === null) return;
    setDragY(Math.max(0, event.clientY - dragFrom.current));
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    setDragY(0);
    if (from !== null && previewSheetDragOutcome(event.clientY - from) === 'close') onClose();
  };

  const disc = 'grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-2';
  const discStyle: CSSProperties = { color: 'var(--color-ios-on-brand)', outlineColor: 'var(--color-ios-brand)' };
  const discFace = (child: ReactNode) => (
    <span className="glass grid size-8 place-items-center rounded-full" style={{ color: 'var(--color-ios-ink)' }}>
      {child}
    </span>
  );

  const sheet = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={translateNotificationRow(language, 'notifications.preview.label')}
      data-conversation-preview={conversationId}
      className="fixed inset-0"
      style={{ zIndex: 30 }}
    >
      <div
        data-preview-scrim
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundColor: 'var(--color-scrim)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          opacity: dragY === 0 ? 1 : Math.max(0.3, 1 - dragY / 400),
        }}
        onClick={onClose}
      />
      <div
        ref={panel}
        className="absolute inset-x-0 bottom-0 mx-auto flex w-full flex-col sm:bottom-4"
        style={{
          top: 'calc(var(--safe-top) + 6px)',
          maxWidth: 640,
          transform: dragY === 0 ? undefined : `translateY(${dragY}px)`,
        }}
      >
        <div className="flex shrink-0 items-center px-2">
          <button
            type="button"
            data-preview-close
            aria-label={translateNotificationRow(language, 'notifications.preview.close')}
            onClick={onClose}
            className={disc}
            style={discStyle}
          >
            {discFace(<GlyphSvg glyph={GLYPHS.x} size={13} />)}
          </button>
          {/* LA POIGNÉE — la zone qu'on tire vers le bas, et sa barre qui le dit sans mot. */}
          <div
            data-preview-grabber
            aria-hidden="true"
            className="grid h-11 flex-1 cursor-grab place-items-center"
            style={{ touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={() => {
              dragFrom.current = null;
              setDragY(0);
            }}
          >
            <span className="rounded-full" style={{ width: 40, height: 5, backgroundColor: 'var(--color-on-media-2)' }} />
          </div>
          <Link
            to="thread"
            params={{ conversation: conversationId }}
            aria-label={translateNotificationRow(language, 'notifications.preview.open')}
            className={disc}
            style={discStyle}
          >
            {discFace(<GlyphSvg glyph={MEDIA_GLYPHS.arrowsOutSimple} size={14} />)}
          </Link>
        </div>
        {/*
          LE CORPS — le fil y est monté tel quel. `--safe-top: 0px` : la
          feuille commence sous l'encoche, l'en-tête du fil n'a donc pas à la
          réserver (`pt-safe` en dérive). `tabIndex={-1}` : le focus y entre à
          l'ouverture sans ajouter d'arrêt de tabulation.
        */}
        <div
          ref={body}
          tabIndex={-1}
          className="relative min-h-0 flex-1 overflow-hidden outline-none sm:rounded-b-[22px]"
          style={
            {
              '--safe-top': '0px',
              borderTopLeftRadius: CORNER,
              borderTopRightRadius: CORNER,
              backgroundColor: 'var(--color-ios-surface)',
              boxShadow: '0 -12px 40px -12px var(--color-scrim)',
            } as CSSProperties
          }
        >
          {children}
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? sheet : createPortal(sheet, document.body);
}
