import { memo } from 'react';
import { useStore } from 'zustand/react';

import { apiConfig } from '@/lib/api/config';
import type { ListConversation } from '@/lib/api/list-preview';
import { sessionStore } from '@/lib/api/session';
import type { Conversation } from '@/lib/api/types';
import { callActions } from '@/lib/calls/call-actions';
import { translate } from '@/lib/i18n-catalog';
import type { ConversationFlags } from '@/lib/api/preferences';
import { accentOf, withAccent } from '@/lib/accent';
import { MUTED_OPACITY } from '@/lib/lens/law';
import { isRowCallAction, type RowActionId } from '@/lib/view/row-actions';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { avatarOf, initialsOf, isGroup, peerOf, presenceOf, titleOf } from '@/lib/view/conversation';
import { useConversationPreview } from '@/lib/view/use-conversation-preview';
import { Link } from '@/routes/route-table';

import { Avatar } from './avatar';
import { Glyph } from './glyph';
import { LensJoinCallButton, LensPreviewLine } from './lens-preview-line';
import { LensTime } from './lens-time';
import { UnreadBadge } from './unread-badge';
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
   * QUI ÉCRIT DANS CETTE CONVERSATION, MAINTENANT (#5793, #7547) — les noms
   * des frappeurs vivants qui ne sont pas le lecteur, distribués par l'écran
   * (`useTypistNames`, `lib/api/use-typists.ts`) : une rangée est rendue dans un
   * `.map`, elle ne peut pas s'abonner elle-même.
   *
   * `undefined` ⇒ personne n'écrit : la ligne 2 retombe sur sa précédence
   * normale, et rien n'est inventé. Deux effets, ceux d'iOS :
   *  - la ligne 2 devient « X écrit… », « X et Y écrivent… » (le composeur
   *    partagé met la frappe en tête de la précédence, après l'appel en cours) ;
   *  - la présence est FORCÉE en ligne, au niveau du RANG et jamais dans
   *    l'avatar (`LentilleConversationRow.swift:125-127`) — la frappe EST une
   *    preuve d'activité (`CLAUDE.md` § « User Presence » : « une personne qui
   *    écrit est TOUJOURS verte »).
   */
  typists?: readonly string[] | undefined;
  /** Langue de CADRAGE des libellés — l'interface par défaut ; injectable pour les témoins. */
  interfaceLanguage?: string | undefined;
  /** Horloge injectable — jamais `Date.now()` lu dans un témoin. */
  now?: (() => number) | undefined;
};

