import { memo } from 'react';

import { checkStatusOf, isMineOf, servedRowLanguage, translatedLanguagesOf } from '@/lib/view/message';
import type { LocalDelivery } from '@/lib/view/message';
import { initialsOf, presenceOf } from '@/lib/view/conversation';
import { badgesOf, bodyKindOf, systemRowOf } from '@/lib/view/message-badges';
import { served } from '@/lib/api/prism';
import type { PlacedMessage } from '@/lib/grouping';
import { time } from '@/lib/grouping';
import type { FlatRowMode } from '@/lib/reading-mode/decision';
import { languageBand, mountsBottomLine } from '@/lib/reading-mode/meta';
import { ephemeralOf, protectionOf } from '@/lib/reading-mode/protection';
import {
  AVATAR_FRAME,
  AVATAR_SIZE,
  FLAG_LIMIT_PLAIN,
  GROUP_TOP_PADDING,
  META_TEXT_OPACITY,
  ROW_PADDING_HORIZONTAL,
  ROW_PADDING_VERTICAL,
  TEXT_INDENT,
} from '@/lib/reading-mode/metrics';

import { Avatar } from './avatar';
import { Attachments } from './attachment-blocks';
import { FocusCard, FocusIdentity, FocusStamp, FocusStrip } from './focal-focus-overlays';
import { GlyphSvg } from './glyph';
import { THREAD_IDENTITY_GLYPHS } from './glyphs-thread-identity';
import { EphemeralBadge, ProtectedContent, ProtectionNotice } from './protected-content';
import {
  Check,
  EditedMark,
  FailedSendBand,
  Flags,
  MessageBadges,
  PrismPastille,
  Quote,
  ReactionChip,
  SystemNotice,
  reactionEntries,
} from './message-blocks';

const defaultNow = (): number => Date.now();

/**
 * LA RANGÉE PLATE DU FIL (Focal / Script) — miroir de `FocalRow.swift`
 * (`apps/ios/Meeshy/Features/Main/Focal/Row/`, §1.5 de la spécification #5566).
 * « Pastille 22, "Pseudo · HH:mm" en tête de groupe, texte 15 pleine largeur
 * au retrait 41, méta discrète, AUCUNE bulle. »
 *
 * DEUX ÉCARTS avec la BULLE (`bubble.tsx`), et c'est le point : cette rangée
 * n'a NI fond, NI rayon, NI alignement gauche/droite — c'est un LOG à colonne
 * unique. Et l'identité vit en TÊTE de groupe (`head`), pas en pied
 * (`tail`) : c'est l'INVERSE de la bulle, la remarque explicite du contrat
 * iOS (« attention : c'est l'inverse de la bulle »).
 *
 * `mode` ne change PAS la disposition — « input.density n'est PAS lu » —
 * `script` et `focal` partagent CETTE rangée ; ce qui les distingue est la
 * PERSPECTIVE au défilement (`reading-mode/scene.ts`, appliquée par l'hôte
 * en mode `focal` seul, HORS de cette rangée — même partition qu'iOS, où le
 * pass de perspective vit dans `MessageListViewController`, pas `FocalRow`).
 * `data-reading-mode` reste posé pour que le gate visuel et un lecteur
 * d'écran puissent DIRE dans quel mode ils sont.
 *
 * DEUX COLONNES (#5135, directive porteur 2026-09-04, correction de revue
 * #5566 défauts 6/7) : le contenu à gauche, l'heure et l'accusé de réception
 * dans une colonne MÉTA à droite, alignée sur la DERNIÈRE ligne du contenu —
 * miroir de `FocalRow.swift:165-183` (`HStack(alignment:.bottom)`). Cette
 * colonne se monte sur CHAQUE rangée (jamais seulement la tête de groupe) :
 * une rangée de continuation SANS heure était le défaut mesuré (#5566
 * défaut 6) — la tête de groupe ne porte plus que l'IDENTITÉ.
 *
 * L'ÉLECTION (#5648) — Focal se distingue désormais de Script par l'ÉLECTION
 * d'une rangée au défilement soutenu (carte teintée, chip d'identité
 * agrandi, tampon de date), plus par la courbe continue qu'iOS a retirée
 * (`reading-mode/perspective.ts`, gelée). `elected` est la SEULE donnée que
 * l'hôte fait traverser React à ce sujet (`reading-mode/scene.ts`) : quand
 * elle bascule, l'en-tête d'identité et la colonne méta s'effacent
 * (`FocalRow.swift:182, :269, :317-322`), la ligne basse ordinaire cède la
 * place à `FocusStrip`/`FocusStamp` (`focal-focus-overlays.tsx`) — DEUX
 * rangées re-rendent par changement d'élection (l'ancienne élue, la
 * nouvelle), jamais toutes. `memo` en bas de fichier tient cette promesse :
 * une rangée dont AUCUNE prop ne change ne re-rend jamais, y compris
 * pendant la scène du fil.
 *
 * LA PROTECTION (D-23, #5676) — le dispatch par `kind`
 * (`protectionOf(message, now)`) : `deleted` SEUL rend un TOMBSTONE PLAT
 * (`ProtectionNotice surface="row"`, aucun avatar, aucune identité, aucune
 * colonne méta — `FocalRow.swift:66-67 systemBody`) ; `expired` ne rend RIEN
 * (`EmptyView`, `FocalRow.swift:63-73`) ; `veiled` ET `burned` gardent la
 * grille ENTIÈRE (identité et méta restent lisibles,
 * `FocalProtectedContent.swift:18-19`) et enveloppent SEULEMENT
 * citation/pièces-jointes/texte/panneau secondaire dans
 * `<ProtectedContent surface="row">` — jamais la bande de reprise d'un
 * envoi échoué (`FocalRow.swift:224-238` reste HORS voile, un échec se voit
 * même sur un message protégé). `burned` REJOINT `veiled` — et c'est un ÉCART
 * ASSUMÉ avec `FocalRow.swift:66` (qui bascule `systemBody` dès que
 * `kind === .burned`) : le web garde le comportement de la BULLE, « contenu
 * visible pendant la fenêtre, tombstone après » (D-23 §1.4 point 4, question
 * 3 — un défaut suspecté de la CIBLE, à ouvrir en issue iOS). `standard` n'appelle même pas
 * `ProtectedContent` (« plan vide ⇒ vue intacte »).
 */
