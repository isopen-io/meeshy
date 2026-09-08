import type { Conversation } from '@/lib/api/types';
import type { ConversationFlags } from '@/lib/api/preferences';
import { served } from '@/lib/api/prism';
import { accentOf, withAccent } from '@/lib/accent';
import { time } from '@/lib/grouping';
import { MUTED_OPACITY } from '@/lib/lens/law';
import type { RowActionId } from '@/lib/view/row-actions';
import { initialsOf, isGroup, peerOf, previewKindOf, presenceOf, titleOf } from '@/lib/view/conversation';
import { Link } from '@/routes/route-table';

import { Avatar } from './avatar';
import { Glyph } from './glyph';
import { RowActions } from './row-actions';

/**
 * LA LIGNE DE LA LENTILLE — plate, et c'est tout le sujet.
 *
 * Elle remplace la peau CARTE, retirée avec elle : plus de fond, plus de
 * liséré, plus de rayon. iOS ne dessine pas des cartes dans la Lentille, il
 * dessine un FLUX ; et un flux qui se lit à la perspective ne peut pas être
 * découpé en boîtes, parce que les boîtes rendent visible ce que la
 * perspective déplace.
 *
 * LA COTE QUI GOUVERNE TOUT : la hauteur de MISE EN PAGE est 84, TOUJOURS.
 *
 * C'est le critère binaire du porteur — « le flux ne bouge jamais au
 * défilement, ou on garde les cartes ». La magnification n'agrandit donc pas la
 * ligne : elle révèle un contenu qui était DÉJÀ là, transparent. Le conteneur
 * visuel mesure 100 en permanence, débordant de 8 au-dessus et de 8 en dessous
 * de sa case de 84 ; au repos son supplément est à `opacity: 0`, donc invisible
 * et non cliquable.
 *
 * Ce que cela achète : AUCUNE propriété de mise en page n'est jamais animée.
 * Ni `height`, ni `margin`, ni `padding`. Seuls `transform` et `opacity`
 * bougent — les deux que le compositeur sait animer sans repasser par la mise
 * en page. Une ligne qui grandirait vraiment pousserait ses voisines, et la
 * liste entière se recalculerait à chaque image de défilement.
 *
 * L'alternative — animer la hauteur et laisser le flux s'ouvrir — a un nom :
 * c'est ce que fait une liste ordinaire, et c'est ce que les cartes rendaient
 * acceptable. Le porteur a tranché l'inverse.
 */

/** La case de mise en page. Elle ne change JAMAIS. */
export const ROW_HEIGHT = 84;

/** Le conteneur visuel, qui déborde de 8 de chaque côté. */
export const VISUAL_HEIGHT = 100;
const OVERHANG = (VISUAL_HEIGHT - ROW_HEIGHT) / 2;

export type RowState = {
  /** Élue par la bande de focus : elle montre son supplément. */
  readonly magnified: boolean;
  /** De la courbe de perspective — jamais calculée ici. */
  readonly alpha: number;
  readonly scale: number;
  /**
   * La RESPIRATION : les voisines immédiates de la magnifiée s'écartent de 8,
   * par translation. C'est ce qui donne à la magnifiée la place que sa case ne
   * lui donne pas — et c'est une translation, donc toujours pas de mise en page.
   */
  readonly breathing: number;
};

const AT_REST: RowState = { magnified: false, alpha: 1, scale: 1, breathing: 0 };

