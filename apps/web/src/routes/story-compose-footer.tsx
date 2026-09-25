import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { PublicationRefusal } from '@/lib/stories/publication-kind';
import type { StudioPlane } from '@/lib/stories/story-document';
import type { StudioDoor, StudioFailureKey, StudioPage } from '@/lib/stories/studio-page';
import { StudioAssetRow, StudioSoundPlaneToggle } from '@/routes/story-compose-parts';

/**
 * **LE PIED DU STUDIO** (#6900, extrait par la revue-correction de #7684) —
 * présentation pure : les médias de la page COURANTE et la ligne de message.
 * `story-compose.tsx` dépassait mille lignes ; l'orchestration y reste, le
 * rendu du pied vit ici.
 */

const VISUAL_DOORS = ['visual', 'overlay'] as const;

const REFUSAL_KEY: Readonly<Record<PublicationRefusal, 'story.studio.refusal.reel'>> = {
  'reel-without-qualifying-media': 'story.studio.refusal.reel',
};

/** La raison d'un format refusé, dans la langue de l'interface — UNE raison
 * par refus (#7684), jamais le libellé du réel pour tout. */
export const publicationRefusalText = (lang: InterfaceLanguage, refusal: PublicationRefusal): string => translate(lang, REFUSAL_KEY[refusal]);

export type StudioPlaceRefusalNotice = { readonly door: StudioDoor; readonly reason: 'door' | 'media-max' };

/** Les médias de la page COURANTE — une ligne par porte occupée. */
export function StudioPageAssets({
  lang,
  page,
  onRetry,
  onRemove,
  onCaption,
  onSoundPlane,
}: {
  readonly lang: InterfaceLanguage;
  readonly page: StudioPage;
  readonly onRetry: (door: StudioDoor) => void;
  readonly onRemove: (door: StudioDoor) => void;
  readonly onCaption: (door: 'visual' | 'overlay', value: string) => void;
  readonly onSoundPlane: (plane: StudioPlane) => void;
}) {
  if (page.background === null && page.overlay === null && page.sound === null) return null;
  return (
    <ul className="flex flex-col gap-1">
      {VISUAL_DOORS.map((door) => {
        const asset = door === 'visual' ? page.background : page.overlay;
        if (asset === null) return null;
        return (
          <StudioAssetRow
            key={door}
            lang={lang}
            glyph={door === 'visual' ? 'image' : 'layer'}
            label={translate(lang, door === 'visual' ? 'story.studio.background.label' : 'story.studio.overlay.label')}
            removeLabel={translate(lang, door === 'visual' ? 'story.studio.background.remove' : 'story.studio.overlay.remove')}
            upload={asset.upload}
            onRetry={asset.file !== undefined ? () => onRetry(door) : undefined}
            onRemove={() => onRemove(door)}
            caption={{ value: asset.caption, inputId: `story-studio-caption-${door}`, onChange: (value) => onCaption(door, value) }}
          />
        );
      })}
      {page.sound !== null ? (
        <StudioAssetRow
          lang={lang}
          glyph="microphone"
          label={translate(lang, 'story.studio.sound.label')}
          removeLabel={translate(lang, 'story.studio.sound.remove')}
          upload={page.sound.upload}
          onRetry={page.sound.file !== undefined ? () => onRetry('sound') : undefined}
          onRemove={() => onRemove('sound')}
        >
          <StudioSoundPlaneToggle lang={lang} plane={page.sound.plane} onChange={onSoundPlane} />
        </StudioAssetRow>
      ) : null}
    </ul>
  );
}

/** **L'ÉCHEC D'UN ENVOI** — UN seul état, jamais deux à tenir d'accord :
 * `published === 0` ⇒ rien n'est parti (« La story n'a pas pu être
 * publiée. ») ; sinon une panne EN COURS DE SÉQUENCE (#7707, canal `scene`) —
 * les pages parties le sont, l'écran le dit (« k sur N publiées ») plutôt que
 * de taire ce qui a réussi. */
export type StudioPublishFailureNotice = { readonly failure: StudioFailureKey; readonly published: number; readonly total: number };

/** LE MESSAGE du pied (aide, refus, échec) a sa PROPRE ligne, pleine largeur :
 * partagée avec la pastille et la capsule Publier, elle ne gardait que
 * quelques pixels à 320 px. */
export function StudioFooterMessage({
  lang,
  placeRefusal,
  kindRefusal,
  publishFailure,
}: {
  readonly lang: InterfaceLanguage;
  readonly placeRefusal: StudioPlaceRefusalNotice | null;
  readonly kindRefusal: PublicationRefusal | null;
  readonly publishFailure: StudioPublishFailureNotice | null;
}) {
  return (
    <div className="text-caption">
      {placeRefusal !== null ? (
        <p role="alert" data-place-refusal={placeRefusal.reason} style={{ color: 'var(--color-error)' }}>
          {placeRefusal.reason === 'media-max'
            ? translate(lang, 'story.studio.refusal.media-max')
            : translate(lang, placeRefusal.door === 'sound' ? 'story.studio.refusal.door.sound' : 'story.studio.refusal.door.visual')}
        </p>
      ) : kindRefusal !== null ? (
        <p data-publish-refusal={kindRefusal} style={{ color: 'var(--color-ios-ink-2)' }}>
          {publicationRefusalText(lang, kindRefusal)}
        </p>
      ) : publishFailure !== null && publishFailure.published > 0 ? (
        <p
          role="alert"
          data-publish-outcome="partial"
          data-published={publishFailure.published}
          data-total={publishFailure.total}
          style={{ color: 'var(--color-error)' }}
        >
          {translate(lang, 'story.studio.outcome.partial', { published: String(publishFailure.published), total: String(publishFailure.total) })}{' '}
          {translate(lang, publishFailure.failure)}
        </p>
      ) : publishFailure !== null ? (
        <p role="alert" style={{ color: 'var(--color-error)' }}>
          {translate(lang, 'story.studio.error.publish')} {translate(lang, publishFailure.failure)}
        </p>
      ) : (
        <p style={{ color: 'var(--color-ios-ink-2)' }}>{translate(lang, 'story.studio.hint.duration')}</p>
      )}
    </div>
  );
}