export const FocalRow = memo(function FocalRow({
  mode,
  place,
  languages,
  viewerId,
  localDelivery,
  sendStartedAt,
  sendFailureReason,
  onRetry,
  onJumpToMessage,
  highlighted = false,
  elected = false,
  expired = false,
  onConsumeViewOnce,
  onEphemeralExpired,
  now = defaultNow,
  displayLanguage,
  onPickLanguage,
  myReactions,
  onReact,
  selected,
  onToggleSelect,
}: {
  mode: FlatRowMode;
  place: PlacedMessage;
  languages: readonly string[];
  viewerId: string;
  /** Traduire (#5814) — une langue IMPOSÉE au rang 0 du Prisme, `undefined`
   * ⇒ la résolution ordinaire (`languages`) décide seule. UN résolveur,
   * `resolvePrismTranslation` (D-14) : jamais une seconde loi. */
  displayLanguage?: string;
  /**
   * LE GESTE QUI POSE `displayLanguage` (revue #5814, défaut majeur 12) — le
   * pied de CETTE rangée (pastille + drapeaux) appelle CE prop, exactement
   * comme le sous-menu « Traduire » du menu du message appelle
   * `useMessageMenu.onPickLanguage` : UNE seule loi de « quelle langue pour
   * CE message », jamais une révélation locale qui répondrait autrement que
   * le menu. `undefined` ⇒ le pied garde son effet (loi 4 : pas de bouton
   * inerte) via l'appel optionnel — mais l'hôte (`routes/thread.tsx`) le
   * fournit TOUJOURS en production.
   */
  onPickLanguage?: (code: string) => void;
  /** Les emojis que CE lecteur a posés sur CE message (`reaction-store.ts`)
   * — marque `ReactionChip mine` (#5814, T12). */
  myReactions?: readonly string[];
  /** Retire une réaction MIENNE en tapant sa capsule (#5865) — jamais câblé
   * sur une capsule d'autrui (`ReactionChip`, `onToggle`). `undefined` ⇒ la
   * capsule reste un `<span>` inerte (loi 4). */
  onReact?: (emoji: string) => void;
  /** Mode sélection ACTIF (`undefined` hors sélection) — `false` = rangée
   * non cochée, `true` = cochée (#5814, question 5). */
  selected?: boolean;
  /** VA AVEC `selected` — sans elle, la coche serait un contrôle INERTE
   * (loi 4). Prend l'id plutôt qu'une fermeture par rangée : une référence
   * STABLE (`useCallback` chez l'hôte) est ce qui laisse `memo` faire son
   * travail quand cinquante rangées sont montées. */
  onToggleSelect?: (messageId: string) => void;
  /** L'opinion de CE client sur l'envoi, tant que le transport n'a pas tranché. */
  localDelivery?: LocalDelivery;
  /** Epoch ms du début de la tentative en cours — l'horloge des 200 ms
   * (§5 étape 9 de la spécification #5813), transmise à la fois à la
   * colonne méta ordinaire et à `FocusStamp` (rangée élue). */
  sendStartedAt?: number;
  /** LA CAUSE de l'échec, en clair (`sendFailureReason`) — portée par la
   * bande elle-même : `lastError` était capturé et lu par PERSONNE. */
  sendFailureReason?: string;
  onRetry?: () => void;
  /** Saute au message cité (défaut #5566 défaut 10 : le bouton ne faisait rien). */
  onJumpToMessage: (messageId: string) => void;
  /** Mis en évidence brièvement après un saut de citation. */
  highlighted?: boolean;
  /** Élue par la scène du fil (`reading-mode/scene.ts`) — Focal seul, jamais Script. */
  elected?: boolean;
  /**
   * FORCÉ par l'hôte (`thread.tsx`, état `expiredIds`) quand
   * `EphemeralBadge.onExpired` s'est déclenché pour CE message — jamais un
   * `setInterval` posé ici : une seconde horloge dans cette rangée est le
   * défaut que D-23 interdit (« écrire une seconde horloge de révélation
   * dans une peau »).
   */
  expired?: boolean;
  /** Consomme une vue unique (D-10, `lib/api/view-once.ts`) ; `undefined` en environnement sans réseau. */
  onConsumeViewOnce?: (messageId: string) => Promise<boolean>;
  onEphemeralExpired?: (messageId: string) => void;
  /** Horloge injectable — jamais `Date.now()` lu directement (déterminisme des témoins). */
  now?: () => number;
}) {
  const { message, head, tail } = place;
  const nowMs = now();
  const kind = expired ? 'expired' : protectionOf(message, nowMs);
  const isMine = isMineOf(message, viewerId);

  // `expired` — EmptyView : rien à rendre, mais l'ANCRE structurelle reste
  // (`data-message`) pour que les gates puissent constater l'absence.
  if (kind === 'expired') {
    return <div data-reading-mode={mode} data-message={message.id} data-protected="expired" />;
  }

  /**
   * `deleted` SEUL prend le TOMBSTONE PLAT (ni avatar, ni identité, ni
   * colonne méta, `FocalRow.swift:66-67`) : un message supprimé n'a JAMAIS
   * eu de fenêtre à ouvrir. `burned` N'EST PAS traité ici — et c'est un
   * ÉCART ASSUMÉ avec `FocalRow.swift:66` (qui bascule sur `systemBody` dès
   * que `kind === .burned`, donc dès que la consommation aboutit) : le web
   * garde le comportement de la BULLE (D-23 §1.4 point 4, question 3) —
   * « contenu visible pendant la fenêtre, tombstone après ». Router `burned`
   * ici COUPERAIT la révélation à l'instant même où la consommation serveur
   * répond, avant que les 5 s payées par le lecteur ne s'écoulent. `burned`
   * rejoint donc `veiled` plus bas : `ProtectedContent` sait déjà rendre son
   * tombstone SANS affordance quand il MONTE directement sur un message
   * brûlé à l'arrivée (`viewOnceCount ≥ maxViewOnceCount` avant toute
   * interaction) — la même fonction couvre les deux histoires par sa PHASE
   * locale, jamais par le `kind` du dernier rendu de l'hôte.
   */
  if (kind === 'deleted') {
    return (
      <div
        data-reading-mode={mode}
        data-message={message.id}
        className="grid"
        style={{
          gridTemplateColumns: `${TEXT_INDENT}px 1fr`,
          paddingInline: ROW_PADDING_HORIZONTAL,
          paddingBlockStart: head ? GROUP_TOP_PADDING : ROW_PADDING_VERTICAL,
          paddingBlockEnd: ROW_PADDING_VERTICAL,
        }}
      >
        <div aria-hidden />
        <ProtectionNotice kind={kind} surface="row" />
      </div>
    );
  }

  /**
   * LA RANGÉE SYSTÈME — `messageSource: 'system'` seulement, et seulement au
   * cas `standard` (`kind`) : un message système PROTÉGÉ (rare, jamais
   * produit aujourd'hui) reste un tombstone, fail-closed, la loi de D-23 ne
   * l'exclut pas explicitement (voir `message-badges.ts`, doc-comment de
   * `systemRowOf`). Ni avatar ni colonne méta — même grille que le
   * tombstone `deleted` ci-dessus, texte SERVI par le Prisme
   * (`served({...}).text`, jamais `message.content` brut).
   */
  if (kind === 'standard' && systemRowOf(message) !== null) {
    const systemText = served({
      preferredLanguages: languages,
      originalLanguage: message.originalLanguage,
      translations: message.translations,
      original: message.content,
    }).text;
    return (
      <div
        data-reading-mode={mode}
        data-message={message.id}
        data-system-row
        className="grid"
        style={{
          gridTemplateColumns: `${TEXT_INDENT}px 1fr`,
          paddingInline: ROW_PADDING_HORIZONTAL,
          paddingBlockStart: head ? GROUP_TOP_PADDING : ROW_PADDING_VERTICAL,
          paddingBlockEnd: ROW_PADDING_VERTICAL,
        }}
      >
        <div aria-hidden />
        <SystemNotice text={systemText} surface="row" />
      </div>
    );
  }

  // Texte ET pistes AUDIO traduites (#5805) — miroir `BubbleContentBuilder
  // .buildAvailableFlags(translations:translatedAudios:)` (`:365-395`) : un
  // vocal traduit SANS traduction texte monte lui aussi la bande de drapeaux,
  // une image dont seul l'`alt` est traduit ne la monte PAS (revue #5805).
  const translatedLanguages = translatedLanguagesOf(message);
  /** `displayLanguage` est une INSERTION au rang 0 (#5814, § 5 étape 4) —
   * UN résolveur (`resolvePrismTranslation`, D-14), jamais un second. Le MÊME
   * prisme nourrit `Attachments` et `servedRowLanguage`. */
  const preferredLanguages = displayLanguage === undefined ? languages : [displayLanguage, ...languages];
  const rendered = served({
    preferredLanguages,
    originalLanguage: message.originalLanguage,
    translations: message.translations,
    original: message.content,
  });
  /**
   * LA RÉSOLUTION NATURELLE, SANS `displayLanguage` (revue #5814, correction
   * après gate — `check-reading-mode.mjs` § 9 bis) — `PrismPastille` se
   * MONTE quand une traduction existe naturellement pour CE message,
   * jamais quand l'override ACTIF la rend égale à l'original. Utiliser
   * `rendered.language` pour cette garde était le défaut : cliquer la
   * pastille pose `displayLanguage = originalLanguage`, ce qui fait
   * `rendered.language === originalLanguage` — et un `PrismPastille` gardé
   * par CETTE égalité se DÉMONTE au clic qui vient de le presser, avant
   * même que le doigt ne se relève. Le bouton doit rester monté tant que
   * l'ORIGINE offre quelque chose à explorer, quel que soit ce qui est
   * actuellement affiché.
   */
  const naturalServedLanguage = servedRowLanguage({
    served: served({
      preferredLanguages: languages,
      originalLanguage: message.originalLanguage,
      translations: message.translations,
      original: message.content,
    }),
    preferredLanguages: languages,
    attachments: message.attachments,
    fallbackLanguage: message.originalLanguage,
  });

  /**
   * LA LANGUE ACTIVE DU PIED (revue #5814, défaut majeur 12) — la langue
   * RÉELLEMENT servie par la rangée, jamais un état local, et jamais
   * `rendered.language` seul (revue #5805) : sur un message MÉDIA-SEUL
   * (`content: ''`) cette langue est l'ORIGINALE, alors que la transcription
   * affichée est traduite — la bande retirait alors la mauvaise langue et
   * proposait un drapeau sans effet. `servedRowLanguage` lit le texte quand
   * il existe, la pièce sinon.
   */
  const activeLanguage = servedRowLanguage({
    served: rendered,
    preferredLanguages,
    attachments: message.attachments,
    fallbackLanguage: message.originalLanguage,
  });

  const footerLanguages = languageBand({
    originalLanguage: message.originalLanguage,
    preferredLanguages: languages,
    translations: translatedLanguages,
    servedLanguage: activeLanguage,
  });

  /* DEUX NOMS, PAS UN (revue #5935) — miroir `FocalIdentityHeader.swift:87-92` :
   * iOS passe `senderDisplayName` à l'AVATAR (ses initiales restent celles de
   * la personne) et n'échange que le TEXTE contre le littéral de soi
   * (`focal.row.you`). Un seul nom ici faisait, sur la donnée RÉELLE de la
   * passerelle, afficher au lecteur son PROPRE nom là où iOS écrit « soi » —
   * invisible sur fixture (`viewer.displayName === 'Vous'`), visible dès que
   * VITE_DATA_SOURCE=gateway. Le viewer n'a pas toujours de `sender` peuplé
   * sur ses propres messages (fixture, charge socket allégée) : le repli
   * comble l'identité, jamais un nom vide en tête de groupe. */
  const senderAvatarName = message.sender?.displayName ?? (isMine ? 'Vous' : '');
  const senderName = isMine ? 'Vous' : senderAvatarName;
  /* LA COULEUR DU NOM DE SOI — un jeton GÉNÉRÉ, pas l'encre primaire
   * (revue #5935, défaut majeur 2, SOLDÉ). `FocalIdentityHeader.swift:90-92`
   * peint le nom de SOI en `MeeshyColors.indigo500` ; servi TEL QUEL sur la
   * ligne d'identité de 13 px, il MESURE 4,47:1 en clair et 4,45:1 en sombre
   * (Chromium, `lib/contrast.mjs` sur `/c/c-deploiement`) — sous la barre AA
   * de 4,5:1, et le gras 800 n'ouvre pas l'exemption « grand texte »
   * (13 px < 18,5 px). D-4 interdit d'inventer une couleur ici : l'encre
   * primaire tenait AA (15,99:1 / 17,79:1) mais rendait la tête d'un message
   * à SOI indiscernable de celle d'un autre — la distinction que la cible
   * iOS porte. `--color-self-name-ink` (méthode D-18/#5625,
   * `packages/design-tokens/scripts/generate-from-ios.mjs`) sert désormais
   * le cran suivant qui PASSE — indigo700 en clair, indigo200 en sombre
   * (7,90:1 / 13,34:1), la MÊME paire que `--color-day-ink` mais nommée pour
   * SA fonction : un séparateur de jour et un nom de soi ne sont pas la
   * même chose, même si leur cran de contraste coïncide aujourd'hui.
   * **iOS lui-même reste sous AA sur ce point précis** — un défaut de la
   * CIBLE (famille #5681-#5683), pas une dérivation qui invente une
   * couleur : issue compagnon ouverte côté iOS, pas ici. */
  const senderNameColor = isMine ? 'var(--color-self-name-ink)' : 'var(--color-ios-ink)';
  /* SANS COMPTE (#5774, travail 2/3 ; glyphe #5935) — miroir
   * `FocalIdentityHeader.swift:99-161` : un visiteur entré par lien porte un
   * marqueur AVANT son nom. Le fantôme `theatermasks.fill` d'iOS est
   * ICONOGRAPHIQUE ici (`mask-happy`, `scripts/extract-glyphs.mjs`), pas un
   * badge textuel — l'écart avec le tracé exact d'iOS (Phosphor ne publie
   * pas `theatermasks`) est assumé, D-32. */
  const isAnonymousSender = message.sender?.type === 'anonymous';
  const reactions = reactionEntries(message.reactionSummary);

  // `kind === 'veiled' | 'burned'` toutes deux passent par `ProtectedContent`
  // (voir le commentaire ci-dessus sur le tombstone plat).
  const isProtected = kind !== 'standard';

  /**
   * LA LIGNE BASSE — miroir de `FocalMetaColumn.mountsBottomLine` (défaut 7) :
   * elle ne monte plus systématiquement, seulement si elle a quelque chose à
   * dire (un jeu de drapeaux SUR LE DERNIER message d'un groupe traduit et
   * non voilé, ou une réaction). `hasTranslation` porte sur CE message —
   * indépendamment de la langue explorée (`displayLanguage`) : la loi ne
   * connaît que la donnée, jamais quelle langue est actuellement servie. `isVeiled`
   * couvre désormais TOUTE protection (D-23), pas seulement `isBlurred`.
   */
  const showsBottomLine = mountsBottomLine({
    hasTranslation: translatedLanguages.length > 0,
    isVeiled: isProtected,
    isLastInGroup: tail,
    hasReactions: reactions.length > 0,
  });

  /** `checkStatusOf` et non `deliveryOf` (revue-correction #5813) : `null`
   * sur un envoi ÉCHOUÉ — sa bande dit déjà « Non envoyé », et
   * `deliveredCount: 0` ferait sinon peindre la coche « envoyé » juste à
   * côté. Site unique, partagé avec `Bubble` (`lib/view/message.ts`). */
  const delivery = checkStatusOf(message, localDelivery);

  // Le tampon n'est calculé QUE quand il est rendu (§5.6 de la spécification
  // #5648) — cette rangée ne re-rend que sur un changement de `elected`
  // (`memo`), donc `new Date()` ici ne tourne pas à chaque frame de la scène.
  const nowMoment = elected ? new Date() : null;

  const ephemeral = ephemeralOf(message.expiresAt, nowMs);

  /** `badgesOf` (site UNIQUE, `lib/view/message-badges.ts`) — épinglé et
   * transféré ouvrent la colonne de contenu, `MessageBadges` filtrant ceux
   * qui se peignent ICI (« modifié »/« éphémère » vivent ailleurs). */
  const badges = badgesOf(message);

  /* UN EMOJI SEUL s'affiche EN GRAND, sans les contraintes de paragraphe du
   * texte ordinaire — `bodyKindOf` (`message-badges.ts`) juge le texte SERVI,
   * jamais `message.content` brut (un contenu original « Hello 👋 » traduit
   * en un seul emoji doit grandir, l'inverse aussi). */
  const emojiOnly = rendered.text !== '' && bodyKindOf(rendered.text) === 'emoji-only';

  const contentBlock = (
    <>
      {/* `isMine={false}` DÉLIBÉRÉMENT, et ce n'est pas un oubli : la peau
          « mine » de la citation est écrite pour le fond INDIGO de la bulle
          (nom en blanc, texte en blanc 70 %, filet blanc). La rangée plate
          n'a AUCUN fond — servie « mine », la citation d'un message à soi
          devenait du blanc sur du blanc en schéma clair, donc INVISIBLE
          (mesuré : contraste 1,0:1). Une peau ne se choisit pas sur
          l'expéditeur mais sur la SURFACE qui la porte. */}
      <MessageBadges badges={badges} />
      {message.replyTo ? (
        <Quote quote={message.replyTo} isMine={false} onJump={() => onJumpToMessage(message.replyTo!.id)} />
      ) : null}
      {message.attachments ? (
        <Attachments
          attachments={message.attachments}
          languages={languages}
          fallbackLanguage={message.originalLanguage}
          {...(displayLanguage !== undefined ? { displayLanguage } : {})}
        />
      ) : null}

      {rendered.text ? (
        <p
          data-body-kind={emojiOnly ? 'emoji-only' : 'text'}
          className={emojiOnly ? 'leading-[1.2] whitespace-pre-wrap' : 'text-bubble leading-[1.35] whitespace-pre-wrap'}
          lang={rendered.language}
          style={{ color: 'var(--color-ios-ink)', fontSize: emojiOnly ? 40 : undefined }}
          /* `aria-hidden` (revue #5935, défauts majeurs 1/4) — ce texte est
             DÉJÀ le `servedText` que `composeMessageLabel` a posé dans
             `aria-label={rowLabel}` (`thread-modes.tsx`) : sans ce masque,
             l'arbre AX réel le portait DEUX fois, en frère non `ignored`
             du libellé de l'`article`. `lang` reste porté ICI pour l'affichage
             visuel ET sur `[data-row]` (`rowServed.language`) pour le
             libellé — un lecteur d'écran qui commute de langue au fil du
             DOM n'a donc plus rien à lire sous ce nœud. */
          aria-hidden
        >
          {rendered.text}
        </p>
      ) : null}
    </>
  );

  return (
    <div
      data-reading-mode={mode}
      data-elected={elected ? 'true' : undefined}
      data-message={message.id}
      /* PAS d'`aria-selected` ICI (revue #5814) : l'attribut n'est défini que
         sur `option`/`row`/`gridcell`/`tab`/`treeitem`. Sur un `div` sans
         rôle il était invalide — et rendu DEUX fois (l'hôte le posait aussi
         sur `[data-row]`). L'état de sélection est porté par la COCHE, un
         `role="checkbox"` réel avec `aria-checked`, qui est aussi le seul
         chemin CLAVIER vers la bascule. */
      className="grid transition-colors duration-500"
      style={{
        gridTemplateColumns: `${TEXT_INDENT}px 1fr`,
        paddingInline: ROW_PADDING_HORIZONTAL,
        paddingBlockStart: head ? GROUP_TOP_PADDING : ROW_PADDING_VERTICAL,
        paddingBlockEnd: ROW_PADDING_VERTICAL,
        borderRadius: 10,
        backgroundColor: highlighted
          ? 'color-mix(in srgb, var(--accent) 22%, transparent)'
          : selected === true
            ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
            : 'transparent',
      }}
    >
      {/* L'AVATAR DE LA TÊTE DE GROUPE — s'EFFACE en focus, comme le nom
          juste à côté : côté iOS l'en-tête d'identité ENTIER (avatar + nom)
          passe à `opacity: 0` (`FocalRow.swift:269`) et `focusIdentityChip`
          le REMPLACE à la même place. Le laisser visible peignait DEUX
          pastilles et DEUX noms sur la même rangée (mesuré sur
          `thread-focal-scene.dark.png`, correction de revue #5648).

          EN MODE SÉLECTION (`selected !== undefined`, #5814) — une COCHE
          REMPLACE l'avatar dans le MÊME gabarit : le mode sélection est actif
          pour TOUT le fil à la fois, jamais une rangée isolée. */}
      <div
        className="flex justify-center pt-0.5"
        /* L'EFFACEMENT EN FOCUS NE VAUT QUE POUR L'AVATAR (revue #5814) :
           effacer la COCHE d'une rangée élue la rendrait invisible ET
           incliquable au milieu d'un mode sélection actif. */
        style={{ opacity: elected && selected === undefined ? 0 : 1 }}
      >
        {selected !== undefined ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect?.(message.id);
            }}
            className="grid place-items-center"
            style={{ width: TEXT_INDENT, minHeight: 44 }}
          >
            <span
              aria-hidden
              className="grid place-items-center rounded-full"
              style={{
                width: AVATAR_SIZE,
                height: AVATAR_SIZE,
                border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--color-ios-ink-3)'}`,
                backgroundColor: selected ? 'var(--accent)' : 'transparent',
                color: 'white',
              }}
            >
              {selected ? '✓' : null}
            </span>
            <span className="offscreen">Sélectionner ce message</span>
          </button>
        ) : head ? (
          <Avatar
            initials={initialsOf(senderAvatarName)}
            color="var(--accent)"
            size={AVATAR_SIZE}
            presence={presenceOf(message.sender, nowMs)}
          />
        ) : null}
      </div>

      {/* `position: relative` sur TOUTE la colonne de contenu — tête de
          groupe COMPRISE — et non sur le seul bloc « deux colonnes »
          (correction de revue, capture `thread-focal-scene.dark.png`) :
          ancrée plus bas, `FocusIdentity` (34 px, overhang -20 px)
          débordait DANS le texte du message plutôt que dans la zone
          RÉSERVÉE par l'en-tête d'identité (désormais invisible,
          `opacity:0`, mais toujours présente dans le flux — donc encore
          « à elle » l'espace que la superposition vient occuper). Sur une
          rangée de CONTINUATION (sans tête), le débordement reste possible
          — écart hors périmètre de #5648, à suivre si mesuré. */}
      <div className="min-w-0 relative">
        {elected ? <FocusCard /> : null}
        {elected ? (
          <FocusIdentity initials={initialsOf(senderAvatarName)} name={senderName} accent="var(--accent)" />
        ) : null}

        {/* LE BADGE ÉPHÉMÈRE — AU-DESSUS de l'identité (F11,
            `FocalEphemeralBadge.swift:22-37`, `FocalRow.swift:365-376`),
            monté SEULEMENT quand le minuteur tourne. Tient SON PROPRE
            intervalle (`memo`) — cette rangée ne re-rend jamais pour lui. */}
        {ephemeral.state === 'running' && message.expiresAt !== undefined ? (
          <EphemeralBadge
            expiresAt={message.expiresAt}
            now={now}
            onExpired={() => onEphemeralExpired?.(message.id)}
          />
        ) : null}

        {head ? (
          /* TÊTE DE GROUPE : l'IDENTITÉ seule (défaut 6) — « cet en-tête ne
             date plus rien » (iOS, `FocalIdentityHeader.swift:13-18`).
             L'heure vit désormais dans la colonne méta, accolée à CHAQUE
             rangée, tête comme continuation. S'EFFACE en focus (:269) —
             `FocusIdentity` la remplace en overlay. */
          <div
            data-identity
            className="pb-0.5 flex items-center gap-1.5"
            /* `minHeight: AVATAR_FRAME` (34) — le CADRE réservé par
               `Focus.avatarSize` (revue #5648, `FocusIdentity` débordait
               dans le texte sans lui) : la ligne d'identité a maintenant
               la MÊME hauteur, pastille de présence posée ou non — la
               présence NE DOIT PAS faire grandir la rangée. */
            style={{ opacity: elected ? 0 : 1, minHeight: AVATAR_FRAME }}
            /* `aria-hidden` (revue #5935, défauts majeurs 1/4) —
               `role="article"` + `aria-label` sur `[data-row]`
               (`thread-modes.tsx`) NE réduit PAS le sous-arbre : sans ce
               masque, un lecteur d'écran annonçait le libellé COMPOSÉ puis
               relisait ce nom (arbre AX réel : `[article]` PUIS
               `[StaticText] "Amina Diallo"`, ni l'un ni l'autre `ignored`).
               `composeMessageLabel` porte désormais « Sans compte » lui-même
               (`message-a11y-label.ts`) — masquer ce nœud ne perd donc plus
               rien que `aria-label={rowLabel}` ne dise déjà. Le glyphe garde
               son `role="img"` PROPRE ; il disparaît de l'arbre avec le
               reste, sans perte puisque son nom est désormais DANS le
               libellé de la rangée. */
            aria-hidden
          >
            {isAnonymousSender ? (
              <GlyphSvg
                glyph={THREAD_IDENTITY_GLYPHS.maskHappy}
                title="Sans compte"
                /* `text-title` — LA MÊME taille que le nom, pour que `0.8em`
                   soit bien `nameSize × 0.8` (iOS, `:130-131`). Sans elle,
                   l'`em` se résolvait sur la police HÉRITÉE du conteneur
                   (16 px) et le fantôme mesurait 12,8 px contre les 10,4 px
                   d'iOS — mesuré au navigateur, revue #5935. */
                className="shrink-0 text-title"
                style={{ width: '0.8em', height: '0.8em', color: 'var(--ios-purple-500)' }}
              />
            ) : null}
            <span className="text-title font-extrabold" style={{ color: senderNameColor }}>
              {senderName}
            </span>
          </div>
        ) : null}

        {/* DEUX COLONNES : le contenu (citation, pièces jointes, texte, ligne
            basse) à gauche ; l'heure et l'accusé à droite, alignés sur la
            DERNIÈRE ligne du bloc — `items-end` fait ce que
            `HStack(alignment:.bottom)` fait côté iOS. */}
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            {/* La bande de reprise reste DANS la rangée du message concerné,
                et HORS voile : un échec d'envoi se voit même sur un message
                protégé (`FocalRow.swift:224-238`, même parti que la bulle). */}
            {localDelivery === 'failed' ? (
              <FailedSendBand
                {...(sendFailureReason === undefined ? {} : { reason: sendFailureReason })}
                {...(onRetry === undefined ? {} : { onRetry })}
                textColor="var(--color-error)"
              />
            ) : null}

            {isProtected ? (
              <ProtectedContent
                messageId={message.id}
                kind={kind}
                isViewOnce={message.isViewOnce}
                contentLength={message.content.length}
                attachmentCount={message.attachments?.length ?? 0}
                surface="row"
                onConsumeViewOnce={onConsumeViewOnce}
                now={now}
              >
                {contentBlock}
              </ProtectedContent>
            ) : (
              contentBlock
            )}

            {/* LA LIGNE BASSE — drapeaux PUIS réactions, même ligne : c'est
                l'arbitrage porteur du 2026-08-18 que `FocalRow.flagAndReactionsRow`
                porte côté iOS. Conditionnelle (défaut 7) : elle ne monte plus
                sur un message sans rien à dire.

                S'EFFACE en focus par `visibility: hidden`, PAS par démontage
                (correction de revue #5648, défaut bloquant 3) : la
                DÉMONTER — comme une première version de ce lot le faisait —
                réduit la rangée élue de la hauteur de cette ligne (26 px),
                et fait remonter `.focus-strip`/`.focus-stamp`
                (`bottom: calc(-1 * var(--focus-strip-overhang))`, ancrés au
                bas du bloc de contenu) SUR la dernière ligne du texte que
                l'élection vient de mettre en avant. `FocalRow.swift:317-322`
                fait l'INVERSE mot pour mot — `.opacity(input.isFocused ? 0
                : 1)` — « la bande SUR la ligne basse remplace visuellement
                cette ligne, QUI GARDE SA PLACE ». `visibility: hidden` (et
                non `opacity: 0`, le traitement de l'avatar/du nom deux blocs
                plus haut) parce que CETTE ligne porte des `<button>` DE
                PRISME : `opacity: 0` les aurait laissés dans l'ordre de
                tabulation et l'arbre d'accessibilité — exactement l'anti-
                motif WCAG que `FocusStrip` (le composant qui les REMPLACE
                visuellement) documente avoir évité en restant hors
                `aria-hidden`. `visibility: hidden` réserve la MÊME hauteur
                sans y laisser de contrôle atteignable au clavier ni annoncé
                deux fois. */}
            {showsBottomLine ? (
              <div
                className="flex items-center gap-1 pt-1"
                style={{ color: 'var(--color-meta)', visibility: elected ? 'hidden' : 'visible' }}
              >
                <PrismPastille
                  servedLanguage={naturalServedLanguage}
                  originalLanguage={message.originalLanguage}
                  active={activeLanguage}
                  onToggle={() => onPickLanguage?.(message.originalLanguage)}
                />
                <Flags
                  languages={footerLanguages}
                  active={activeLanguage}
                  onPick={(code) => onPickLanguage?.(code)}
                  limit={FLAG_LIMIT_PLAIN}
                />
                {reactions.map(([glyph, count]) => {
                  const mine = myReactions?.includes(glyph) ?? false;
                  return (
                    <ReactionChip
                      key={glyph}
                      glyph={glyph}
                      count={count}
                      mine={mine}
                      {...(mine && onReact !== undefined ? { onToggle: () => onReact(glyph) } : {})}
                    />
                  );
                })}
              </div>
            ) : elected ? (
              /* DÉFAUT 1 (#5648, correction de revue) — le recouvrement du
                 texte par le tampon n'était corrigé QUE pour les rangées qui
                 montent une ligne basse (ci-dessus, `visibility: hidden`
                 réserve sa hauteur). Une rangée ÉLUE SANS ligne basse
                 (continuation `tail === false`, ou message sans traduction
                 ni réaction) ne réservait AUCUNE hauteur : `.focus-strip`/
                 `.focus-stamp` (ancrés `bottom: calc(-1 *
                 var(--focus-strip-overhang))` sur cette colonne) débordaient
                 alors de 9 px SUR la dernière ligne de texte qu'ils élisent
                 — mesuré sur `riv-19` (continuation) et reproductible sur
                 tout message sans traduction ni réaction
                 (`fixtures.test.ts`, témoins `RIVER_CONTINUATION_WITNESS_ID`
                 / `RIVER_NO_TRANSLATION_WITNESS_ID`).

                 Ce `div` réserve la MÊME hauteur qu'une ligne basse réelle,
                 avec les MÊMES classes que sa cible tactile
                 (`pt-1` + `size-[22px]`, `PrismPastille`/`Flags` ci-dessus) —
                 aucune cote nouvelle à garder par `check-curve.mjs`, la
                 hauteur suit la géométrie déjà dérivée. `aria-hidden` : rien
                 à annoncer, ni contrôle ni texte. Il ne se monte QUE sur la
                 rangée ÉLUE (iOS porte le MÊME débord, `FocalRow.swift:202-
                 211` — un défaut de la CIBLE, `targets/README.md` — ce
                 réservoir est donc une divergence ASSUMÉE, documentée,
                 jamais une recopie muette) : sur une rangée ORDINAIRE sans
                 ligne basse, réserver cette hauteur ferait réapparaître la
                 « ligne blanche inutile » que la directive porteur du
                 2026-09-04 est venue supprimer (défaut 7, `meta.ts`). */
              <div className="flex items-center gap-1 pt-1" aria-hidden>
                <span data-focus-reserve className="size-[22px]" />
              </div>
            ) : null}
          </div>

          {/* LA COLONNE MÉTA — heure puis accusé, sur CHAQUE rangée (défaut
              6). `Check` est déjà silencieux (`isMine === false` ⇒ `null`) :
              une rangée reçue ne porte que l'heure.
              `.focal-meta` PILOTE LE RÉVÉLÉ PAR CSS (`app.css`, depuis
              `main[data-revealed]`) — zéro re-rendu au geste, jamais une
              prop : la même feuille que `FocalRevealedDetail` (iOS)
              n'invalide qu'elle-même. `[data-elected='true'] .focal-meta`
              s'efface en plus (`FocusStamp` la remplace en overlay). */}
          <div
            className="focal-meta flex shrink-0 items-center gap-1 pb-0.5"
            /* `aria-hidden` INCONDITIONNEL (revue #5935, défauts majeurs
               1/4 — élargi depuis le seul cas `elected`). L'heure et
               l'accusé sont DÉJÀ dans `rowLabel` (`time(...)` et
               `deliveryWord`, `message-a11y-label.ts`) : sur une rangée
               ORDINAIRE, `<time>` n'était pas encore masqué et l'arbre AX
               réel le portait deux fois (`[time] → [StaticText] "11:43"`,
               frère non `ignored` de l'`article`). `Check` ne porte qu'un
               `role="img"` déjà absorbé par le même libellé (`deliveryWord`)
               — rien de focalisable ici, seulement du texte redondant. Sur
               la rangée ÉLUE, cela tient l'ancienne garde (`FocusStamp` la
               remplace en clair) sans avoir plus besoin de la condition. */
            aria-hidden
          >
            <time
              className="text-time font-medium tabular-nums"
              /* `META_TEXT_OPACITY` et non un `0.55` en dur : la cote est
                 DÉRIVÉE de `FocalMetrics.MetaText` et gardée par
                 `check-curve.mjs`. Écrite deux fois, elle ne serait plus
                 gardée qu'à un seul des deux endroits. */
              style={{ color: 'var(--color-ios-ink-2)', opacity: META_TEXT_OPACITY }}
              dateTime={new Date(message.createdAt).toISOString()}
            >
              {time(message.createdAt)}
            </time>
            {delivery === null ? null : (
              <Check status={delivery} isMine={isMine} {...(sendStartedAt === undefined ? {} : { sendStartedAt })} />
            )}
            {message.isEdited ? <EditedMark color="var(--color-ios-ink-2)" /> : null}
          </div>

          {elected && nowMoment !== null ? (
            <>
              {/* LA BANDE DE FOCUS monte sous la MÊME loi que la ligne basse
                  qu'elle remplace (`mountsBottomLine`) — jamais sous une loi
                  à elle. Sans ce garde-fou, la rangée élue montrait des
                  drapeaux là où la rangée ordinaire n'en montre AUCUN, et
                  surtout elle FRANCHISSAIT la garde nommée de cette loi :
                  « jamais de drapeau en clair sur un message VOILÉ » — la
                  langue d'origine d'un message protégé partait sur la carte
                  de l'élue (correction de revue #5648, doctrine des cycles
                  124/125 du CLAUDE.md : une protection se mesure sur TOUT ce
                  que la surface transporte). */}
              {showsBottomLine ? (
                <FocusStrip
                  servedLanguage={naturalServedLanguage}
                  originalLanguage={message.originalLanguage}
                  footerLanguages={footerLanguages}
                  active={activeLanguage}
                  onToggleOriginal={() => onPickLanguage?.(message.originalLanguage)}
                  onPickLanguage={(code) => onPickLanguage?.(code)}
                  reactions={reactions}
                />
              ) : null}
              <FocusStamp
                sentAt={new Date(message.createdAt)}
                now={nowMoment}
                timeString={time(message.createdAt)}
                locale={languages[0] ?? 'fr'}
                delivery={delivery}
                isMine={isMine}
                {...(sendStartedAt === undefined ? {} : { sendStartedAt })}
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
});
