import type { CSSProperties } from 'react';

import { Glyph } from '@/components/glyph';
import { feedMediaKindOf } from '@/lib/feed/layout';

/**
 * LES PIÈCES PURES DU LECTEUR DE STORY (#6801) — extraites de `story.tsx`,
 * qui est un `export default` monolithique et n'était donc montable par aucun
 * témoin : les témoins de story portent tous sur des lois pures
 * (`lib/stories/{caption,gesture,playback}.ts`) ou sur des pièces exportées
 * (`stories-i18n.test.tsx`). Sans cette extraction, la couche média du
 * lecteur ne pouvait être gardée par rien.
 *
 * Le FOND arrive CALCULÉ (`CSSProperties`), jamais la chaîne brute : cela
 * laisse `sceneBackground` et son `HEX_COLOR` chez `story.tsx`, où la
 * validation de `storyEffects.background` est une garde de sécurité (#5817,
 * dimension 1) qui n'a pas à voyager.
 */

/** Le média d'une story dont la source est INEXPLOITABLE (absente, ou dont le
 * téléchargement a échoué) — un état DESSINÉ, jamais un `<img src="">` : le
 * navigateur y peint son icône de lien brisé sur fond noir et redemande le
 * document courant au passage. Mesuré sur `story-image-light.png` du premier
 * jet (§ A de la revue). */
export function MediaUnavailable() {
  return (
    <div className="grid gap-2 justify-items-center px-8 text-center">
      <Glyph name="image" size={38} style={{ color: 'rgba(255,255,255,0.7)' }} />
      <p className="text-body" style={{ color: 'rgba(255,255,255,0.75)' }}>
        Média indisponible
      </p>
    </div>
  );
}

export type StoryCaption = {
  readonly text: string;
  readonly language: string;
};

export type StoryMediaLayerProps = {
  /** `key` de l'élément : une story qui change REMONTE son média, jamais une
   * réutilisation silencieuse d'un élément déjà lié à une autre source. */
  readonly storyId: string;
  readonly mediaSrc: string;
  /** `StoryTrayMedia.mimeType` — SERVI et DÉCLARÉ depuis toujours, mais que le
   * lecteur ne regardait jamais (#6801). Absent ⇒ image : la passerelle sert
   * l'absence en `null`, et retomber sur le repli rendrait illisibles les
   * stories qui marchaient. */
  /* `| undefined` EXPLICITE — `exactOptionalPropertyTypes: true` distingue
     « absente » de « présente à `undefined` », et l'hôte passe
     `media?.mimeType`, dont le type EST `string | undefined`. Sans ce membre,
     `tsc` refuse l'appel (TS2375) : le `?` seul n'autorise que l'ABSENCE. */
  readonly mimeType?: string | null | undefined;
  readonly showsMedia: boolean;
  /** La story PORTE un média (même inexploitable) — départage « le
   * téléchargement a échoué » de « c'est une story de texte ». */
  readonly hasMedia: boolean;
  readonly background: CSSProperties;
  /** Le texte SERVI PAR LE PRISME (`resolveStoryCaption`), ou `null`. */
  readonly caption: StoryCaption | null;
  readonly onReady: () => void;
  readonly onFailed: () => void;
  /** LA DURÉE DU MÉDIA, en millisecondes, dès que le décodeur la connaît
   * (#6836) — le seul chemin par lequel elle peut atteindre `slideDurationMs`.
   *
   * `StoryTrayMedia` n'en sert AUCUNE (`lib/api/stories.ts` : id, url,
   * thumbnailUrl, mimeType), et la passerelle n'a pas de champ pour ça. La
   * durée ne peut donc venir que de l'élément lui-même. Sans ce relais, la loi
   * de durée reste juste, testée par 38 témoins, et APPELÉE PAR PERSONNE. */
  readonly onDurationKnown?: ((durationMs: number) => void) | undefined;
};

/**
 * LA COUCHE MÉDIA DE LA SCÈNE — l'image, la vidéo, ou le repli dessiné.
 */
export function StoryMediaLayer({
  storyId,
  mediaSrc,
  mimeType,
  showsMedia,
  hasMedia,
  background,
  caption,
  onReady,
  onFailed,
  onDurationKnown,
}: StoryMediaLayerProps) {
  if (showsMedia) {
    /* `feedMediaKindOf` — LA LOI DÉJÀ PARTAGÉE par le fil
       (`lib/feed/layout.ts:43`), jamais un second test de préfixe MIME : deux
       lois qui classent des médias divergent au premier format ajouté. Elle
       accepte `string | null | undefined` et rend `'other'` sans lever. */
    if (feedMediaKindOf(mimeType) === 'video') {
      return (
        <video
          key={storyId}
          src={mediaSrc}
          /* MUETTE ET EN LIGNE, comme iOS : une story s'ouvre sans demander la
             permission de faire du bruit, et `muted` est la CONDITION que les
             navigateurs mobiles posent à la lecture automatique. Sans
             `playsInline`, Safari iOS la passerait en plein écran natif
             PAR-DESSUS le lecteur, emportant la progression et les gestes. */
          muted
          playsInline
          autoPlay
          /* EN BOUCLE (#6836) — `slideDurationMs` donne à la diapositive une
             durée en cycles ENTIERS du média ; `loop` est ce qui rend ces
             cycles réels. Sans lui, un clip plus court que la diapositive
             atteint `ended` et GÈLE sur sa dernière trame pendant que la barre
             poursuit : mesuré sur `/story/st-video`, 3 s de gel sur 6. */
          loop
          className="absolute inset-0 size-full object-cover"
          /* `onLoadedData`, pas `onLoad` : sur un élément média, `load` ne se
             déclenche pas comme sur une image — attendre le mauvais évènement
             laisserait la progression de la story bloquée à zéro. */
          onLoadedData={onReady}
          /* `onLoadedMetadata`, PAS `onLoadedData` (#6836) : les métadonnées —
             dont `duration` — arrivent AVANT la première trame décodable. Les
             attendre sur `loadedData` ferait démarrer la diapositive sur le
             plancher, puis changerait sa durée en cours de route ; la barre
             sauterait en arrière au premier tour d'horloge.

             AUCUNE VALIDATION ICI, et c'est délibéré : `duration` vaut `NaN`
             tant que le décodeur n'a rien et `Infinity` sur un flux, mais
             `slideDurationMs` rabat déjà toute durée absurde sur le plancher —
             quatre vecteurs le gardent (`playback.test.ts`). Filtrer une
             seconde fois ici ferait DEUX sites à tenir d'accord sur ce qu'est
             une durée utile, pour la seule économie d'un état React que
             `Object.is` dédoublonne de toute façon. */
          onLoadedMetadata={(event) => onDurationKnown?.(event.currentTarget.duration * 1000)}
          onError={onFailed}
        />
      );
    }

    return (
      <img
        key={storyId}
        src={mediaSrc}
        alt=""
        className="absolute inset-0 size-full object-cover"
        onLoad={onReady}
        onError={onFailed}
      />
    );
  }

  return (
    <div className="absolute inset-0 grid place-items-center px-8" style={background}>
      {hasMedia ? (
        <MediaUnavailable />
      ) : caption !== null ? (
        <p
          className="text-center text-title font-semibold"
          style={{ fontSize: 28, lineHeight: 1.3 }}
          lang={caption.language || undefined}
        >
          {caption.text}
        </p>
      ) : null}
    </div>
  );
}
