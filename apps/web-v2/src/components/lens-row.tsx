import { memo } from 'react';

import type { Conversation } from '@/lib/api/types';
import type { ConversationFlags } from '@/lib/api/preferences';
import { served } from '@/lib/api/prism';
import { accentOf, withAccent } from '@/lib/accent';
import { MUTED_OPACITY } from '@/lib/lens/law';
import type { RowActionId } from '@/lib/view/row-actions';
import { initialsOf, isGroup, peerOf, previewKindOf, presenceOf, titleOf } from '@/lib/view/conversation';
import { kindOf } from '@/lib/view/message';
import { Link } from '@/routes/route-table';

import { Avatar } from './avatar';
import { Glyph } from './glyph';
import { LensTime } from './lens-time';
import { UnreadBadge } from './unread-badge';
import { RowActions } from './row-actions';
import { TypingDots } from './typing-dots';

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
/**
 * LE LIBELLÉ D'UN DERNIER MESSAGE SANS TEXTE (revue #5805) — les MOTS et les
 * GLYPHES d'iOS, un pour un : `AttachmentKind.shortLabel`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Models/AttachmentKind.swift:140-154`)
 * pour « Photo » / « Vidéo » / « Audio » / « Fichier ». `kindOf`
 * (`view/message.ts`) classe la pièce par son MIME — la MÊME fonction que le
 * fil, jamais un second classement.
 */
const MEDIA_PREVIEW = {
  image: { glyph: 'image', label: 'Photo' },
  video: { glyph: 'image', label: 'Vidéo' },
  audio: { glyph: 'microphone', label: 'Audio' },
  file: { glyph: 'file', label: 'Fichier' },
} as const;

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

export type LensRowProps = {
  conversation: Conversation;
  languages: readonly string[];
  viewerId: string;
  status?: RowState;
  /** Flags EFFECTIFS (wire fusionné à l'override du store, `@/lib/conversation-store`). */
  flags: ConversationFlags;
  /** Compte non-lu EFFECTIF — `effectiveUnreadOf(conversation, overrides)`. */
  unreadCount: number;
  /**
   * `(conversationId, id) => void` — jamais `(id) => void` fermé sur
   * `conversation` (#5694, cinquième point) : un callback RECRÉÉ à chaque
   * rendu de l'écran casserait `memo` en aval pour TOUTES les rangées, quel
   * que soit le soin mis à comparer le reste. `routes/conversations.tsx`
   * passe désormais une fonction MODULE-LEVEL, stable par construction —
   * cette rangée n'a plus besoin de fermer sur rien pour agir.
   */
  onRowAction: (conversationId: string, id: RowActionId) => void;
  /**
   * QUI ÉCRIT DANS CETTE CONVERSATION, MAINTENANT (#5793) — le nom du premier
   * frappeur vivant qui n'est pas le lecteur, distribué par l'écran
   * (`useTypistNames`, `lib/api/use-typists.ts`) : une rangée est rendue dans un
   * `.map`, elle ne peut pas s'abonner elle-même.
   *
   * `undefined` ⇒ personne n'écrit : la ligne 2 retombe sur sa précédence
   * normale, et rien n'est inventé. Deux effets, ceux d'iOS :
   *  - la ligne 2 devient « X écrit » (`Line2Kind.resolve`, `typing` en TÊTE de
   *    la précédence, `targets/lentille.md:502-511`) ;
   *  - la présence est FORCÉE en ligne, au niveau du RANG et jamais dans
   *    l'avatar (`LentilleConversationRow.swift:125-127`) — la frappe EST une
   *    preuve d'activité (`CLAUDE.md` § « User Presence » : « une personne qui
   *    écrit est TOUJOURS verte »).
   */
  typist?: string | undefined;
};

