import type { CSSProperties } from 'react';

import { GLYPHES, type NomDeGlyphe } from './glyphes';

/**
 * Un glyphe du sprite du depot, INLINE.
 *
 * `aria-hidden` par defaut : un glyphe qui accompagne un libelle visible est
 * decoratif, et le nommer une seconde fois fait lire deux fois la meme chose
 * au lecteur d'ecran. Un glyphe SEUL (un bouton sans texte) doit recevoir un
 * `titre`, qui devient alors son nom accessible.
 */
export function Glyphe({
  nom,
  taille = 24,
  className,
  titre,
  style,
}: {
  nom: NomDeGlyphe;
  taille?: number;
  className?: string;
  titre?: string;
  style?: CSSProperties;
}) {
  const glyphe = GLYPHES[nom];
  return (
    <svg
      viewBox={glyphe.viewBox}
      width={taille}
      height={taille}
      fill="currentColor"
      className={className}
      style={style}
      role={titre ? 'img' : undefined}
      aria-hidden={titre ? undefined : true}
      aria-label={titre}
      dangerouslySetInnerHTML={{ __html: glyphe.corps }}
    />
  );
}
