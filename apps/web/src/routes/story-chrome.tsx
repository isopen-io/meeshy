import type { CSSProperties, ReactNode } from 'react';

import { GlyphSvg } from '@/components/glyph';
import { GLYPHS } from '@/components/glyphs';
import { ViewerBottomBar, ViewerTopBar, type ViewerIdentityModel } from '@/components/viewer-chrome';
import { ViewerMenu } from '@/components/viewer-chrome-menu';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import type { StoryCaption } from './story-parts';

/**
 * **LE CHROME DU LECTEUR DE STORIES, COMPOSÉ DES PRIMITIVES COMMUNES** (#8879,
 * `docs/product/visionneuse-plein-ecran.md`) — extrait de `story.tsx`, qui
 * franchissait 1 000 lignes : « on extrait d'abord, on ajoute ensuite ».
 *
 * La barre haute (segments de progression, identité, menu « … », croix) et la
 * barre basse (légende, rail, « Répondre… ») ne dessinent plus rien ici : le
 * voile, le disque de verre, la cible de 44, la croix en fin de barre sont ceux
 * de la story, du réel, du média de conversation. **Ce qui reste propre à la
 * story** — la progression, l'avance au tiers de l'écran — vit dans
 * `story-parts.tsx` et `story.tsx` (divergence admise : une story se REGARDE).
 *
 * Les prises des gates (`data-story-header`, `data-story-author`,
 * `data-story-options`) voyagent en `probe` : le comportement mesuré ne bouge
 * pas avec le dessin.
 */

/** Quatre lignes au plus, comme la légende du fil — partagé par les DEUX
 * contenus du pied (`Post.content` et `PostMedia.caption`, #6944). */
const CLAMPED_CAPTION: CSSProperties = {
  color: 'var(--color-on-media)',
  display: '-webkit-box',
  WebkitLineClamp: 4,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

export function StoryTopBar({
  authorId,
  identity,
  progress,
  hidden,
  language,
  onClose,
  onSave,
  onOptionsOpenChange,
}: {
  /** `data-story-author` est la PRISE de mesure du gate de la Lentille : une comparaison d'identifiants, jamais de libellés. */
  readonly authorId: string;
  readonly identity: ViewerIdentityModel;
  /** Les segments de progression : posés AU-DESSUS de la ligne d'identité. */
  readonly progress: ReactNode;
  readonly hidden: boolean;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  /** « Enregistrer » du menu « … » — la sauvegarde du rail auteur, offerte à tout lecteur (#8823). */
  readonly onSave?: (() => void) | undefined;
  readonly onOptionsOpenChange?: ((open: boolean) => void) | undefined;
}) {
  return (
    <ViewerTopBar
      probe={{ 'data-story-header': '', 'data-story-author': authorId }}
      placement="overlay"
      hidden={hidden}
      above={progress}
      identity={identity}
      exit={{ kind: 'close', label: 'Fermer', onExit: onClose }}
      trailing={
        <ViewerMenu
          label={translate(language, 'feed.post.more_options')}
          probe={{ 'data-story-options': '' }}
          onOpenChange={onOptionsOpenChange}
          items={[{ key: 'save', label: translate(language, 'story.action.save'), glyph: <GlyphSvg glyph={GLYPHS.downloadSimple} size={18} />, onSelect: onSave }]}
        />
      }
    />
  );
}

export function StoryBottomBar({
  hidden,
  language,
  content,
  mediaCaption,
  showsCaption,
  rail,
  onReply,
}: {
  readonly hidden: boolean;
  readonly language: InterfaceLanguage;
  /** `Post.content` servi par le Prisme. */
  readonly content: StoryCaption | null;
  /** `PostMedia.caption`, contenu DISTINCT avec sa propre langue (#6944). */
  readonly mediaCaption: StoryCaption | null;
  /** Les légendes ne se posent que sur un MÉDIA : sur une story de texte, le texte EST la scène. */
  readonly showsCaption: boolean;
  readonly rail: ReactNode;
  /** Absent ⇒ aucune capsule (loi 4) : la story d'autrui l'offre, la sienne non. */
  readonly onReply?: (() => void) | undefined;
}) {
  const hasCaption = showsCaption && (content !== null || mediaCaption !== null);
  return (
    <ViewerBottomBar
      probe={{ 'data-viewer-footer': '' }}
      placement="overlay"
      /* Le voile ne tient que la LÉGENDE lisible : sans elle, le rail et la capsule sont du verre, et le fond de l'AUTEUR reste intact. */
      scrim={hasCaption ? 'soft' : 'none'}
      hidden={hidden}
      {...(hasCaption
        ? {
            caption: (
              <>
                {content === null ? null : (
                  <p className="text-body" style={CLAMPED_CAPTION} lang={content.language || undefined}>
                    {content.text}
                  </p>
                )}
                {/* Deux contenus, deux `lang=` : un lecteur d'écran qui prononcerait la seconde avec la voix de la première est le défaut du cycle 122 rendu audible. */}
                {mediaCaption === null ? null : (
                  <p data-story-media-caption className="text-body" style={CLAMPED_CAPTION} lang={mediaCaption.language || undefined}>
                    {mediaCaption.text}
                  </p>
                )}
              </>
            ),
          }
        : {})}
      {...(rail === null ? {} : { rail })}
      reply={{ label: translate(language, 'comments.placeholder'), onReply }}
    />
  );
}
