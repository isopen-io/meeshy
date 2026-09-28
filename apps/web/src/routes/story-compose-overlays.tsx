import { lazy, Suspense, useEffect, useRef } from 'react';

import { Sheet } from '@/components/sheet';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasDocument } from '@/lib/canvas/document';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

const ScenePlayer = lazy(() => import('@/components/scene-player'));

/**
 * **LES DEUX COUCHES DU COMPOSER QUI S'OUVRENT À LA DEMANDE** (#8413) —
 * chargées avec ce fichier, jamais avec le chunk du studio : un auteur qui ne
 * touche ni ⋯ › Aperçu ni le texte du post ne les télécharge pas.
 */

/**
 * **L'APERÇU — voir la scène COMME ELLE SERA LUE** (`⋯ › Aperçu`, miroir
 * `MeeshyComposerHost.preview`). Le MÊME moteur (`ScenePlayer`, loi 6 : « le
 * player est l'aperçu ») en mode `story`, sur le document que Publier
 * enverra, sans aucun contrôle du plateau par-dessus. Échap, le retour
 * matériel et ✕ ferment (`Sheet`).
 */
export function StudioPreviewSheet({
  lang,
  document,
  carrier,
  preferredLanguages,
  muted,
  onClose,
}: {
  readonly lang: InterfaceLanguage;
  readonly document: CanvasDocument;
  readonly carrier: SceneCarrier;
  readonly preferredLanguages: readonly string[];
  readonly muted: boolean;
  readonly onClose: () => void;
}) {
  return (
    <Sheet title={translate(lang, 'story.studio.preview')} bodyAs="div" onClose={onClose}>
      <div data-story-studio-preview className="grid min-h-0 flex-1 place-items-center px-4 pb-4" style={{ containerType: 'size' }}>
        <div
          className="relative overflow-hidden rounded-[22px]"
          style={{ width: 'min(100cqw, 100cqh * 9 / 16)', height: 'min(100cqh, 100cqw * 16 / 9)', containerType: 'inline-size' }}
        >
          <Suspense fallback={null}>
            <ScenePlayer document={document} sceneIndex={0} mode="story" playing carrier={carrier} preferredLanguages={preferredLanguages} muted={muted} />
          </Suspense>
        </div>
      </div>
    </Sheet>
  );
}


/**
 * **LE TEXTE DU POST** (#8413) — `Post.content`, le corps de la publication :
 * distinct du texte posé sur la scène et de la légende d'un média. Écrire
 * applique sur-le-champ (le brouillon est persisté à chaque changement) ;
 * « Terminé » ne fait que fermer, comme Échap.
 *
 * **UN CADRE DE VERRE QUI MONTE DU BAS** (lot 7, directive porteur
 * 2026-09-28, miroir `ComposerSceneDescriptionEditor.swift`) — le même verre
 * que les légendes et le socle, posé à la place de la rangée du socle, sur la
 * scène : jamais une feuille opaque qui coupe l'écran. L'entrée glisse du bas
 * (coupée par `prefers-reduced-motion`).
 */
export function StudioPostTextFrame({
  lang,
  value,
  onChange,
  onClose,
}: {
  readonly lang: InterfaceLanguage;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onClose: () => void;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const label = translate(lang, 'story.studio.postText');

  useEffect(() => {
    fieldRef.current?.focus();
    const frame = frameRef.current;
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (frame === null || still || typeof frame.animate !== 'function') return;
    frame.animate(
      [
        { transform: 'translateY(24px)', opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 240, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' },
    );
  }, []);

  return (
    <div
      ref={frameRef}
      data-story-post-text-frame
      role="group"
      aria-label={label}
      className="glass flex items-end gap-2 rounded-[22px] px-3 py-2.5"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onClose();
      }}
    >
      <textarea
        ref={fieldRef}
        id="story-studio-post-text"
        aria-label={label}
        value={value}
        rows={3}
        placeholder={translate(lang, 'story.studio.postText.placeholder')}
        onInput={(event) => onChange(event.currentTarget.value)}
        className="max-h-[40dvh] min-h-11 flex-1 resize-none bg-transparent py-2 text-body outline-none"
        style={{ color: 'var(--color-ios-ink)' }}
      />
      <button
        type="button"
        data-story-post-text-done
        aria-label={translate(lang, 'story.studio.postText.done')}
        onClick={onClose}
        className="grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ backgroundColor: '#fff', color: '#111', outlineColor: 'var(--color-ios-brand)' }}
      >
        <svg aria-hidden="true" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </button>
    </div>
  );
}
