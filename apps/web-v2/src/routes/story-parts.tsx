import type { CSSProperties } from 'react';

import { GlyphSvg } from '@/components/glyph';
import { MEDIA_TRANSPORT_GLYPHS } from '@/components/glyphs-media-transport';
import { MediaUnavailable } from '@/components/media-unavailable';
import { isMediaAbsent, noteMediaAbsent } from '@/lib/api/media-absent';
import { feedMediaKindOf } from '@/lib/feed/layout';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

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

/**
 * L'ÉTAT DESSINÉ A DÉMÉNAGÉ (#7022) — `components/media-unavailable.tsx`.
 *
 * Il vivait ici, et la story était la SEULE des trois surfaces à en avoir un :
 * le post et le message n'avaient rien. Le porteur a tranché que les trois
 * doivent dégrader proprement ; un état dessiné par surface aurait fait trois
 * jumelles, dont deux à écrire — et son libellé était ici en dur, donc français
 * pour les sept langues. Le ré-export garde l'ancien nom joignable, sans
 * seconde définition.
 */
export { MediaUnavailable } from '@/components/media-unavailable';

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
  /**
   * LA MÉMOIRE DE L'ÉCHEC, ET NON SEULEMENT SON ÉTAT (#7022). `showsMedia`
   * arrive de `story.tsx`, où il dérive de `mediaFailed` — un état qui se
   * remet à `false` à chaque changement de story (`story.tsx:426`). Rouvrir la
   * même story, ou y revenir d'un retour en arrière dans le carrousel, rejoue
   * donc la requête morte et son 404. Le registre, lui, est à l'échelle de la
   * session : une source qu'on SAIT absente ne se redemande jamais.
   *
   * Le `&&` est dans ce sens-là parce que les deux savoirs sont DISJOINTS :
   * l'hôte sait ce que cette story-ci vient de faire, le registre sait ce que
   * TOUTES les surfaces ont appris. Aucun ne subsume l'autre.
   */

  /**
   * L'ÉCHEC S'ÉCRIT AUX DEUX ENDROITS. Le registre porte la mémoire longue ;
   * `onFailed` reste appelé parce qu'il fait DEUX choses de plus chez l'hôte —
   * marquer la diapositive prête (sans quoi la progression resterait bloquée à
   * zéro et la story ne tournerait jamais) et basculer sa propre vue.
   * Enregistrer sans prévenir l'hôte figerait le carrousel sur une story morte.
   */
  const échec = (): void => {
    noteMediaAbsent(mediaSrc);
    onFailed();
  };

  if (showsMedia && !isMediaAbsent(mediaSrc)) {
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
          /* **ET AU MONTAGE, parce que l'évènement peut être DÉJÀ PASSÉ** (#6866).
             Avec une source `data:` ou un cache chaud, le décodeur a fini avant
             que Preact n'attache le gestionnaire : `loadedmetadata` ne tire
             jamais, la durée n'atteint pas `slideDurationMs`, et la diapositive
             coupe son clip.

             Mesuré sur cinq ouvertures indépendantes de `/story/st-video-long` :
             quatre à 34 % de barre à 3 s (9 s, juste), une à 50 % — soit
             3000/6000 au centième, le dénominateur de la CONSTANTE — avec
             pourtant `readyState === 4` et `duration === 9` au montage. La
             donnée était là ; personne ne l'avait lue.

             Une valeur déjà disponible se LIT, une valeur à venir s'ÉCOUTE : les
             deux chemins alimentent la même loi, et aucun ne suffit seul.
             L'asymétrie du filtre est voulue — ici `duration` vaut `NaN` tant
             que rien n'est décodé, donc on ne remonte que ce qui est utile ;
             au-dessus, l'évènement ne tire QUE lorsque la donnée existe. */
          ref={(el) => {
            if (el === null || onDurationKnown === undefined) return;
            const seconds = el.duration;
            if (Number.isFinite(seconds) && seconds > 0) onDurationKnown(seconds * 1000);
          }}
          onError={échec}
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
        onError={échec}
      />
    );
  }

  return (
    <div className="absolute inset-0 grid place-items-center px-8" style={background}>
      {hasMedia ? (
        /* `over-media` — la scène d'une story est sombre par construction
           (fond calculé, image plein cadre) : les jetons du thème y
           disparaîtraient en clair comme en sombre. */
        <MediaUnavailable language={currentInterfaceLanguage()} />
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

export type SoundToggleProps = {
  readonly muted: boolean;
  readonly onToggle: () => void;
};

/**
 * `SoundToggle` (T10, #6899) — LE BOUTON MUET du son d'une scène v3, miroir de
 * `StoryViewerView+Sidebar.swift:486-509` (icône
 * `speaker.slash.fill`/`speaker.wave.2.fill`). Le rail droit iOS est HORS
 * TRANCHE (#5817) : ce bouton vit dans la LIGNE AUTEUR du lecteur, et son hôte
 * ne le monte QUE quand il a un son à couper (`sceneHasControllableSound`,
 * `lib/canvas/background-sound.ts`) — jamais un décor sans effet (loi 4).
 *
 * C'est un bouton BASCULE : un libellé CONSTANT (« Muet ») et `aria-pressed`
 * portent l'état. Un libellé qui change avec l'état (« Son » / « Muet ») lu à
 * côté de `aria-pressed="false"` s'annonce « Son, non enfoncé » — l'inverse de
 * ce qui se passe.
 */
export function SoundToggle({ muted, onToggle }: SoundToggleProps) {
  const language = currentInterfaceLanguage();
  return (
    <button
      type="button"
      data-story-sound-toggle
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onToggle}
      aria-pressed={muted}
      aria-label={translate(language, 'story.sound.off')}
      className="pointer-events-auto grid shrink-0 place-items-center rounded-full"
      style={{ width: 44, height: 44, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.12)' }}
    >
      <GlyphSvg
        glyph={muted ? MEDIA_TRANSPORT_GLYPHS.speakerSlash : MEDIA_TRANSPORT_GLYPHS.speakerHigh}
        size={16}
        style={{ color: '#fff' }}
      />
    </button>
  );
}
