import { useEffect, useRef, type CSSProperties } from 'react';

import { Glyph } from '@/components/glyph';
import { MediaUnavailable } from '@/components/media-unavailable';
import { isMediaAbsent, noteMediaAbsent } from '@/lib/api/media-absent';
import { feedMediaKindOf } from '@/lib/feed/layout';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { StoryPlaybackGroup } from '@/lib/stories/playback';

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

/**
 * `MediaError.NETWORK` (2) et `MediaError.SRC_NOT_SUPPORTED` (4) — les seuls
 * codes qui disent que le FICHIER, pas le décodeur, est en cause (#7022
 * suivi). `ABORTED` (1) et `DECODE` (3) ne prouvent rien sur son existence —
 * voir `échecVidéo` ci-dessous.
 */
const NETWORK_OR_SOURCE_ERROR: ReadonlySet<number> = new Set([2, 4]);

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

  /**
   * L'ÉCHEC D'UNE VIDÉO N'EST PAS TOUJOURS UNE ABSENCE (#7022 suivi — revue
   * adversariale 2026-09-18, défaut FRAGILE §2). `<img onError>` n'a qu'une
   * seule cause côté DOM ; `<video onError>` en a QUATRE, portées par
   * `MediaError.code`, et deux d'entre elles ne disent RIEN sur l'existence
   * du fichier :
   * - `NETWORK` (2) et `SRC_NOT_SUPPORTED` (4) — le FICHIER est en cause :
   *   le transfert a échoué, ou la source n'a jamais pu être identifiée ;
   * - `ABORTED` (1) et `DECODE` (3) — le DÉCODEUR est en cause : la lecture a
   *   été interrompue, ou ce navigateur ne sait pas lire ce codec (HEVC sous
   *   Chrome, par exemple). Les octets existent, et un autre navigateur ou un
   *   autre appareil les lit sans problème.
   * Graver l'absence sur 1/3 masquerait une story vivante pour toute la
   * session ; `onFailed()` reste appelé dans tous les cas — l'hôte avance sur
   * son carrousel, que le média revienne un jour ou non.
   */
  const échecVidéo = (event: { currentTarget: HTMLVideoElement }): void => {
    const code = event.currentTarget.error?.code;
    if (code !== undefined && NETWORK_OR_SOURCE_ERROR.has(code)) noteMediaAbsent(mediaSrc);
    onFailed();
  };

  const connueAbsente = showsMedia && isMediaAbsent(mediaSrc);

  /**
   * UNE SOURCE DÉJÀ CONNUE ABSENTE PRÉVIENT L'HÔTE (#7022 suivi — revue
   * adversariale 2026-09-19).
   *
   * Ne monter aucune `<img>` épargne la requête ; mais `onReady`/`onFailed`
   * sont les DEUX seuls signaux par lesquels `story.tsx` apprend que la
   * diapositive est jouable (`contentReady`, dont l'effet de progression
   * dépend). Ne rien monter, c'était ne plus rien dire : au DEUXIÈME passage
   * sur une story morte — exactement le moment où le registre sert à quelque
   * chose — la barre restait à 0 et le carrousel ne tournait plus. Le
   * doc-comment d'`échec()` nommait déjà ce risque pour le chemin `onError` ;
   * le chemin « déjà connue » l'avait rouvert.
   *
   * DANS UN EFFET, jamais pendant le rendu : prévenir l'hôte lui fait poser un
   * état, et le dépôt vient de payer une publication en cours de rendu
   * (`031964fe09`, le fil qui se vidait au défilement).
   *
   * L'APPEL EST DANS UNE RÉF parce que l'hôte le recompose à chaque rendu
   * (fermeture en ligne dans `story.tsx`) : le mettre en dépendance relancerait
   * l'effet sans fin. Les dépendances sont donc ce qui IDENTIFIE la
   * diapositive — la story et sa source.
   */
  const prévenir = useRef(onFailed);
  prévenir.current = onFailed;
  useEffect(() => {
    if (!connueAbsente) return;
    prévenir.current();
  }, [storyId, mediaSrc, connueAbsente]);

  if (showsMedia && !connueAbsente) {
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
          onError={échecVidéo}
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

/**
 * **LA CROIX DU LECTEUR** — extraite de `story.tsx` (#7112, revue) parce que
 * le fichier hôte franchissait 1 000 lignes : « on extrait d'abord, on ajoute
 * ensuite » (CLAUDE.md § budget), jamais un plafond relevé.
 *
 * Elle porte `pointer-events-auto` : son conteneur est un chrome en
 * `pointer-events-none`, et sans cela la croix ne se toucherait pas. C'est
 * cette ré-activation qui rendait la croix CLIQUABLE sous un chrome masqué,
 * jusqu'à ce que l'hôte pose `inert` sur la région (D-90) — la protection se
 * pose donc sur le PARENT, et ce bouton ne la connaît pas : il se tient seul,
 * comme `StoryViewerView+ActionButton.swift:11`.
 *
 * `onPointerDown` stoppé : le plateau navigue au `pointerdown`/`pointerup`,
 * et sans cette coupure fermer le lecteur ferait AUSSI avancer d'une story.
 */
export function CloseButton({ onClose }: { readonly onClose: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClose}
      aria-label="Fermer"
      className="pointer-events-auto grid shrink-0 place-items-center rounded-full"
      style={{ width: 44, height: 44, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.12)' }}
    >
      <Glyph name="x" size={16} style={{ color: '#fff' }} />
    </button>
  );
}

/**
 * `StoryProgressBarsView` (`StoryViewerView+Content.swift:3128-3177`) —
 * capsules de hauteur 3, `gap: 3`, piste blanc 20 % ; segments PASSÉS blanc
 * PLEIN, segment COURANT le dégradé `indigo500 → error → indigo400`. Le
 * premier jet peignait TOUS les segments en indigo de marque : sur le fond
 * par défaut d'une story texte — le gradient de marque, précisément — la
 * progression devenait invisible, et le passé ne se distinguait plus du
 * présent (mesuré sur `story-light.png`, deux barres grises identiques).
 *
 * **LA FRACTION NE PASSE PAS PAR L'ÉTAT** — `fillRef` reçoit un
 * `transform: scaleX()` écrit à même le DOM à chaque image. Poser la
 * progression en `useState` re-rendait l'écran ENTIER soixante fois par
 * seconde (l'image, l'en-tête, la légende, la scène), pour animer trois
 * pixels de haut ; iOS évite exactement cela (« évite de committer le
 * `@State` `progress` », granularité 1/300). `scaleX` plutôt que `width` :
 * la propriété n'apparaît dans AUCUN objet `style` rendu, donc aucun rendu
 * ne peut l'écraser, et l'animation reste sur le compositeur.
 */
export function ProgressBars({
  group,
  index,
  slideKey,
  barRef,
  fillRef,
}: {
  readonly group: StoryPlaybackGroup;
  readonly index: number;
  readonly slideKey: string;
  readonly barRef: { current: HTMLDivElement | null };
  readonly fillRef: { current: HTMLSpanElement | null };
}) {
  return (
    <div
      ref={barRef}
      role="progressbar"
      aria-label={`Story ${index + 1} sur ${group.stories.length}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      className="flex"
      style={{ gap: 3, height: 3 }}
    >
      {group.stories.map((story, i) => (
        <span
          key={story.id}
          aria-hidden="true"
          className="flex-1 overflow-hidden rounded-full"
          style={{ background: 'rgba(255,255,255,0.2)' }}
        >
          {i === index ? (
            <span
              key={slideKey}
              ref={fillRef}
              className="block size-full rounded-full"
              style={{
                transform: 'scaleX(0)',
                transformOrigin: 'left center',
                willChange: 'transform',
                background:
                  'linear-gradient(90deg, var(--color-ios-brand), var(--ios-error), var(--color-i400))',
              }}
            />
          ) : (
            <span className="block size-full rounded-full" style={{ background: i < index ? '#fff' : 'transparent' }} />
          )}
        </span>
      ))}
    </div>
  );
}
