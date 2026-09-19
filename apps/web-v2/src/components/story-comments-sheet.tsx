import { useEffect, useRef } from 'react';

import { CommentThread } from '@/components/comment-thread';
import { Glyph } from '@/components/glyph';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * **LE FIL DE COMMENTAIRES D'UNE STORY**, posé en feuille au-dessus de la
 * scène — miroir de l'overlay `showCommentsOverlay` du lecteur iOS
 * (`StoryViewerView+Sidebar.swift`, `loadStoryComments`) : la LISTE et UNE
 * seule zone de saisie (spécification porteur du 2026-05-28).
 *
 * **LE FIL EST CELUI DE LA PUBLICATION** — `CommentThread`, la même surface
 * que `/post/$post`, sur le même cache : un commentaire posé depuis une story
 * apparaît dans le détail de la publication sans relecture. Une story EST une
 * publication éphémère ; lui écrire un second fil aurait fait diverger les
 * deux au premier ajustement.
 *
 * **LA LECTURE EST EN PAUSE TANT QUE LA FEUILLE EST OUVERTE** — c'est l'hôte
 * qui la pose (`onOpenChange`), parce que lui seul tient l'horloge ; sans
 * cela la story avancerait sous le fil qu'on est en train de lire, et le
 * composeur changerait de publication à mi-phrase.
 *
 * **ÉCHAP ET LE RETOUR FERMENT LA FEUILLE, PAS LE LECTEUR.** Le lecteur écoute
 * déjà `Escape` pour se fermer (`routes/story.tsx`) : sans cette capture, une
 * seule touche fermerait les deux, et le texte en cours de frappe partirait
 * avec. La capture se fait en phase de CAPTURE, sur `document`, pour passer
 * AVANT l'écouteur du lecteur quel que soit l'ordre de montage.
 */
export type StoryCommentsSheetProps = {
  readonly postId: string;
  readonly onClose: () => void;
};

export function StoryCommentsSheet({ postId, onClose }: StoryCommentsSheetProps) {
  const language = currentInterfaceLanguage();
  const panneau = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  /* LE FOCUS ENTRE DANS LA FEUILLE — sans cela, la touche suivante irait au
     plateau, qui navigue d'une story à l'autre. */
  useEffect(() => {
    panneau.current?.focus();
  }, []);

  return (
    <div
      data-story-comments-sheet={postId}
      role="dialog"
      aria-modal="true"
      aria-label={translate(language, 'comments.title')}
      ref={panneau}
      tabIndex={-1}
      /* Le plateau navigue au `pointerdown`/`pointerup` : la feuille doit
         retenir les siens, sinon un tap dans la liste ferait avancer la
         story derrière (même remède que chaque bouton du rail). */
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden"
      style={{
        maxHeight: '68%',
        /* `--color-ios-surface`, et JAMAIS `--color-ios-bg` : ce second nom
           n'existe dans AUCUNE feuille (mesuré — `src/styles/ios.css` déclare
           `--color-ios-surface`, dérivé de `--ios-surface`). Une variable
           inexistante ne rougit nulle part : la feuille s'est peinte
           TRANSPARENTE, et son texte d'encre claire est tombé sur la photo
           de la story — illisible, capture à l'appui. Deux autres sites du
           dépôt portent la même faute (`components/derived-identity.tsx:125`
           et `:187`) : issue de suivi, hors tranche de ce lot. */
        background: 'var(--color-ios-surface)',
        /* Le lecteur force `colorScheme: 'dark'` sur sa racine
           (`routes/story.tsx`) pour que la scène soit peinte sur du noir ; la
           feuille est un ÉCRAN, pas une scène — elle reprend le schéma du
           document, comme `/post/$post` qui montre le même fil. */
        colorScheme: 'light dark',
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        zIndex: 3,
      }}
    >
      <div className="flex shrink-0 items-center justify-between px-3 pt-2 pb-1">
        <h2 className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {translate(language, 'comments.title')}
        </h2>
        <button
          type="button"
          data-story-comments-close
          onClick={onClose}
          aria-label={translate(language, 'comments.close')}
          className="grid place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ width: 44, height: 44, color: 'var(--color-ios-ink-2)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <Glyph name="x" size={16} />
        </button>
      </div>
      <CommentThread postId={postId} />
    </div>
  );
}
