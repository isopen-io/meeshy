import { lazy, Suspense } from 'react';

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
 * « Terminé » ne fait que fermer.
 */
export function StudioPostTextSheet({
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
  const label = translate(lang, 'story.studio.postText');
  return (
    <Sheet title={label} bodyAs="div" presentation="centered" onClose={onClose}>
      <div className="flex flex-col gap-3 px-4 pb-2">
        <textarea
          id="story-studio-post-text"
          aria-label={label}
          value={value}
          rows={6}
          placeholder={translate(lang, 'story.studio.postText.placeholder')}
          onInput={(event) => onChange(event.currentTarget.value)}
          className="w-full resize-none rounded-[14px] px-4 py-3 text-body outline-none"
          style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)' }}
        />
        <button
          type="button"
          data-story-post-text-done
          onClick={onClose}
          className="self-end rounded-full px-5 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ minHeight: 44, backgroundColor: 'var(--color-ios-brand)', color: '#fff', outlineColor: 'var(--color-ios-brand)' }}
        >
          {translate(lang, 'story.studio.postText.done')}
        </button>
      </div>
    </Sheet>
  );
}
