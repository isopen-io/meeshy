import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { Glyph } from './glyph';

/**
 * L'ÉTAT DESSINÉ D'UN MÉDIA ABSENT (#7022) — SITE UNIQUE des TROIS surfaces :
 * story, post et message.
 *
 * IL EXISTAIT, ET UNE SEULE FOIS. `story-parts.tsx` le portait pour le seul
 * lecteur de story, avec son libellé français écrit en dur ; le post et le
 * message n'avaient rien. Une référence morte y laissait un trou, ou l'icône
 * de lien brisé du navigateur. Le porteur a tranché : « ceci doit être résolu
 * correctement pour les story, postes ET messages ».
 *
 * POURQUOI PAS UN `return null`. Un composant qui se retire laisse une boîte
 * de zéro hauteur au milieu d'une carte : la légende remonte, la grille se
 * referme, et l'utilisateur lit une panne de mise en page là où il n'y a
 * qu'un fichier manquant. L'état dessiné OCCUPE la place du média — c'est ce
 * qui garde entier le post, la story ou le message autour de lui.
 *
 * POURQUOI PAS UN `<img src="">` NON PLUS. Le navigateur y peint son icône de
 * lien brisé ET redemande le DOCUMENT COURANT — une requête pour rien, sur
 * chaque média manquant. Mesuré au premier jet du lecteur de story (§ A de la
 * revue #6801).
 *
 * SILENCIEUX, PAS MUET. Aucune alerte et aucun « réessayer » : les octets ont
 * disparu (8 fichiers sur 2912, mesurés le 2026-09-18 dans le conteneur qui
 * les sert), et un bouton qui rejouerait le 404 serait un contrôle sans effet
 * — la loi 4. Mais la boîte porte `role="img"` et son libellé traduit : un
 * lecteur d'écran doit savoir qu'il manque quelque chose (dimension 5), dans
 * la langue de l'interface (dimension 9).
 *
 * LA LANGUE EST UN PARAMÈTRE, jamais lue ici. `currentInterfaceLanguage()` est
 * un état de module : le composant serait alors impossible à rendre dans deux
 * langues au même instant, ce que fait exactement son témoin.
 */
export function MediaUnavailable({
  language,
  tone = 'over-media',
  compact = false,
}: {
  readonly language: InterfaceLanguage;
  /**
   * LE FOND SUR LEQUEL IL SE POSE, et c'est une différence de LISIBILITÉ, pas
   * de goût :
   * - `over-media` — par-dessus une scène sombre (story plein écran, page de
   *   carrousel) : blanc voilé, le seul contraste tenable sur un fond dont on
   *   ne sait rien ;
   * - `on-card` — dans une carte du fil ou une bulle de message : les jetons
   *   du thème, qui suivent le clair et le sombre.
   */
  readonly tone?: 'over-media' | 'on-card';
  /**
   * LES SURFACES ÉTROITES — la vignette d'une story citée (44 px), une case de
   * pellicule. Le libellé y déborderait ; l'ANNONCE reste, parce qu'elle est
   * portée par la boîte et non par le texte.
   */
  readonly compact?: boolean;
}) {
  const label = translate(language, 'media.unavailable');
  const ink = tone === 'over-media' ? 'rgba(255,255,255,0.75)' : 'var(--color-ios-ink-3)';

  return (
    /* `data-media-unavailable` PORTE le ton servi — c'est l'ancre des gates
       navigateur, et elle dit CE QUI EST plutôt que comment c'est peint. Le
       dépôt a déjà payé le prix inverse : un gate qui comptait les enfants de
       `.avatar-root` serait passé au ROUGE en annonçant « présence absente »
       le jour où un anneau de story s'y ajoute (revue #5935). */
    <div
      data-media-unavailable={tone}
      role="img"
      aria-label={label}
      className={compact ? 'grid size-full place-items-center' : 'grid size-full place-items-center gap-2 px-8 text-center'}
      style={tone === 'on-card' ? { backgroundColor: 'var(--color-ios-card)' } : undefined}
    >
      <Glyph name="image" size={compact ? 18 : 38} style={{ color: ink }} aria-hidden />
      {compact ? null : (
        <p className="text-body" style={{ color: ink }} aria-hidden>
          {label}
        </p>
      )}
    </div>
  );
}
