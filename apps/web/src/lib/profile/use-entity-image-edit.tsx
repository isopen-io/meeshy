import { lazy, Suspense, useState, type ChangeEvent, type ComponentType, type ReactNode } from 'react';

import type { EntityImageEditProps } from '@/components/entity-image-retouch';
import { needsServedPreview } from '@/lib/media/heif';

import type { EntityImageFormat } from './entity-image-format';

export type EntityImageEditor = ComponentType<EntityImageEditProps>;

/** La retouche de la capture, chargée au premier choix d'image — jamais avec l'écran. */
const CaptureRetouch: EntityImageEditor = lazy(() => import('@/components/entity-image-retouch'));

type Editing<F extends EntityImageFormat> = { readonly format: F; readonly file: File; readonly container: Element | null };

/**
 * **CHOISIR UNE IMAGE D'IDENTITÉ, PUIS LA RETOUCHER** (#17256) — le site
 * unique que « Montre-toi », le profil, la communauté et le groupe partagent :
 * le fichier choisi ouvre la retouche de la capture au format de la cible ;
 * seul ce qu'elle rend part (`deliver`), et Annuler ne rend rien.
 *
 * Un HEIC que ce navigateur ne décode pas (W9, #11315) ne peut pas se peindre
 * dans un canvas : il part tel quel, la passerelle le convertit.
 */
export function useEntityImageEdit<F extends EntityImageFormat>({
  deliver,
  editor = CaptureRetouch,
  undecodable = needsServedPreview,
}: {
  readonly deliver: (format: F, file: File) => void;
  readonly editor?: EntityImageEditor;
  readonly undecodable?: (file: File) => Promise<boolean>;
}): { readonly pick: (format: F, event: ChangeEvent<HTMLInputElement>) => void; readonly layer: ReactNode } {
  const [editing, setEditing] = useState<Editing<F> | null>(null);

  const pick = (format: F, event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) return;
    const container = input.closest('dialog');
    void undecodable(file).then((raw) => (raw ? deliver(format, file) : setEditing({ format, file, container })));
  };

  const Editor = editor;
  const layer =
    editing === null ? null : (
      <Suspense fallback={null}>
        <Editor
          file={editing.file}
          format={editing.format}
          container={editing.container}
          onDone={(file) => {
            setEditing(null);
            deliver(editing.format, file);
          }}
          onCancel={() => setEditing(null)}
        />
      </Suspense>
    );

  return { pick, layer };
}