function LensRowImpl({
  conversation,
  languages,
  viewerId,
  status = AT_REST,
  flags,
  unreadCount,
  onRowAction,
  typist,
}: LensRowProps) {
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
  /**
   * SANS HISTORIQUE (#5780) — `previewKindOf` rend `standard` pour une
   * conversation qui n'a jamais reçu de message (`lastMessage` absent, `null`
   * comme `undefined` — #5650) : rien à protéger, mais rien à SERVIR non plus.
   * `served()` reçoit alors un original vide et aucune traduction, donc
   * `preview.text === ''` — sans ce cas, la ligne 2 se rendait comme un
   * `<span>` VIDE, pas comme un état. `lastMessageAt` reste servi
   * inconditionnellement par la passerelle (`schema.prisma:495`, sans `?`) :
   * l'heure de création s'affiche déjà (voir `at` ci-dessus) ; seul le texte
   * manquait un état à dire.
   */
  const hasNoHistory = conversation.lastMessage === undefined || conversation.lastMessage === null;
  /**
   * LA CLASSE DE TRONCATURE DE L'APERÇU — `truncate` au repos (une ligne,
   * point de suspension), `line-clamp-2` magnifié (deux lignes, point de
   * suspension). Les deux n'opèrent que sur un BLOC : voir le commentaire de
   * `data-line2` plus bas.
   */
  const previewText = status.magnified ? 'line-clamp-2' : 'truncate';
  const senderName = group ? conversation.lastMessage?.sender?.displayName : undefined;
  /**
   * Le nom de l'expéditeur reste HORS du nœud qui porte `lang` — le Prisme
   * n'a rien à dire du nom d'une personne — mais dans le MÊME flux de texte
   * que l'aperçu : c'est une seule phrase, qui se tronque d'un seul point de
   * suspension, comme le `Text` concaténé d'iOS.
   */
  const senderPrefix = senderName === undefined ? null : `${senderName} : `;

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

  /**
   * UN DERNIER MESSAGE SANS TEXTE — une photo, un vocal, un fichier (revue
   * #5805). `served()` rend alors une chaîne VIDE, et la ligne 2 se rendait
   * comme un `<span>` vide : la rangée « Médias » affichait « Kwame Mensah : »
   * suivi de RIEN (mesuré sur la coque Android, la liste étant l'écran phare).
   * Ce n'était pas visible avant ce lot — aucun corpus n'avait de message
   * média-seul en dernier.
   *
   * iOS compose exactement ce libellé quand l'aperçu est vide
   * (`LentilleConversationRow.standardPreview`,
   * `apps/ios/.../Lentille/Row/LentilleConversationRow.swift:635-676`) :
   * `senderLabel` + le glyphe de la pièce + son `shortLabel`
   * (`AttachmentKind.shortLabel` — « Photo », « Vidéo », « Audio »,
   * « Fichier ») + `+N` au-delà d'une pièce. Les mêmes mots, les mêmes
   * glyphes (déjà dans le socle : la liste ne paie rien de plus).
   *
   * Le COMPTE vient du tableau servi. La passerelle expose aussi
   * `lastMessageAttachmentCount` sur la charge d'aperçu socket
   * (`services/gateway/src/socketio/utils/lastMessagePreviewPrism.ts:228-263`,
   * qui ne remet QUE la première pièce) — à lire le jour où la liste vit sur
   * le réseau, sans quoi « +N » sous-comptera un message à plusieurs pièces.
   */
  const previewAttachments = conversation.lastMessage?.attachments ?? [];
  const previewMedia =
    preview !== null && preview.text === '' && previewAttachments.length > 0
      ? { first: previewAttachments[0]!, extra: previewAttachments.length - 1 }
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
        {/* LA FRAPPE FORCE LA PRÉSENCE EN LIGNE, au niveau du RANG et jamais
            dans l'avatar (`LentilleConversationRow.swift:125-127`) : une
            personne qui écrit est TOUJOURS verte (`CLAUDE.md` § « User
            Presence »), quel que soit ce que le serveur a servi — un
            `lastActiveAt` périmé de trois minutes ne peut pas contredire une
            frappe reçue à l'instant. Le forçage est LOCAL et ne fabrique aucune
            donnée : il ne vaut que tant que le magasin de frappe a une entrée
            vivante. */}
        <Avatar
          initials={initialsOf(title)}
          color={accent}
          size={44}
          name={title}
          opacity={chromeFade}
          {...(group ? {} : { presence: typist === undefined ? presenceOf(peerOf(conversation, viewerId)) : 'online' })}
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

          {/* `items-center`, PLUS `items-baseline` (#6080) : la ligne porte
              maintenant une capsule de 24 px de haut à côté d'un texte de 15 —
              alignées sur la LIGNE DE BASE, la capsule pendait sous le nom.
              iOS aligne son `HStack` au centre (`line1`, alignement par
              défaut). */}
          <span className="flex items-center gap-2">
            {/*
              LA HIÉRARCHIE TYPOGRAPHIQUE (#5694, écart 1) — `LentilleMetrics.
              Name.size` = `MeeshyFont.bodySize` (15), poids `.heavy` (800 CSS)
              CONSTANT : le poids ne dépend PAS du non-lu
              (`LentilleConversationRow.swift:283-367`, `Name.font` fixe) —
              c'est le badge de non-lus qui porte la nouvelle, jamais un
              nom plus ou moins gras. `text-bubble` (15px) et
              `font-extrabold` (800) sont des jetons DÉRIVÉS
              (`packages/design-tokens/ios.css`, `check:tokens`) et un poids
              STANDARD Tailwind — aucun littéral écrit ici (D-4). `data-name`
              est le crochet STABLE des gates (`check-curve.mjs`,
              `check-list-actions.mjs`), jamais une classe de taille appelée
              à changer (leçon 548).
            */}
            <span
              data-name
              className="min-w-0 flex-1 truncate text-bubble font-extrabold"
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
            {/*
              LA PILE DE NON-LUS FINIT LA LIGNE DU NOM (#6080) — et l'HEURE a
              quitté cette ligne.

              C'est la composition iOS, énoncée par la cote elle-même
              (`LentilleMetrics.Row.height`, 64 → 84 le 2026-08-22) : « la
              rangée porte TROIS lignes — nom (avec la pile de non-lus en fin
              de ligne), "auteur : message", puis la date seule à droite ».
              `LentilleConversationRow.line1` pose `Spacer(minLength: 0)` puis
              `UnreadCountBadge` ; `dateLine`, deux lignes plus bas, pousse
              l'horodatage à droite et RIEN d'autre.

              Ce que la v3.1 faisait à la place : l'heure en fin de ligne de
              nom, et la pastille dans une colonne à part, centrée sur toute la
              hauteur. Les deux repères de DROITE étaient donc portés par deux
              colonnes différentes, et le bord droit de l'heure se déplaçait
              selon que la rangée avait une pastille ou non — mesuré à la
              capture : « 1h » de la section Épingles finissait 68 px plus à
              droite que le « 1 min » de la rangée suivante. Rien ne
              s'alignait, parce que rien n'avait de colonne.
            */}
            <UnreadBadge count={unreadCount} opacity={chromeFade} />
          </span>

          {/*
            L'APERÇU (`list.line2`, #5694 écart 1). Au repos une ligne,
            magnifié deux — et c'est `line-clamp` qui change, pas la hauteur
            du conteneur : la deuxième ligne occupe une place déjà réservée
            par le conteneur visuel de 100. `text-title` (13px = `MeeshyFont.
            subheadSize`, poids RÉGULIER — `LentilleMetrics.Line2`) est le
            jeton DÉRIVÉ ; `data-line2` le crochet stable des gates.

            UN FLUX DE TEXTE, PAS UNE RANGÉE FLEX (#5694 revue). En
            `display: flex`, `text-overflow: ellipsis` ne s'applique JAMAIS —
            les nœuds de texte y deviennent des éléments flex anonymes : la
            ligne se coupait NET au bord, sans point de suspension, là où la
            cible iOS en montre un (`targets/lentille.dark.png`). Pire une
            fois magnifiée : le nom de l'expéditeur et les deux lignes de
            l'aperçu formaient deux colonnes centrées l'une contre l'autre,
            la seconde ligne repartant au MILIEU de la rangée. iOS n'a
            qu'UN `Text` concaténé, et cette ligne en est le miroir : un bloc
            de texte, le glyphe posé `inline-block` dedans, `truncate` au
            repos et `line-clamp-2` magnifié — deux utilitaires qui, eux,
            opèrent sur un bloc.
          */}
          <span
            data-line2
            className={`block min-w-0 text-title ${previewText}`}
            style={{ color: previewKind === 'view-once' && typist === undefined ? accent : 'var(--color-ios-ink-2)' }}
          >
            {/* LA FRAPPE PREND LA TÊTE DE LA PRÉCÉDENCE (#5793) —
                `Line2Kind.resolve(hasTyping:hasDraft:showsBridge:)` met
                `typing` AVANT tout, y compris avant un aperçu PROTÉGÉ
                (`targets/lentille.md:502-511`) : elle ne dit rien du CONTENU,
                donc elle ne peut rien en laisser fuir — un message à vue unique
                dont l'auteur écrit encore montre « X écrit », jamais son texte.

                L'ENCRE RESTE `ink-2`, pas l'accent d'iOS : l'accent d'une
                conversation ne franchit pas le plancher AA sur cette ligne dans
                les deux schémas (mesuré par `checkRowInkMeetsAA`,
                `scripts/check-list-actions.mjs`, la même dette de palette que
                `focal-row.tsx:353` documente déjà). L'ITALIQUE et les trois
                points pulsés — eux, à l'accent, car décoratifs et
                `aria-hidden` — portent la distinction. */}
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
            {typist !== undefined ? (
              <>
                <span className="italic">{`${typist} écrit`}</span>
                <TypingDots color={accent} className="ml-1" />
              </>
            ) : previewKind === 'hidden' ? (
              <>
                {senderPrefix}
                <Glyph name="eyeSlash" size={13} className="mr-1 inline-block align-[-2px]" />
                <span className="italic">1 message caché</span>
              </>
            ) : previewKind === 'view-once' ? (
              <>
                {senderPrefix}
                <Glyph name="flame" size={13} className="mr-1 inline-block align-[-2px]" />
                <span className="italic">1 message vue unique</span>
              </>
            ) : previewKind === 'expired' ? (
              <>
                <Glyph name="timer" size={13} className="mr-1 inline-block align-[-2px]" />
                <span className="italic">Message expiré</span>
              </>
            ) : hasNoHistory ? (
              <span className="italic">Nouvelle conversation</span>
            ) : (
              <>
                {senderPrefix}
                {previewKind === 'ephemeral' ? <Glyph name="timer" size={13} className="mr-1 inline-block align-[-2px]" /> : null}
                {/* `lang` porte la langue SERVIE par le Prisme, pas celle du
                    document : un lecteur d'écran doit prononcer un aperçu traduit
                    avec la voix de sa langue, jamais avec celle de l'expéditeur.
                    L'attribut est OMIS quand la langue est inconnue (une
                    conversation sans historique sert un original vide, sans
                    `originalLanguage`) : `lang=""` signifie « langue indéterminée »
                    et fait quitter au lecteur d'écran la voix du document — dire
                    « je ne sais pas » est ici pire que se taire. */}
                {previewMedia === null ? (
                  <span {...(preview?.language ? { lang: preview.language } : {})}>{preview?.text ?? ''}</span>
                ) : (
                  <>
                    <Glyph name={MEDIA_PREVIEW[kindOf(previewMedia.first)].glyph} size={13} className="mr-1 inline-block align-[-2px]" />
                    <span>{MEDIA_PREVIEW[kindOf(previewMedia.first)].label}</span>
                    {previewMedia.extra > 0 ? <span className="ml-1 font-semibold" style={{ color: accent }}>{`+${previewMedia.extra}`}</span> : null}
                  </>
                )}
              </>
            )}
          </span>

          {/*
            LA TROISIÈME LIGNE — `LentilleConversationRow.dateLine` : à gauche
            ce que la magnification AJOUTE (la date pleine, le compte de
            membres), à droite l'HEURE, seule, TOUJOURS.

            « La date a QUITTÉ [la ligne du nom] le 2026-08-22 : elle vit
            seule, en bas à droite (`dateLine`). Le nom possède donc toute la
            ligne » — le doc-comment d'iOS décrit exactement le défaut que
            cette ligne corrige : chez nous le nom cédait sa fin à l'heure,
            donc se tronquait plus tôt, et l'heure se déplaçait avec lui.

            La ligne est RENDUE en permanence — pas seulement magnifiée : c'est
            ce qui donne à l'heure une colonne fixe, dont le bord droit est
            celui de la rangée. Le supplément, lui, garde son fondu.
          */}
          <span className="flex items-center gap-2 overflow-hidden text-check">
            <span
              className="lens-extra flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
              aria-hidden={!status.magnified}
              style={{
                opacity: status.magnified ? chromeFade : 0,
                pointerEvents: status.magnified ? undefined : 'none',
                color: 'var(--color-ios-ink-3)',
              }}
            >
              <span>{at === undefined ? '' : new Date(at).toISOString().slice(0, 10)}</span>
              {group ? <span>· {conversation.memberCount} membres</span> : null}
            </span>
            {/*
              L'HEURE (#5694, écarts 1 et 8) — `LentilleMetrics.Time.size` = 12
              poids `.bold` (700), et `LentilleConversationRow.timestampColor`
              rend TOUJOURS l'encre TERTIAIRE (`:458-471` — « le timestamp
              rouge sur non-lu est supprimé ») : `LensTime` ne prend même pas
              de prop `unread`, la règle est structurelle. RELATIVE
              (`shortRelativeTime`), vivante à la minute (`minuteClock`), et
              fondue avec le reste du CHROME sous sourdine (`chromeFade`).
            */}
            {at === undefined ? null : (
              <span style={{ opacity: chromeFade }}>
                <LensTime at={at} />
              </span>
            )}
          </span>
        </span>
      </Link>

      <RowActions
        flags={flags}
        unread={unread}
        magnified={status.magnified}
        onAction={(id) => onRowAction(conversation.id, id)}
      />
    </li>
  );
}

