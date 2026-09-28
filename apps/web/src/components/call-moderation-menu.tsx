import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import { CallButton } from '@/components/call-glass-button';
import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import type { CallModeration } from '@/lib/calls/call-moderation';
import type { CallMember } from '@/lib/calls/call-store';
import { translateCallControls as t } from '@/lib/i18n-call-controls-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LE MENU DE MODÉRATION D'UN PARTICIPANT** (#8438) — posé sur sa tuile (vue
 * de groupe) et sur sa ligne de la liste des participants, pour qui MODÈRE
 * l'appel seulement (`useCallModeration`) : les autres ne le voient jamais.
 *
 * « Couper le micro » part aussitôt (la tuile se coupe, le moteur défait si la
 * passerelle refuse) ; « Retirer de l'appel » demande d'abord confirmation,
 * dans une alerte modale. Échap ferme ce qui est ouvert et rend le focus au
 * bouton qui l'a ouvert ; les flèches parcourent le menu.
 *
 * Le menu et l'alerte se posent à la racine de l'écran d'appel (portail) : un verre
 * (`backdrop-filter`) ou une liste qui défile les couperaient sinon.
 */

const MENU_HEIGHT = 112;

/** L'écran d'appel (une modale) quand il est là : ce qui en sort resterait hors de sa portée pour un lecteur d'écran. */
const layer = (): HTMLElement => document.querySelector<HTMLElement>('[data-call-screen]') ?? document.body;

/** Sous le bouton, aligné sur son bord ; au-dessus quand la place manque en bas. */
function menuPlacement(trigger: HTMLElement | null | undefined, align: 'left' | 'right'): CSSProperties {
  if (trigger === null || trigger === undefined || typeof window === 'undefined') return { top: 0, right: 0 };
  const rect = trigger.getBoundingClientRect();
  const side = align === 'right' ? { right: Math.max(8, window.innerWidth - rect.right) } : { left: Math.max(8, rect.left) };
  return rect.bottom + MENU_HEIGHT + 8 > window.innerHeight ? { ...side, bottom: window.innerHeight - rect.top + 4 } : { ...side, top: rect.bottom + 4 };
}

const ITEM = 'flex min-h-11 w-full items-center gap-3 rounded-[14px] px-3 text-left text-body font-semibold transition-colors hover:bg-white/10 focus-visible:bg-white/15 motion-reduce:transition-none';

export function CallModerationMenu({
  member,
  language,
  moderation,
  prominent = false,
  align = 'right',
}: {
  readonly member: CallMember;
  readonly language: InterfaceLanguage;
  readonly moderation: CallModeration;
  readonly prominent?: boolean;
  readonly align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [placement, setPlacement] = useState<CSSProperties>({});
  const menuId = useId();
  const titleId = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = () => anchor.current?.querySelector<HTMLElement>('[data-call-moderate]');

  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);
  useEffect(() => {
    if (confirming) dialog.current?.querySelector<HTMLElement>('[data-call-remove-cancel]')?.focus();
  }, [confirming]);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchor.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const close = () => {
    setOpen(false);
    setConfirming(false);
    trigger()?.focus();
  };
  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };

  return (
    <div ref={anchor} className="relative" data-call-moderation={member.userId}>
      <CallButton
        label={t(language, 'callControls.moderate.menu', { name: member.name })}
        glyph={<GlyphSvg glyph={CALL_VIEW_GLYPHS.dotsThree} size={20} />}
        onPress={() => {
          setPlacement(menuPlacement(trigger(), align));
          setOpen((value) => !value);
        }}
        tone="glass"
        prominent={prominent}
        size={44}
        expanded={open}
        controls={menuId}
        data={{ 'data-call-moderate': member.userId }}
      />
      {open && typeof document !== 'undefined' ? createPortal(
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={t(language, 'callControls.moderate.menu', { name: member.name })}
          onKeyDown={onMenuKey}
          className="glass-call-prominent fixed z-[225] flex w-56 flex-col gap-0.5 rounded-[20px] p-1.5 text-white"
          style={placement}
          data-call-moderation-menu={member.userId}
        >
          {member.micMuted ? (
            <div role="menuitem" aria-disabled="true" tabIndex={-1} className={`${ITEM} opacity-60`}>
              <GlyphSvg glyph={CALL_SCREEN_GLYPHS.microphoneSlash} size={20} />
              {t(language, 'callControls.mute.done')}
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              className={ITEM}
              onClick={() => {
                moderation.mute(member.userId);
                close();
              }}
              data-call-mute={member.userId}
            >
              <GlyphSvg glyph={CALL_SCREEN_GLYPHS.microphoneSlash} size={20} />
              {t(language, 'callControls.mute')}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className={ITEM}
            style={{ color: '#fca5a5' }}
            onClick={() => {
              setOpen(false);
              setConfirming(true);
            }}
            aria-haspopup="dialog"
            data-call-remove={member.userId}
          >
            <GlyphSvg glyph={CALL_VIEW_GLYPHS.userMinus} size={20} />
            {t(language, 'callControls.remove')}
          </button>
        </div>,
        layer(),
      ) : null}
      {confirming && typeof document !== 'undefined' ? createPortal(
        <div className="fixed inset-0 z-[230] grid place-items-center p-4" data-call-remove-confirm={member.userId}>
          <button type="button" aria-label={t(language, 'callControls.cancel')} tabIndex={-1} onClick={close} className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)' }} />
          <div
            ref={dialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.stopPropagation();
              close();
            }}
            className="glass-call-prominent relative flex w-full max-w-sm flex-col gap-3 rounded-[28px] p-5 text-white"
          >
            <h2 id={titleId} className="text-body font-semibold">
              {t(language, 'callControls.remove.confirm', { name: member.name })}
            </h2>
            <p className="text-mini" style={{ color: 'rgba(255,255,255,0.78)' }}>
              {t(language, 'callControls.remove.detail', { name: member.name })}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="min-h-11 rounded-full px-4 text-body font-semibold" style={{ background: 'rgba(255,255,255,0.14)' }} data-call-remove-cancel="">
                {t(language, 'callControls.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  moderation.remove(member.userId);
                  close();
                }}
                className="min-h-11 rounded-full px-4 text-body font-semibold"
                style={{ background: 'var(--ios-error-strong)' }}
                data-call-remove-confirm-do=""
              >
                {t(language, 'callControls.remove.do')}
              </button>
            </div>
          </div>
        </div>,
        layer(),
      ) : null}
    </div>
  );
}
