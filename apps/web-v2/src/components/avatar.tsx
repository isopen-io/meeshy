import type { CSSProperties } from 'react';

import '@/styles/avatar.css';

import { PRESENCE_HEX, presenceTone } from '@meeshy/shared/utils/user-presence';

import { attachmentSrc } from '@/lib/api/media-url';
import type { UserPresenceStatus } from '@/lib/api/types';
import { mediaImageCrossOrigin } from '@/lib/net/api-runtime-cache';
import type { AuthorStoryRing } from '@/lib/view/author-story-ring';
import { railRingBox, railStroke } from '@/components/rail-tile';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { Link } from '@/routes/route-table';

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
  src,
  profileUsername,
  storyRing,
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
  /**
   * **LE PSEUDO DE LA PERSONNE, QUAND SON AVATAR DOIT OUVRIR SON PROFIL**
   * (#6396, directive porteur 2026-09-20).
   *
   * La CAPACITÉ vit ici, la DÉCISION reste à l'hôte — même contrat que
   * `onGesture` sur la carte du fil. Deux raisons mesurées : certains hôtes
   * sont DÉJÀ des `<Link>` ou des `<button>` (`lens-row.tsx:271`,
   * `communities-parts.tsx:428`), et un lien imbriqué dans un lien est
   * invalide ; et l'avatar d'une COMMUNAUTÉ (`communities-parts.tsx:187`)
   * n'est pas un utilisateur.
   *
   * Une chaîne VIDE ne fabrique aucun lien : elle produirait `/u/`, une
   * adresse qui n'existe pas — donc un lien qui ment (loi 4).
   */
  profileUsername?: string;
  /**
   * **L'ANNEAU DE STORY, QUAND SON AUTEUR EN A UNE** (#7185, directive porteur
   * du 2026-09-20).
   *
   * Il est peint dans la couleur de l'UTILISATEUR (`color`, déjà l'accent que
   * `authorAccentColor` dérive de son identifiant), jamais dans celle de la
   * marque — c'est ce qui distingue cet anneau des trois du rail, qui posent
   * `--color-ios-brand` en dur. **D-93 l'autorise ici et l'interdirait sur un
   * texte** : cet accent descend sous AA (4,22:1 mesuré en sombre), et
   * l'article réserve justement l'accent à « là où il ne porte aucun texte — le
   * dégradé de bannière et l'avatar ».
   *
   * La géométrie n'est pas réinventée : `railRingBox` et `railStroke`
   * (`components/rail-tile.tsx`) sont le site unique, miroir de
   * `MeeshyAvatar.swift:165-175` — trait doublé pour une story non vue,
   * plancher d'un pixel.
   *
   * **UN ANNEAU IMPLIQUE UNE DESTINATION.** Quand il est là, l'avatar ouvre la
   * STORY ; sinon il ouvre le profil (`profileUsername`). Un avatar ne peut pas
   * mener à deux endroits, et c'est l'ordre d'iOS comme des applications que
   * nos lecteurs connaissent : l'anneau prime, parce qu'il est VISIBLE et qu'il
   * annonce ce qu'il ouvre.
   */
  storyRing?: AuthorStoryRing;
  /**
   * UN VRAI PORTRAIT (#5893) — `PostMedia.author.avatar`/`Viewer.avatar` :
   * une RÉFÉRENCE DE MÉDIA telle que la passerelle la sert, jamais posée pour
   * un groupe (D-1 étend `MeeshyAvatar.swift`, qui peint la photo AU-DESSUS du
   * dégradé d'initiales quand elle existe).
   *
   * RÉSOLUE ICI, POINT DE PASSAGE UNIQUE (#6388) — `User.avatar`,
   * `Participant.avatar` et `Community.avatar` portent la CLÉ de stockage
   * (`2026/09/<id>/photo.png`, #4324), et quelques lignes gardent encore
   * l'adresse héritée d'avant la migration 013
   * (`https://gate.meeshy.me/2026/09/…`, sans route de flux). Aucune des deux
   * ne charge posée telle quelle : la première se résout contre le CHEMIN du
   * document, la seconde contre la RACINE de la passerelle
   * (`net::ERR_FAILED`, puis `workbox … no-response` — mesuré sur
   * `staging.meeshy.me/notifications` le 2026-09-13). Dix appelants passent un
   * `src` venu de la passerelle ; leur demander de se souvenir de la règle,
   * c'est la voir oubliée au onzième — le legacy a tranché pareil
   * (`AvatarImage`, `apps/web/components/ui/avatar.tsx`). `attachmentSrc` est
   * IDEMPOTENTE : un appelant qui résout déjà (`card-model.ts`) ne double
   * rien, et un aperçu local (`blob:`) traverse intact.
   *
   * SANS ÉTAT LOCAL, DÉLIBÉRÉMENT (revue-correction #5893) — `Avatar` est
   * appelé comme une fonction PURE par au moins un témoin du dépôt
   * (`living-summary.test.tsx#expand`, qui rejoue l'arbre React sans
   * dispatcher de hooks pour retrouver un `onClick` réel sans bibliothèque
   * de DOM) : un `useState` y lève « Invalid hook call ». Le repli sur les
   * initiales se fait donc en manipulant le DOM DIRECTEMENT au `onError`
   * (`e.currentTarget.style.display = 'none'`) plutôt qu'en re-rendant — le
   * dégradé et les initiales restent TOUJOURS montés, juste RECOUVERTS par
   * la photo tant qu'elle charge, et redécouverts si elle échoue.
   */
  src?: string;
}) {
  const showsImage = src !== undefined && src !== '';
  const resolvedSrc = showsImage ? attachmentSrc(src) : undefined;
  const dot = size * 0.26;
  // 0.8536 = (1 + cos(pi/4)) / 2 — le point a 45 deg sur le cercle, en fraction
  // du diametre. On retranche la moitie de la pastille pour la CENTRER dessus.
  const offset = size * 0.8536 - dot / 2;
  const showsDot = presence !== undefined && presence !== 'offline';

  const corps = (
    /* `block` — et ce n'est pas décoratif : un `<span>` reste INLINE, et un
       élément inline non remplacé IGNORE `width`/`height`. Dans un parent
       flex l'avatar était blockifié par le flex lui-même, donc juste ; dans
       un parent qui ne l'est pas (le bouton d'en-tête du Fil), il retombait
       sur la taille de son TEXTE — 22×25 px mesurés pour une cible demandée à
       44, sous le plancher tactile. `block` est sans effet partout ailleurs
       (un élément de flex est déjà blockifié), et rend la géométrie DÉRIVÉE
       vraie dans tous les contextes. */
    <span className="avatar-root relative block shrink-0" style={{ width: size, height: size, opacity: opacity ?? 1 }}>
      {/* LE DÉGRADÉ D'INITIALES — TOUJOURS MONTÉ (voir le doc-comment de
          `src` ci-dessus) : c'est ce que la photo RECOUVRE tant qu'elle
          charge, et ce que l'échec de la photo RÉVÈLE en s'effaçant. */}
      <span
        className="grid size-full place-items-center rounded-chip font-semibold text-ios-surface"
        style={{
          background: `linear-gradient(135deg, ${color}, color-mix(in oklch, ${color} 68%, white))`,
          fontSize: size * 0.38,
        }}
        aria-hidden={name === undefined || showsImage}
        aria-label={showsImage ? undefined : name}
        role={name === undefined || showsImage ? undefined : 'img'}
      >
        {initials}
      </span>
      {showsImage ? (
        /* `decoding` et `crossOrigin` — LES DEUX BOUTS DE #6973.
           `decoding="async"` : c'était la SEULE `<img>` du dépôt sans lui
           (`media-grid.tsx`, `reel-page.tsx`, `notification-row.tsx` et
           `communities-parts.tsx` le posent tous), et une liste qui monte des
           dizaines de portraits décodait donc sur le fil principal, pendant le
           geste.
           `crossOrigin` : la passerelle rend déjà `Access-Control-Allow-Origin`
           sur sa route de flux, mais l'en-tête est INERTE tant que la requête
           part en `no-cors` — la réponse est alors OPAQUE, et le seau `medias`
           la garde trente jours sans pouvoir la distinguer d'une page d'erreur.
           `mediaImageCrossOrigin` ne la pose QUE sur la route de flux : un CDN
           tiers ou le magasin statique (que `attachmentSrc` laisse passer
           inchangés, par décision) ÉCHOUERAIT en mode `cors` sans en-tête, et
           l'avatar serait retombé sur ses initiales en silence. */
        <img
          src={resolvedSrc}
          alt={name ?? ''}
          loading="lazy"
          decoding="async"
          crossOrigin={mediaImageCrossOrigin(resolvedSrc)}
          className="absolute inset-0 size-full rounded-chip object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      ) : null}
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
      {storyRing === undefined ? null : (
        /* `data-story-ring` porte l'ÉTAT servi (`unseen`/`seen`), comme
           `data-presence` porte le sien : un gate qui compterait les enfants de
           `.avatar-root` mentirait sur la cause (revue #5935). */
        <span
          data-story-ring={storyRing.unseen ? 'unseen' : 'seen'}
          className="pointer-events-none absolute rounded-chip"
          style={{
            inset: -(railRingBox(size) - size) / 2,
            boxShadow: `inset 0 0 0 ${railStroke(size, storyRing.unseen)}px ${
              storyRing.unseen ? color : `color-mix(in srgb, ${color} 40%, transparent)`
            }`,
          }}
          aria-hidden
        />
      )}
    </span>
  );

  /* L'ANNEAU PRIME SUR LE PROFIL (#7185) — un avatar ne peut pas mener à deux
     endroits, et l'anneau est ce que le lecteur VOIT : il annonce ce qu'il
     ouvre. Même ordre que sur iOS et que les applications que nos lecteurs
     connaissent.

     DEUX `<Link>` PLUTÔT QU'UN PARAMÉTRÉ, et c'est le typage du routeur qui
     l'impose : `to` et `params` y sont CORRÉLÉS, si bien qu'une union
     `{ post } | { username }` ne satisfait aucune des deux routes. Le forcer
     par un cast aurait rendu une adresse fausse indétectable. */
  const sizeVar = { '--avatar-size': `${size}px` } as CSSProperties;
  const nomme = (cle: 'a11y.avatar.story' | 'a11y.avatar.profile'): string =>
    translate(currentInterfaceLanguage(), cle, { name: name ?? profileUsername ?? '' });

  if (storyRing !== undefined) {
    return (
      <Link
        to="story"
        params={{ post: storyRing.entryStoryId }}
        className="avatar-profile-link"
        style={sizeVar}
        aria-label={nomme('a11y.avatar.story')}
      >
        {corps}
      </Link>
    );
  }

  if (profileUsername === undefined || profileUsername.length === 0) return corps;

  /* LE LIEN SE NOMME, ET IL NOMME CE QU'IL OUVRE : un lien dont le seul contenu
     est une image décorative est annoncé « lien » et rien d'autre —
     l'utilisateur entend une destination sans savoir laquelle. Et « voir le
     profil » sur un avatar qui ouvre une story serait pire que muet : faux. */
  return (
    <Link
      to="userProfile"
      params={{ username: profileUsername }}
      className="avatar-profile-link"
      style={sizeVar}
      aria-label={nomme('a11y.avatar.profile')}
    >
      {corps}
    </Link>
  );
}
