import { useEffect, useRef } from 'react';

import { CommentThread } from '@/components/comment-thread';
import { Glyph } from '@/components/glyph';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { CLAIMS_GESTURE_ATTRIBUTE } from '@/lib/view/shortcut-scope';
import { usePublicationRoom } from '@/lib/view/use-publication-room';

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
  /* LA SALLE DE LA STORY, tant que son fil est ouvert (#7395) — un contact DM
     qui n'est pas ami peut lire le fil d'une story `FRIENDS`
     (`canUserConsumePost`), mais il n'est dans aucun salon de fil : sans la
     salle, aucun commentaire ne lui arrive en direct. */
  usePublicationRoom(postId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  /**
   * **LE FOCUS ENTRE DANS LA FEUILLE** — sans cela, la touche suivante irait
   * au plateau, qui navigue d'une story à l'autre.
   *
   * **LE RENDRE N'EST PAS DE SON RESSORT, ET C'EST MESURÉ** (revue #7112).
   * Une couche qui prend le focus le rend d'ordinaire en se démontant, en
   * mémorisant `document.activeElement` à son montage — écrit ainsi ici, le
   * témoin navigateur a rendu `BODY`. La raison est en AMONT : l'hôte rend le
   * rail `inert` quand la feuille s'ouvre (D-90), et un sous-arbre inerte
   * ÉJECTE le focus qu'il contient. Le bouton était donc déjà flouté avant
   * que cet effet ne tourne : la feuille ne peut pas savoir d'où l'on vient.
   *
   * C'est l'HÔTE qui mémorise, parce que c'est lui qui détruit
   * (`routes/story.tsx`, `returnFocusRef`).
   */
  useEffect(() => {
    panneau.current?.focus();
  }, []);

  return (
    <div
      data-story-comments-sheet={postId}
      role="dialog"
      /**
       * **PAS D'`aria-modal` : CETTE FEUILLE N'EST PAS UNE MODALE, ET ELLE NE
       * DOIT PAS EN ÊTRE UNE** (revue #7112).
       *
       * `aria-modal="true"` ANNONCE une modale ; il n'en fait pas une — c'est
       * mot pour mot la raison écrite dans `components/sheet.tsx:11-19`, et le
       * dépôt a déjà payé ce défaut (la tabulation continuait DERRIÈRE la
       * feuille, `auth-screens.test.tsx:142`). Le posé ici était donc une
       * DÉCLARATION que rien n'appliquait : la croix du lecteur restait
       * atteignable au clavier (mesuré au navigateur — `focus()` puis
       * `activeElement`) pendant que l'attribut ordonnait au lecteur d'écran
       * de faire comme si elle n'existait pas.
       *
       * Et la modalité serait le MAUVAIS produit : iOS garde délibérément
       * l'arrière-plan interactif sous son overlay de commentaires — « user
       * can still tap React / Reply / mute while comments are visible »,
       * `StoryViewerView+Canvas.swift:1640-1645`. La feuille est donc un
       * dialogue NON MODAL, ce que `role="dialog"` seul dit exactement.
       */
      aria-label={translate(language, 'comments.title')}
      ref={panneau}
      tabIndex={-1}
      /* Le plateau navigue au `pointerdown`/`pointerup` : la feuille RÉCLAME
         le geste, sinon un tap dans la liste ferait avancer la story
         derrière. L'attribut le DÉCLARE à l'hôte — qui est le seul à savoir
         ce que son geste fait — et `stopPropagation` reste la seconde
         barrière ; la déclaration seule survit à une couche voisine posée un
         jour sans le gestionnaire (`lib/view/shortcut-scope.ts`, #7112). */
      {...{ [CLAIMS_GESTURE_ATTRIBUTE]: '' }}
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
