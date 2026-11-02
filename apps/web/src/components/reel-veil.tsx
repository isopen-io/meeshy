import { SCENE_READING_BLUR_PX } from '@/lib/view/scene-yields';

/** L'assombrissement d'un réel SANS affiche (un son, un texte). */
const REEL_VEIL_DIM = 0.55;

/**
 * LE VOILE D'UN RÉEL SOUS LA FEUILLE DE COMMENTAIRES (#11307, parité iOS) —
 * l'AFFICHE du réel, floutée, posée sur sa lecture mise en pause. Une image
 * FIXE : son flou se rastérise une fois, là où un `filter` sur le pager se
 * recalculait à chaque image de la vidéo.
 *
 * `cover` et une légère surélévation : un flou fait baver les bords vers le
 * transparent ; la page (`overflow: hidden`) rogne le débord. Sans affiche, le
 * voile ASSOMBRIT l'image arrêtée dessous : aucun `backdrop-filter`, réservé
 * au site du verre (`scripts/glass-site.test.ts`).
 */
export function ReelVeil({ src }: { readonly src: string | undefined }) {
  return (
    <div
      data-reel-veil={src !== undefined ? 'poster' : 'dim'}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={
        src !== undefined
          ? { backgroundImage: `url("${src}")`, backgroundSize: 'cover', backgroundPosition: 'center', filter: `blur(${SCENE_READING_BLUR_PX}px)`, transform: 'scale(1.08)' }
          : { backgroundColor: 'var(--color-media-backdrop)', opacity: REEL_VEIL_DIM }
      }
    />
  );
}
