import { SCENE_READING_BLUR_PX } from '@/lib/view/scene-yields';

/**
 * LE VOILE D'UN RÉEL SOUS LA FEUILLE DE COMMENTAIRES (#11307, parité iOS) —
 * l'AFFICHE du réel, floutée, posée sur sa lecture mise en pause. Une image
 * FIXE : son flou se rastérise une fois, là où un `filter` sur le pager se
 * recalculait à chaque image de la vidéo.
 *
 * `cover` et une légère surélévation : un flou fait baver les bords vers le
 * transparent ; la page (`overflow: hidden`) rogne le débord. Sans affiche
 * (un son, un texte), le voile floute ce qui est DESSOUS — une image arrêtée,
 * donc calculée une fois elle aussi.
 */
export function ReelVeil({ src }: { readonly src: string | undefined }) {
  const blur = `blur(${SCENE_READING_BLUR_PX}px)`;
  return (
    <div
      data-reel-veil={src !== undefined ? 'poster' : 'backdrop'}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={
        src !== undefined
          ? { backgroundImage: `url("${src}")`, backgroundSize: 'cover', backgroundPosition: 'center', filter: blur, transform: 'scale(1.08)' }
          : { backdropFilter: blur, WebkitBackdropFilter: blur }
      }
    />
  );
}