function LensRowImpl({
  conversation,
  languages,
  viewerId,
  status = AT_REST,
  flags,
  unreadCount,
  onRowAction,
  typists,
  interfaceLanguage,
  now,
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
  const photo = avatarOf(conversation, viewerId);
  /**
   * LE PSEUDO DU PAIR (#7241) — dérivé ICI, à côté de `photo` et pour la même
   * raison : `peerOf` ne rend l'autre que sur un DIRECT (§ doc-comment), donc
   * un GROUPE n'a pas de personne à ouvrir, et un participant ANONYME n'a pas
   * de compte (`Participant.user` absent). `identityTarget` range ces deux
   * absences sous la même cible nulle ; on la calcule une fois plutôt que de
   * la redemander dans le rendu.
   */
  const peerHandle = ((): string | undefined => {
    const handle = peerOf(conversation, viewerId)?.user?.username;
    return typeof handle === 'string' && handle !== '' ? handle : undefined;
  })();
  const accent = accentOf(conversation);
  const at = conversation.lastMessageAt ?? conversation.lastMessage?.createdAt;
  const liveCall = (conversation as ListConversation).activeCall ?? null;
  /* Appeler depuis le menu de la ligne (#8109) : la passerelle refuse l'appel
     à un invité anonyme (`CallEventsHandler.ts`), comme `ThreadCallButton`. */
  const canCall = useStore(sessionStore, (state) => state.session.status === 'authenticated') || apiConfig.source === 'fixtures';
  const onAction = (id: RowActionId) => {
    if (!isRowCallAction(id)) return onRowAction(conversation.id, id);
    callActions.start({ conversationId: conversation.id, media: id === 'callVideo' ? 'video' : 'audio', title, avatar: photo ?? null, isGroup: group });
  };

  /**
   * LA CLASSE DE TRONCATURE DE L'APERÇU — `truncate` au repos (une ligne,
   * point de suspension), `line-clamp-2` magnifié (deux lignes, point de
   * suspension). Les deux n'opèrent que sur un BLOC : voir le commentaire de
   * `data-line2` plus bas.
   */
  const previewText = status.magnified ? 'line-clamp-2' : 'truncate';
  const language = interfaceLanguage ?? currentInterfaceLanguage();
  const preview = useConversationPreview({
    conversation,
    viewerId,
    languages,
    typists,
    interfaceLanguage: language,
    now,
  });
  const typing = typists !== undefined && typists.length > 0;

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
      {/*
        **L'ENVELOPPE N'EST PLUS UN LIEN** (#7241, directive porteur du
        2026-09-21 : « même comportement quand on touche un pseudo ou un
        avatar »). Un `<a>` ne peut pas en contenir un autre, et l'avatar doit
        désormais porter sa propre destination — la rangée ENTIÈRE ne pouvait
        donc plus être le lien vers le fil. Le lien descend d'un cran, sur la
        COLONNE DE TEXTE ; l'avatar devient son frère.

        C'est l'arbitrage d'iOS, pas une invention de ce lot :
        `LentilleConversationRow.swift:843` pose
        `onTap: isDirect ? onViewProfile : onViewConversationInfo` — sur un
        DIRECT, toucher l'avatar ouvre la FICHE de l'autre ; ailleurs, il
        continue d'ouvrir la conversation. La rangée garde son geste dominant
        (le fil) sur toute la surface du texte, qui en est l'essentiel.
      */}
      <div
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
        {/* LA PHOTO PAR `avatarOf` (#6975) — le pair d'un direct, la
            conversation elle-même pour un groupe, via la loi PARTAGÉE
            `resolveParticipantAvatar`. Cette rangée appelait déjà
            `peerOf(...)` juste en dessous pour la PRÉSENCE : la donnée était
            là, sur la même ligne, et la photo n'était pas servie. */}
        {/* LE PSEUDO DU PAIR, quand il y en a un : `peerOf` ne rend l'autre
            que sur un DIRECT, et un participant ANONYME n'a pas de compte —
            `identityTarget` range les deux cas sous la même absence de cible,
            et l'avatar ne paraît alors pas tapable (loi 4). */}
        {peerHandle === undefined ? (
          /* GROUPE (ou pair sans compte) : l'avatar garde EXACTEMENT le geste
             d'avant — il ouvre le fil. Le lien est un DOUBLON de celui du
             texte, donc il sort de l'ordre de lecture et du parcours clavier :
             deux liens de même nom à la file se lisent deux fois. */
          <Link
            to="thread"
            params={{ conversation: conversation.id }}
            className="flex shrink-0"
            aria-hidden
            tabIndex={-1}
          >
            <Avatar
              initials={initialsOf(title)}
              color={accent}
              size={44}
              name={title}
              opacity={chromeFade}
              {...(photo === undefined ? {} : { src: photo })}
              {...(group ? {} : { presence: typing ? 'online' : presenceOf(peerOf(conversation, viewerId)) })}
            />
          </Link>
        ) : (
          <Avatar
            initials={initialsOf(title)}
            color={accent}
            size={44}
            name={title}
            opacity={chromeFade}
            profileUsername={peerHandle}
            {...(photo === undefined ? {} : { src: photo })}
            {...(group ? {} : { presence: typing ? 'online' : presenceOf(peerOf(conversation, viewerId)) })}
          />
        )}

        <Link
          to="thread"
          params={{ conversation: conversation.id }}
          className="flex min-w-0 flex-1 flex-col justify-center"
        >
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
            style={{ color: 'var(--color-ios-ink-2)' }}
          >
            {/* LA LIGNE 2 EST CELLE DU COMPOSEUR PARTAGÉ (#7547) —
                `composeConversationPreview` (#7546) tranche la priorité (appel
                en cours, frappe, brouillon, réaction, dernier message), la
                nature, les détails, la protection et le Prisme ; le web la
                dessine (`LensPreviewLine`) et n'y compose RIEN. iOS rejoue le
                même fichier de cas (#7548). */}
            <LensPreviewLine
              preview={preview}
              interfaceLanguage={language}
              accent={accent}
              originalLanguage={conversation.lastMessageOriginalLanguage ?? conversation.lastMessage?.originalLanguage}
            />
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
        </Link>
        {/* « REJOINDRE » (H4) — frère du lien, jamais dedans : voir `LensJoinCallButton`. */}
        {liveCall === null ? null : (
          <LensJoinCallButton
            request={{ conversationId: conversation.id, callId: liveCall.id, media: liveCall.kind === 'video' ? 'video' : 'audio', title, avatar: photo ?? null, isGroup: group }}
            label={translate(currentInterfaceLanguage(), 'callJoin.named', { name: title })}
            text={translate(currentInterfaceLanguage(), 'callJoin.action')}
            onJoin={callActions.join}
          />
        )}
      </div>

      <RowActions
        flags={flags}
        unread={unread}
        magnified={status.magnified}
        language={currentInterfaceLanguage()}
        canCall={canCall}
        onAction={onAction}
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
  /* `typists` (#5793, #7547) — comparés par VALEUR (les noms joints) : l'écran
     redistribue une carte d'identité neuve à chaque `typing:start`/`stop` de
     n'importe quelle conversation, et sans cette ligne la rangée concernée
     n'aurait PAS bougé (le reste de ses props étant identique) tandis que
     toutes les autres se seraient re-rendues pour rien. C'est ce que le
     doc-comment de `useTypistNames` promet de borner. */
  if ((prev.typists ?? []).join('\u0001') !== (next.typists ?? []).join('\u0001')) return false;
  if (prev.interfaceLanguage !== next.interfaceLanguage || prev.now !== next.now) return false;

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