/**
 * LE COMPARATEUR DE `memo` (#5694, cinquième point — directive 7) — écrit à
 * la MAIN plutôt que la comparaison superficielle par défaut de `memo`, pour
 * une raison précise : `flags` est un OBJET reconstruit à chaque rendu de
 * l'écran (`effectiveFlagsOf(...)`, `routes/conversations.tsx`) même quand
 * son CONTENU n'a pas changé — la comparaison par défaut (`Object.is` sur
 * chaque prop) verrait cette référence neuve et re-rendrait TOUTE rangée à
 * CHAQUE tick de scène ou d'horloge, exactement le défaut que ce lot ajoute
 * sinon : deux sources de re-rendu NEUVES (entrée/sortie de scène ; tick de
 * l'heure) sur un écran qui re-rendait déjà toutes ses rangées à chaque
 * élection.
 *
 * `conversation`, `languages` et `onRowAction` restent comparés par
 * RÉFÉRENCE — `CONVERSATIONS`, `READER_LANGUAGES` et la fonction MODULE-LEVEL
 * `handleRowAction` (`routes/conversations.tsx`) sont tous les trois des
 * identités STABLES d'un rendu à l'autre ; une référence qui change ICI est
 * un signal réel, pas du bruit.
 */
export function sameRowProps(prev: LensRowProps, next: LensRowProps): boolean {
  if (prev.conversation !== next.conversation) return false;
  if (prev.languages !== next.languages) return false;
  if (prev.viewerId !== next.viewerId) return false;
  if (prev.unreadCount !== next.unreadCount) return false;
  if (prev.onRowAction !== next.onRowAction) return false;
  /* `typist` (#5793) — une CHAÎNE, donc comparable par valeur : l'écran
     redistribue une carte d'identité neuve à chaque `typing:start`/`stop` de
     n'importe quelle conversation, et sans cette ligne la rangée concernée
     n'aurait PAS bougé (le reste de ses props étant identique) tandis que
     toutes les autres se seraient re-rendues pour rien. C'est ce que le
     doc-comment de `useTypistNames` promet de borner. */
  if (prev.typist !== next.typist) return false;

  const s1 = prev.status ?? AT_REST;
  const s2 = next.status ?? AT_REST;
  if (s1.magnified !== s2.magnified || s1.alpha !== s2.alpha || s1.scale !== s2.scale || s1.breathing !== s2.breathing) {
    return false;
  }

  /**
   * Les drapeaux se comparent CLÉ PAR CLÉ, ÉNUMÉRÉES depuis l'objet — jamais
   * par une liste écrite à la main (revue #5694). Une liste manuelle est un
   * INVENTAIRE À TENIR À JOUR : le jour où `ConversationFlags` gagne un
   * quatrième drapeau, un comparateur qui n'en connaît que trois répond
   * « identiques » sur une rangée qui a changé — et la rangée ne se re-rend
   * PLUS, en silence, sans qu'aucun témoin ne rougisse. C'est la forme du
   * relais qui recopie champ par champ (`CLAUDE.md`, cycle 126).
   */
  const before = Object.keys(prev.flags) as (keyof ConversationFlags)[];
  const after = Object.keys(next.flags) as (keyof ConversationFlags)[];
  return before.length === after.length && before.every((key) => prev.flags[key] === next.flags[key]);
}

export const LensRow = memo(LensRowImpl, sameRowProps);