export function LensRow({
  conversation,
  languages,
  viewerId,
  status = AT_REST,
  flags,
  unreadCount,
  onRowAction,
}: {
  conversation: Conversation;
  languages: readonly string[];
  viewerId: string;
  status?: RowState;
  /** Flags EFFECTIFS (wire fusionné à l'override du store, `@/lib/conversation-store`). */
  flags: ConversationFlags;
  /** Compte non-lu EFFECTIF — `effectiveUnreadOf(conversation, overrides)`. */
  unreadCount: number;
  onRowAction: (id: RowActionId) => void;
}) {
  const unread = unreadCount > 0;
  /**
   * LE FONDU DE SOURDINE NE PORTE QUE SUR LE CHROME — #5559 défauts 1/8
   * (contraste). Il vivait sur le `<li>` ENTIER (`opacity: MUTED_OPACITY`) :
   * `MUTED_OPACITY` (0.55, dérivée de `LentilleMetrics.swift:303`, D-4) se
   * COMPOSE alors avec l'encre de TOUT ce que la rangée peint, titre et
   * aperçu compris — mesuré 3,74:1 (titre) et 2,80:1 (aperçu) en schéma
   * clair, 5,71:1 et 3,63:1 en schéma sombre : sous le plancher AA (4,5:1)
   * dans les deux cas, et l'aperçu EST le dernier message, jamais un
   * contenu décoratif. `MUTED_OPACITY` reste exacte (`check-curve.mjs` la
   * garde octet pour octet contre sa source Swift) — ce qui bouge est OÙ
   * elle s'applique : l'avatar, l'heure, les puces et le supplément portent
   * le fondu ; le titre et l'aperçu gardent leur encre PLEINE, au même
   * contraste que toute rangée non muette. `--color-ios-ink-2` plafonnait
   * lui-même à ~3,0:1 en schéma clair (dette de palette, #5625) — la
   * variante CLAIRE de `MeeshyColors.textSecondary` a été relevée au cran
   * minimal AA (`indigo700.opacity(0.8)`, méthode D-18), donc ce qui reste
   * PLEIN se lit désormais réellement au-dessus de 4,5:1 — vérifié par
   * `checkRowInkMeetsAA` dans `check-list-actions.mjs` (#5559
   * revue-correction, défaut 1 bis), pas seulement par l'opacité CSS. Une
   * sourdine reste une conversation qu'on LIT.
   */
  const chromeFade = flags.isMuted ? MUTED_OPACITY : 1;
  const group = isGroup(conversation);
  const title = titleOf(conversation, viewerId);
  const accent = accentOf(conversation);
  const at = conversation.lastMessageAt ?? conversation.lastMessage?.createdAt;

  /**
   * LA FORME DE L'APERÇU (D-23, #5676) — `previewKindOf` décide AVANT tout
   * appel du Prisme : un aperçu `hidden`/`view-once`/`expired` ne descend
   * JAMAIS `served()`, donc jamais `lastMessage.content` ni
   * `lastMessageTranslations` — le contenu protégé ne traverse pas la ligne
   * de liste (miroir `LastMessageSummaryKind.swift:22-36`).
   */
  const previewKind = previewKindOf(conversation);
  const showsServedPreview = previewKind === 'standard' || previewKind === 'ephemeral';
  const senderPrefix =
    group && conversation.lastMessage?.sender ? `${conversation.lastMessage.sender.displayName} : ` : '';

  /**
   * LA LIGNE DESCEND LA CARTE PRÉCALCULÉE PAR LE SERVEUR
   * (`lastMessageTranslations`), pas les traductions du message. C'est ce que
   * sert `GET /conversations`, déjà restreint aux langues du lecteur et tronqué
   * au plafond d'aperçu : lire `lastMessage.translations` ferait descendre une
   * carte que la liste n'a pas reçue, donc servir l'original en croyant servir
   * le Prisme.
   */
  const preview = showsServedPreview
    ? served({
        preferredLanguages: languages,
        originalLanguage: conversation.lastMessageOriginalLanguage,
        translations: conversation.lastMessageTranslations,
        original: conversation.lastMessage?.content ?? '',
      })
    : null;

  return (
    <li
      data-row={conversation.id}
      /**
       * `group` : ancre `RowActions` (second enfant, ci-dessous) pour
       * `group-hover`/`group-focus-within` — le bouton d'actions ne reste
       * visible SANS survol que sur la rangée magnifiée.
       */
      className="group"
      /**
       * `flexShrink: 0` n'est pas une précaution : la liste est un conteneur
       * flex, et un élément flex de hauteur fixe est COMPRIMÉ dès que la somme
       * dépasse la place. Mesuré sans lui : des cases de 31 px au lieu de 84 —
       * et comme la compression est uniforme, la perspective continuait de
       * s'appliquer, donc rien n'avait l'air cassé à l'œil. C'est le témoin de
       * mise en page qui l'a vu.
       *
       * Le fondu de sourdine ne vit PLUS ici (#5559 défauts 1/8 — voir
       * `chromeFade` ci-dessus) : il est descendu sur les éléments de CHROME
       * eux-mêmes (aucun d'eux n'est le `firstElementChild` que `useScene`
       * réécrit à CHAQUE image, `scene.ts:104-108` — ce sont tous des
       * PETITS-ENFANTS du `<li>`, jamais son premier enfant direct, donc rien
       * n'entre en conflit avec la passe de perspective).
       */
      style={{ height: ROW_HEIGHT, flexShrink: 0, position: 'relative' }}
    >
      <Link
        to="thread"
        params={{ conversation: conversation.id }}
        /*
         * `pr-12` (48px) et non `px-3` des deux côtés : `RowActions`
         * (frère ci-dessous, `position: absolute`, ancré `right-2` sur le
         * `<li>`) couvrait sinon l'heure/le badge de non-lus — mesuré à la
         * capture (#5559 revue). La cote se DÉDUIT du bouton : 8 (droite)
         * + 34 (dessin) + 5 (débord tactile de `tap-target-34`) = 47, donc 48
         * laisse un pixel de marge et le débord ne mord JAMAIS sur le badge,
         * dont il volerait le clic. La réserve est CONSTANTE plutôt que
         * conditionnée à `status.magnified` : le bouton se révèle aussi au
         * survol et au focus clavier d'une rangée NON magnifiée, et une
         * réserve qui apparaîtrait/disparaîtrait décalerait le texte sous le
         * pointeur — un mouvement que rien ne justifie ici.
         */
        className="lens-row absolute inset-x-0 flex items-center gap-3 pl-3 pr-12"
        style={withAccent(accent, {
          top: -OVERHANG,
          height: VISUAL_HEIGHT,
          /**
           * L'ORIGINE DE LA TRANSFORMATION est à 16 % de la largeur, sur
           * l'avatar — pas au centre. Une échelle centrée ferait glisser les
           * titres horizontalement au défilement ; ancrée sur l'avatar, la
           * colonne de texte reste alignée d'une ligne à l'autre.
           */
          transformOrigin: '16% 50%',
          transform: `translateY(${status.breathing}px) scale(${status.scale})`,
          opacity: status.alpha,
        })}
      >
        <Avatar
          initials={initialsOf(title)}
          color={accent}
          size={44}
          name={title}
          opacity={chromeFade}
          {...(group ? {} : { presence: presenceOf(peerOf(conversation, viewerId)) })}
        />

        <span className="flex min-w-0 flex-1 flex-col justify-center">
          {/*
            LE SUPPLÉMENT, premier volet : la catégorie et les étiquettes. Il est
            RENDU en permanence et masqué par l'opacité — le monter et le
            démonter ferait entrer et sortir des nœuds du document, donc une
            mise en page, donc exactement ce que la case de 84 protège.
            `aria-hidden` et `pointer-events` suivent l'opacité : un contenu
            invisible ne doit être ni lu ni cliquable.
          */}
          <span
            className="lens-extra flex items-center gap-1.5 overflow-hidden"
            aria-hidden={!status.magnified}
            style={{
              height: status.magnified ? 16 : 0,
              opacity: status.magnified ? chromeFade : 0,
              pointerEvents: status.magnified ? undefined : 'none',
            }}
          >
            <span
              className="rounded-chip px-1.5 text-check font-semibold whitespace-nowrap"
              style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--accent)' }}
            >
              {group ? 'Groupe' : 'Direct'}
            </span>
            {flags.isArchived ? (
              <Glyph name="archive" size={12} title="Archivée" style={{ color: 'var(--color-ios-ink-3)' }} />
            ) : null}
          </span>

          <span className="flex items-baseline gap-2">
            <span
              className={`min-w-0 flex-1 truncate text-title ${unread ? 'font-black' : 'font-bold'}`}
              style={{ color: 'var(--color-ios-ink)' }}
            >
              {title}
            </span>
            {/*
              L'ÉPINGLE SE VOIT SUR LA RANGÉE, toujours — pas seulement dans le
              supplément magnifié. iOS n'a pas besoin de ce glyphe : il range
              les épinglées dans une SECTION nommée « Épingles », qui porte
              l'information à elle seule (`ConversationListView.handleDrop`).
              La v3.1 a troqué les sections contre des chips de filtre (§1.5 de
              la spécification), et rien ne restait alors pour DIRE l'épinglage
              : « Épingler » une conversation déjà en tête ne changeait
              STRICTEMENT rien à l'écran — un contrôle dont l'effet n'est pas
              observable, ce que la charte compte comme inerte.

              `title` en fait aussi le nom accessible du glyphe (`Glyph`), donc
              un lecteur d'écran annonce l'épinglage que l'œil voit — la
              parité avec le libellé VoiceOver d'iOS
              (`ThemedConversationRow.swift:296-300`, qui annonce épinglage ET
              sourdine).
            */}
            {flags.isPinned ? (
              <Glyph name="pushPin" size={12} title="Épinglée" style={{ color: 'var(--color-ios-ink-3)', opacity: chromeFade }} />
            ) : null}
            {/* La sourdine, elle, ne prend PAS de glyphe : la peau Lentille la
                rend par le seul fondu du CHROME (`chromeFade`, ci-dessus —
                « pas de glyphe cloche sur le rang plat »). Une opacité n'est
                lisible que par l'œil — le lecteur d'écran, lui, a besoin du
                mot, et le texte hors écran est le seul porteur qui n'ajoute
                aucun pixel ; il n'a donc, lui, aucune raison de se fondre. */}
            {flags.isMuted ? <span className="sr-only">En sourdine</span> : null}
            <span
              className="shrink-0 text-check font-bold tabular-nums"
              style={{ color: unread ? 'var(--accent)' : 'var(--color-ios-ink-3)', opacity: chromeFade }}
            >
              {at === undefined ? '' : time(at)}
            </span>
          </span>

          {/*
            L'APERÇU. Au repos une ligne, magnifié deux — et c'est `line-clamp`
            qui change, pas la hauteur du conteneur : la deuxième ligne occupe
            une place déjà réservée par le conteneur visuel de 100.
          */}
          <span
            className={`flex items-center gap-1 text-body ${status.magnified ? 'line-clamp-2' : 'truncate'}`}
            style={{ color: previewKind === 'view-once' ? accent : 'var(--color-ios-ink-2)' }}
          >
            {/* LES APERÇUS PROTÉGÉS (D-23, #5676) : aucune langue à annoncer,
                aucun texte du message — mais le NOM de l'expéditeur reste,
                comme iOS le sert (`senderLabel` précède le glyphe dans
                `LentilleConversationRow.swift:600-624`) : un nom n'est pas le
                contenu protégé, et le retirer faisait perdre en groupe la
                seule information qui restait. Les glyphes suivent iOS un par
                un — `eye.slash` masqué, `flame` vue unique, `timer` éphémère
                actif, `timer` estompé pour l'expiré (`timer.badge.xmark`
                n'ayant pas d'équivalent phosphor, le muet de la couleur porte
                la nuance). */}
            {previewKind === 'hidden' ? (
              <>
                {senderPrefix}
                <Glyph name="eyeSlash" size={13} className="shrink-0" />
                <span className="italic truncate">1 message caché</span>
              </>
            ) : previewKind === 'view-once' ? (
              <>
                {senderPrefix}
                <Glyph name="flame" size={13} className="shrink-0" />
                <span className="italic truncate">1 message vue unique</span>
              </>
            ) : previewKind === 'expired' ? (
              <>
                <Glyph name="timer" size={13} className="shrink-0" />
                <span className="italic truncate">Message expiré</span>
              </>
            ) : (
              <>
                {senderPrefix}
                {previewKind === 'ephemeral' ? <Glyph name="timer" size={13} className="shrink-0" /> : null}
                {/* `lang` porte la langue SERVIE par le Prisme, pas celle du
                    document : un lecteur d'écran doit prononcer un aperçu traduit
                    avec la voix de sa langue, jamais avec celle de l'expéditeur.
                    L'attribut est OMIS quand la langue est inconnue (une
                    conversation sans historique sert un original vide, sans
                    `originalLanguage`) : `lang=""` signifie « langue indéterminée »
                    et fait quitter au lecteur d'écran la voix du document — dire
                    « je ne sais pas » est ici pire que se taire. */}
                <span {...(preview?.language ? { lang: preview.language } : {})}>{preview?.text ?? ''}</span>
              </>
            )}
          </span>

          {/* Le supplément, second volet : la date pleine et le compte de membres. */}
          <span
            className="lens-extra flex items-center gap-2 overflow-hidden text-check"
            aria-hidden={!status.magnified}
            style={{
              height: status.magnified ? 14 : 0,
              opacity: status.magnified ? chromeFade : 0,
              pointerEvents: status.magnified ? undefined : 'none',
              color: 'var(--color-ios-ink-3)',
            }}
          >
            <span>{at === undefined ? '' : new Date(at).toISOString().slice(0, 10)}</span>
            {group ? <span>· {conversation.memberCount} membres</span> : null}
          </span>
        </span>

        {unread ? (
          /* `data-unread` : le crochet STABLE que `check-list-actions.mjs`
             interroge pour prouver que « Lu »/« Non lu » a un effet — même
             parti que `data-row`, lu par `check-lens.mjs`. Compter sur la
             position de ce `<span>` dans le lien rendrait le témoin faux au
             premier remaniement de la rangée. */
          <span
            data-unread={unreadCount}
            className="grid min-w-[20px] shrink-0 place-items-center rounded-chip px-1.5 text-check font-bold text-white"
            style={{ backgroundColor: 'var(--accent)', height: 20, opacity: chromeFade }}
          >
            {unreadCount}
          </span>
        ) : null}
      </Link>

      <RowActions flags={flags} unread={unread} magnified={status.magnified} onAction={onRowAction} />
    </li>
  );
}
