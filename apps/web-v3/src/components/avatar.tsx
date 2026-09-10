import { PRESENCE_HEX, presenceTone } from '@meeshy/shared/utils/user-presence';

import type { UserPresenceStatus } from '@/lib/api/types';

/**
 * L'AVATAR, avec sa geometrie derivee — les memes formules que
 * `MeeshyAvatar.swift:165-186` :
 *
 *   anneau      = taille + 6        police initiales = taille x 0.38
 *   pastille    = taille x 0.26     epaisseur anneau = taille <= 32 ? 1.5 : 2.5
 *
 * La PASTILLE DE PRESENCE se pose a 45 degres SUR LE BORD du cercle, pas dans
 * le coin de sa boite : `centre + rayon x cos(pi/4)`, soit 85,36 % du diametre.
 * Posee en `bottom-0 right-0`, elle mordrait le vide du coin — l'ecart se voit
 * a l'oeil des la taille 52.
 *
 * Et `hors-ligne` ne rend AUCUNE pastille : c'est une regle produit du depot
 * (« offline = pas de pastille sur les avatars »), pas un oubli.
 */
/**
 * Les couleurs de présence viennent de `@meeshy/shared` (`PRESENCE_HEX`), qui
 * les déclare identiques sur les trois plateformes. Les recopier en variables
 * CSS locales aurait fait une quatrième table — celle qui dérive en silence.
 */

export function Avatar({
  initials,
  color,
  size,
  presence,
  name,
  opacity,
}: {
  initials: string;
  /** L'accent de la conversation — jamais une couleur codée en dur ici. */
  color: string;
  size: number;
  presence?: UserPresenceStatus;
  name?: string;
  /**
   * Le fondu de SOURDINE, appliqué ICI plutôt qu'en enveloppant l'avatar
   * d'un `<span>` de plus (#5559 défauts 1/8) : c'est le CHROME de la rangée
   * qui se fond — jamais le titre ni l'aperçu, dont l'opacité composée avec
   * `MUTED_OPACITY` (0.55) faisait tomber le contraste sous le plancher AA
   * dans les deux schémas (mesuré 3,74:1 / 2,80:1). Défaut `1`.
   */
  opacity?: number;
}) {
  const dot = size * 0.26;
  // 0.8536 = (1 + cos(pi/4)) / 2 — le point a 45 deg sur le cercle, en fraction
  // du diametre. On retranche la moitie de la pastille pour la CENTRER dessus.
  const offset = size * 0.8536 - dot / 2;
  const showsDot = presence !== undefined && presence !== 'offline';

  return (
    /* `block` — et ce n'est pas décoratif : un `<span>` reste INLINE, et un
       élément inline non remplacé IGNORE `width`/`height`. Dans un parent
       flex l'avatar était blockifié par le flex lui-même, donc juste ; dans
       un parent qui ne l'est pas (le bouton d'en-tête du Fil), il retombait
       sur la taille de son TEXTE — 22×25 px mesurés pour une cible demandée à
       44, sous le plancher tactile. `block` est sans effet partout ailleurs
       (un élément de flex est déjà blockifié), et rend la géométrie DÉRIVÉE
       vraie dans tous les contextes. */
    <span className="avatar-root relative block shrink-0" style={{ width: size, height: size, opacity: opacity ?? 1 }}>
      <span
        className="grid size-full place-items-center rounded-chip font-semibold text-ios-surface"
        style={{
          background: `linear-gradient(135deg, ${color}, color-mix(in oklch, ${color} 68%, white))`,
          fontSize: size * 0.38,
        }}
        aria-hidden={name === undefined}
        aria-label={name}
        role={name === undefined ? undefined : 'img'}
      >
        {initials}
      </span>
      {showsDot ? (
        /* `data-presence` — L'ANCRE de la pastille (revue #5935). Les gates
           navigateur la comptaient par le NOMBRE d'enfants de `.avatar-root`
           (« 2 = dégradé + pastille ») : l'anneau de story et le badge
           d'humeur annoncés par D-32 §4 en auraient fait 3 ou 4, et le gate
           serait passé au ROUGE en disant « présence absente » — un témoin
           qui ment sur la cause est pire qu'un témoin absent. L'attribut PORTE
           en plus l'ÉTAT servi (`online`/`away`/`idle`), donc « point VERT »
           se mesure vraiment plutôt que « un enfant de plus ». */
        <span
          data-presence={presence}
          className="absolute rounded-chip"
          style={{
            width: dot,
            height: dot,
            left: offset,
            top: offset,
            backgroundColor: PRESENCE_HEX[presenceTone(presence)],
            boxShadow: '0 0 0 2px var(--ios-surface)',
          }}
          aria-hidden
        />
      ) : null}
    </span>
  );
}
