import { checkStatusOf, isMineOf, servedRowLanguage, translatedLanguagesOf } from '@/lib/view/message';
import { badgesOf, editedOf, ephemeralBadgeOf, systemRowOf } from '@/lib/view/message-badges';
import { bodyKindOf, placeOf, storyCitationOf } from '@/lib/view/message-body';
import { initialsOf, presenceOf } from '@/lib/view/conversation';
import type { LocalDelivery } from '@/lib/view/message';
import { prismFor, served } from '@/lib/api/prism';
import type { PlacedMessage } from '@/lib/grouping';
import { time } from '@/lib/grouping';
import { languageBand, mountsBottomLine } from '@/lib/reading-mode/meta';
import { ephemeralOf, protectionOf } from '@/lib/reading-mode/protection';
import { BUBBLE_STICKER_SIDE } from '@/lib/reading-mode/metrics';

import { Avatar } from './avatar';
import { Attachments } from './attachment-blocks';
import { EmojiOnly, LocationCard, StickerArtwork, StoryCitationCard } from './message-body-blocks';
import { EphemeralBadge, ProtectedContent, ProtectionNotice } from './protected-content';
import { SystemNotice } from './system-notice';
import {
  Badges,
  Check,
  EditedMark,
  FailedSendBand,
  Flags,
  PrismPastille,
  Quote,
  ReactionChip,
  reactionEntries,
} from './message-blocks';

const defaultNow = (): number => Date.now();

/**
 * LA BULLE — le composant le plus dense de l'interface, et celui sur lequel la
 * fidelite se juge.
 *
 * Trois choses que le rendu iOS fait et qu'on rate en le regardant vite :
 *
 * 1. Le rayon est UNIFORME (18 px, quatre coins), il n'y a NI queue, NI coin
 *    asymetrique, NI ombre, NI degrade de fond. Les ombres ont ete retirees
 *    cote iOS pour la fluidite du defilement — les reposer ici couterait des
 *    passes offscreen sur exactement l'appareil vise.
 * 2. L'avatar et le nom vivent DANS le pied de la bulle, pas a cote d'elle, et
 *    ne s'affichent que sur le DERNIER message d'une suite (jamais le
 *    premier), en groupe, et seulement en reception.
 * 3. La bulle ENVOYEE est l'indigo de marque, le MEME dans toutes les
 *    conversations ; seule la bulle RECUE porte l'accent de la conversation.
 *
 * LA PROTECTION (D-23, #5676) — `deleted` SEUL ne monte AUCUNE bulle :
 * `BubbleDeletedView` (`Bubble/BubbleSystemViews.swift`) est une vue À PART,
 * une capsule alignée du côté de l'expéditeur avec l'espace opposé de 50 px,
 * jamais le fond indigo/accent. `expired` ne rend rien (`EmptyView`).
 * `veiled` ET `burned` gardent la bulle entière (fond, rayon, pied) et
 * enveloppent SEULEMENT citation/pièces-jointes/texte/panneau secondaire —
 * jamais la bande de reprise d'un envoi échoué (`:131-145` reste HORS voile).
 * `burned` REJOINT `veiled` : c'est `ThemedMessageBubble.swift:305-324`
 * exactement (`.burned where !isRevealed → BubbleBurnedView`, sinon le
 * contenu) — la bulle iOS montre déjà le contenu PENDANT la fenêtre de
 * révélation et ne bascule sur `BubbleBurnedView` qu'une fois éteinte.
 * Le pied N'AFFICHE `PrismPastille`/`Flags` QUE quand `mountsBottomLine(...)`
 * l'autorise (critère c, #5676 — la bulle APPELLE enfin la loi du pied
 * qu'elle ignorait) : un message voilé ne montre plus JAMAIS sa langue
 * d'origine en clair.
 */

export function Bubble({
  place,
  languages,
  isGrouped,
  viewerId,
  localDelivery,
  sendStartedAt,
  sendFailureReason,
  onRetry,
  onJumpToMessage,
  onOpenStory,
  highlighted = false,
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
  place: PlacedMessage;
  languages: readonly string[];
  isGrouped: boolean;
  viewerId: string;
  /** Traduire (#5814) — une langue IMPOSÉE au rang 0 du Prisme, `undefined`
   * ⇒ la résolution ordinaire (`languages`) décide seule. */
  displayLanguage?: string;
  /**
   * LE GESTE QUI POSE `displayLanguage` (revue #5814, défaut majeur 12) —
   * même contrat que `focal-row.tsx` : le pied de la bulle (pastille +
   * drapeaux) appelle CE prop, la MÊME loi que le sous-menu « Traduire » du
   * menu du message (`useMessageMenu.onPickLanguage`), jamais une
   * révélation locale divergente. Fourni TOUJOURS par l'hôte en production.
   */
  onPickLanguage?: (code: string) => void;
  /** Les emojis que CE lecteur a posés sur CE message — marque `ReactionChip
   * mine` (#5814, T12). */
  myReactions?: readonly string[];
  /** Retire une réaction MIENNE en tapant sa capsule (#5865) — jamais câblé
   * sur une capsule d'autrui (`ReactionChip`, `onToggle`). `undefined` ⇒ la
   * capsule reste un `<span>` inerte (loi 4 : pas de bouton qui promet un
   * effet qu'il n'a pas). */
  onReact?: (emoji: string) => void;
  /** Mode sélection ACTIF (`undefined` hors sélection). */
  selected?: boolean;
  /** VA AVEC `selected` — sans elle la coche serait INERTE (loi 4).
   * Prend l'id : référence STABLE chez l'hôte, `memo` préservé. */
  onToggleSelect?: (messageId: string) => void;
  /** L'opinion de CE client sur l'envoi, tant que le transport n'a pas tranché. */
  localDelivery?: LocalDelivery;
  /** Epoch ms du début de la tentative en cours — l'horloge des 200 ms
   * (§5 étape 9 de la spécification #5813). */
  sendStartedAt?: number;
  /** LA CAUSE de l'échec, en clair (`sendFailureReason`) — portée par la
   * bande elle-même : `lastError` était capturé et lu par PERSONNE. */
  sendFailureReason?: string;
  onRetry?: () => void;
  /** Saute au message cité (#5566 défaut 10 : le bouton de citation ne faisait rien). */
  onJumpToMessage: (messageId: string) => void;
  /** Ouvre la story citée (#5936) — voir `focal-row.tsx`, même contrat. */
  onOpenStory?: (messageId: string) => void;
  /** Mis en évidence brièvement après un saut de citation. */
  highlighted?: boolean;
  /** FORCÉ par l'hôte quand `EphemeralBadge.onExpired` s'est déclenché pour CE message. */
  expired?: boolean;
  /** Consomme une vue unique (D-10, `lib/api/view-once.ts`). */
  onConsumeViewOnce?: (messageId: string) => Promise<boolean>;
  onEphemeralExpired?: (messageId: string) => void;
  /** Horloge injectable — jamais `Date.now()` lu directement. */
  now?: () => number;
}) {
  const { message, tail } = place;
  const nowMs = now();
  const kind = expired ? 'expired' : protectionOf(message, nowMs);
  const isMine = isMineOf(message, viewerId);
  /** L'accusé QUE CETTE PEAU A LE DROIT DE PEINDRE — `null` ⇒ rien
   * (`lib/view/message.ts`, site unique partagé avec `FocalRow`). */
  const checkStatus = checkStatusOf(message, localDelivery);

  if (kind === 'expired') return null;

  /**
   * LA RANGÉE SYSTÈME (#5936) — testée AVANT la protection, comme la
   * rangée plate : `BubbleSystemViews.swift`, capsule CENTRÉE, AUCUNE
   * `.rounded-bubble`, aucun pied.
   */
  const systemRow = systemRowOf(message);
  if (systemRow !== null) {
    return (
      <div data-message={message.id} style={{ marginBottom: tail ? 6 : 2 }}>
        <SystemNotice row={systemRow} timeString={time(message.createdAt)} surface="bubble" />
      </div>
    );
  }

  /**
   * `deleted` SEUL prend la vue à part, SANS bulle. `burned` REJOINT
   * `veiled` plus bas — c'est exactement `ThemedMessageBubble.swift:305-324`
   * (`.burned where !blurController.isRevealed → BubbleBurnedView`, SINON le
   * contenu standard) : la bulle iOS montre déjà le contenu PENDANT la
   * fenêtre de révélation et ne bascule sur le tombstone qu'une fois la
   * fenêtre éteinte. Router `burned` ici COUPERAIT cette fenêtre à l'instant
   * même où la consommation serveur répond — avant les 5 s payées par le
   * lecteur (D-23 §1.4 point 4).
   */
  if (kind === 'deleted') {
    return (
      <div data-message={message.id} style={{ marginBottom: tail ? 6 : 2 }}>
        <ProtectionNotice kind={kind} surface="bubble" isMine={isMine} />
      </div>
    );
  }

  // Texte ET pistes AUDIO traduites (#5805) — miroir `BubbleContentBuilder
  // .buildAvailableFlags(translations:translatedAudios:)` (`:365-395`) : un
  // vocal traduit SANS traduction texte monte lui aussi la bande de drapeaux,
  // une image dont seul l'`alt` est traduit ne la monte PAS (revue #5805).
  const translatedLanguages = translatedLanguagesOf(message);
  /** `displayLanguage` est une INSERTION au rang 0 (#5814) — UN résolveur
   * (`resolvePrismTranslation`, D-14), jamais un second, et depuis la revue
   * #5805 UNE SEULE composition : `prismFor` (`api/prism.ts`) est le site
   * unique de l'insertion, que ce ternaire recopiait pour la quatrième fois. */
  const preferredLanguages = prismFor({ readerLanguages: languages, displayLanguage });
  const rendered = served({
    preferredLanguages,
    originalLanguage: message.originalLanguage,
    translations: message.translations,
    original: message.content,
  });
  /** LA RÉSOLUTION NATURELLE, SANS `displayLanguage` — voir `focal-row.tsx`,
   * même correction, même raison : `PrismPastille` ne doit pas se démonter
   * en réponse au clic qui vient de le presser. */
  const naturalServed = served({
    preferredLanguages: languages,
    originalLanguage: message.originalLanguage,
    translations: message.translations,
    original: message.content,
  });
  const naturalServedLanguage = servedRowLanguage({
    served: naturalServed,
    preferredLanguages: languages,
    attachments: message.attachments,
    fallbackLanguage: message.originalLanguage,
  });

  /**
   * L'identite ne se montre QUE : en groupe, en reception, et sur la QUEUE
   * d'une suite. Trois conditions, et c'est la troisieme qu'on oublie —
   * l'afficher sur la tete donnerait un fil visuellement juste mais different
   * d'iOS a chaque suite de deux messages.
   */
  const showsIdentity = isGrouped && !isMine && tail;

  // `kind === 'veiled' | 'burned'` toutes deux passent par `ProtectedContent`.
  const isProtected = kind !== 'standard';
  /** LA LANGUE ACTIVE DU PIED (revue #5814, défaut majeur 12) — la langue
   * RÉELLEMENT servie par la rangée, jamais un état local. `servedRowLanguage`
   * (revue #5805) et non `rendered.language` : sur un message MÉDIA-SEUL le
   * texte est vide, donc `rendered.language` vaut l'originale alors que la
   * transcription à l'écran, elle, est traduite — la bande proposait alors
   * la langue DÉJÀ servie, un contrôle sans effet. */
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

  const reactions = reactionEntries(message.reactionSummary);
  const ephemeral = ephemeralOf(message.expiresAt, nowMs);

  /**
   * LES BADGES DE TÊTE, LE CORPS ET LA STORY CITÉE (#5936) — `badgesOf`
   * porte l'ORDRE complet (l'éphémère et « modifié » restent
   * `EphemeralBadge`/`EditedMark`, chacun à sa place) ; `bodyKindOf` décide
   * sticker → emoji seul → texte ; un sticker ou un emoji seul n'a AUCUNE
   * `.rounded-bubble` (`bareBody`, BSL:998-1011 / `BubbleSticker.swift:9-11`).
   *
   * `ephemeralBadge`/`isEdited` LISENT CETTE SORTIE (revue-correction #5936,
   * défaut majeur 1) — voir le même doc-comment côté `focal-row.tsx`.
   */
  const badges = badgesOf(message, nowMs);
  const ephemeralBadge = ephemeralBadgeOf(badges);
  const isEdited = editedOf(badges);
  const storyCitation = storyCitationOf(message);
  const sharedPlace = placeOf(message);
  const body = bodyKindOf(message);
  const bareBody = body.kind === 'sticker' || body.kind === 'emoji-only';

  /** LE PIED — la loi (D-23, #5676) : jamais de drapeau en clair sur un message voilé, un seul jeu par suite. */
  const showsBottomLine = mountsBottomLine({
    hasTranslation: translatedLanguages.length > 0,
    isVeiled: isProtected,
    isLastInGroup: tail,
    hasReactions: reactions.length > 0,
  });

  const receivedBg = 'color-mix(in srgb, var(--accent) var(--ios-bubble-other-opacity), transparent)';
  const receivedHairline = 'color-mix(in srgb, var(--accent) var(--ios-bubble-other-hairline-opacity), transparent)';

  const contentBlock = (
    <>
      {/* La story citée REMPLACE la citation ordinaire — « une scène ne
          tient pas dans une bulle » : elle vit HORS de la boîte (voir plus
          bas, juste sous les badges), donc ni l'une ni l'autre ici. */}
      {storyCitation === null && message.replyTo ? (
        <Quote quote={message.replyTo} isMine={isMine} onJump={() => onJumpToMessage(message.replyTo!.id)} />
      ) : null}
      {/* « MODIFIÉ » — INLINE dans le corps, entre la citation et le texte
          (#5936, `BubbleStandardLayout.swift:1064-1066`). `EditedMark` porte
          déjà `aria-hidden` (revue-correction #5936, défaut majeur 8) : le
          mot est dans `rowLabel`, il ne se prononce pas une seconde fois. */}
      {isEdited ? <EditedMark onBrandBubble={isMine && !bareBody} /> : null}
      {message.attachments && body.kind !== 'sticker' ? (
        <Attachments
          attachments={message.attachments}
          languages={languages}
          fallbackLanguage={message.originalLanguage}
          {...(displayLanguage !== undefined ? { displayLanguage } : {})}
        />
      ) : null}
      {/* Le lieu est HÉBERGÉ dans la boîte (`BubbleContentBuilder.swift:134-137`). */}
      {sharedPlace !== null ? <LocationCard place={sharedPlace} accent="var(--accent)" /> : null}

      {body.kind === 'sticker' ? (
        <StickerArtwork sticker={body.sticker} picture={body.picture} side={BUBBLE_STICKER_SIDE} />
      ) : body.kind === 'emoji-only' ? (
        <EmojiOnly text={body.text} fontSize={body.fontSize} />
      ) : rendered.text ? (
        /* Le contenu AFFICHE est deja la traduction preferee, rendu
           exactement comme du contenu natif — ni encadre, ni italique, ni
           annonce. C'est le Prisme : la traduction ne se signale que par
           la pastille du pied. `lang` porte la langue REELLEMENT servie,
           pour que la synthese vocale la prononce juste. */
        <p className="text-bubble leading-[1.35] whitespace-pre-wrap" lang={rendered.language}>
          {rendered.text}
        </p>
      ) : null}
    </>
  );

  const protectedContentBlock = isProtected ? (
    <ProtectedContent
      messageId={message.id}
      kind={kind}
      isViewOnce={message.isViewOnce}
      contentLength={message.content.length}
      attachmentCount={message.attachments?.length ?? 0}
      surface="bubble"
      isMine={isMine}
      onConsumeViewOnce={onConsumeViewOnce}
      now={now}
    >
      {contentBlock}
    </ProtectedContent>
  ) : (
    contentBlock
  );

  return (
    <div
      data-message={message.id}
      /* PAS d'`aria-selected` ICI (revue #5814) — invalide sur un `div` sans
         rôle, et doublé par l'hôte. L'état vit sur la COCHE (`role="checkbox"`
         + `aria-checked`), qui est aussi le chemin CLAVIER. */
      className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
      /* L'espacement vertical DEPEND de la place dans le groupe : 6 px en
         queue, 2 px au milieu. C'est ce qui fait lire une suite comme un
         bloc plutot que comme des messages independants. */
      style={{ marginBottom: tail ? 6 : 2 }}
    >
      <div
        className="relative max-w-[70%] min-w-0"
        style={{ marginInlineStart: isMine ? 50 : 0, marginInlineEnd: isMine ? 0 : 50 }}
      >
        {/* LA COCHE DE SÉLECTION (#5814, question 5) — DANS la gouttière de
            50 px que `marginInlineStart/End` réserve juste au-dessus, jamais
            en dehors (revue #5814 : la première écriture la posait « du côté
            opposé à l'espace réservé », c'est-à-dire en DÉBORD du fil, là où
            rien ne garantit qu'elle tienne à l'écran). Pour un message ENVOYÉ
            la gouttière est à gauche (`marginInlineStart: 50`), pour un
            message REÇU elle est à droite (`marginInlineEnd: 50`).
            `role="checkbox"` réel : un contrôle qui a un effet, atteignable au
            clavier, dont l'état est LU par un lecteur d'écran. */}
        {selected !== undefined ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect?.(message.id);
            }}
            className="absolute grid place-items-center"
            style={{ top: -2, [isMine ? 'left' : 'right']: -46, width: 44, minHeight: 44 }}
          >
            <span
              aria-hidden
              className="grid place-items-center rounded-full"
              style={{
                width: 20,
                height: 20,
                border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--color-ios-ink-3)'}`,
                backgroundColor: selected ? 'var(--accent)' : 'transparent',
                color: 'white',
                fontSize: 11,
              }}
            >
              {selected ? '✓' : null}
            </span>
            <span className="offscreen">Sélectionner ce message</span>
          </button>
        ) : null}
        {/* LES BADGES DE TÊTE (#5936) — AU-DESSUS de la bulle, HORS du fond
            coloré, alignés du côté de la bulle (`BubbleStandardLayout
            .swift:522-541`). */}
        <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
          <Badges badges={badges} />
        </div>

        {/* LE BADGE ÉPHÉMÈRE — AU-DESSUS de la bulle, HORS du fond coloré
            (`BubbleStandardLayout.swift:543-550`). Aligné du côté de la bulle. */}
        {ephemeral.state === 'running' && ephemeralBadge !== undefined ? (
          <div className={`mb-1 flex ${isMine ? 'justify-end' : 'justify-start'}`}>
            <EphemeralBadge
              expiresAt={ephemeralBadge.expiresAt}
              now={now}
              onExpired={() => onEphemeralExpired?.(message.id)}
            />
          </div>
        ) : null}

        {/* LA STORY CITÉE — HORS de la boîte colorée (« une scène ne tient
            pas dans une bulle », `BubbleStandardLayout.swift:557-565`). */}
        {storyCitation !== null ? (
          <div className={`mb-1 flex ${isMine ? 'justify-end' : 'justify-start'}`}>
            <StoryCitationCard
              citation={storyCitation}
              accent="var(--accent)"
              now={new Date(nowMs)}
              {...(onOpenStory === undefined ? {} : { onOpen: onOpenStory })}
            />
          </div>
        ) : null}

        {bareBody ? (
          /* UN STICKER OU UN EMOJI SEUL N'A NI FOND, NI COIN, NI BORDURE
             (#5936, `BubbleSticker.swift:9-11`, `BubbleStandardLayout
             .swift:998-1011` pour l'emoji) : le pied compact (heure +
             accusé) se pose À CÔTÉ de l'artwork, jamais dans une boîte.
             LA BANDE DE REPRISE — HORS voile (D-23) — n'a ICI aucun fond
             indigo à côté duquel se lire : `textColor` reste l'erreur, comme
             la rangée plate (`focal-row.tsx`), jamais le blanc réservé à la
             boîte colorée. */
          <>
            {localDelivery === 'failed' ? (
              <FailedSendBand
                {...(sendFailureReason === undefined ? {} : { reason: sendFailureReason })}
                {...(onRetry === undefined ? {} : { onRetry })}
                textColor="var(--color-error)"
              />
            ) : null}
            <div className={`flex items-end gap-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
              {protectedContentBlock}
              <div
                className="flex items-center gap-1 pb-0.5"
                /* LA MÉTA NEUTRE, QUEL QUE SOIT L'EXPÉDITEUR — `BubbleFooter
                   .compactMetaColor` (`:62-66`) le dit mot pour mot : « le
                   compact footer s'affiche TOUJOURS hors d'une bulle
                   (free-floating emoji), donc on n'a pas de fond brand à
                   contraster ». `--color-meta-mine` vaut `white 70%` (dérivée
                   de `BubbleFooter.swift:283`, `ios.css:99`) : posée ICI, sur
                   le fond de conversation d'un schéma CLAIR, elle rendait
                   l'heure d'un emoji ou d'un sticker ENVOYÉ illisible —
                   mesuré 1,3:1 (revue-correction #5936). */
                style={{ color: 'var(--color-meta)' }}
              >
                <time
                  className="text-time font-medium tabular-nums"
                  dateTime={new Date(message.createdAt).toISOString()}
                >
                  {time(message.createdAt)}
                </time>
                {checkStatus === null ? null : (
                  <Check
                    status={checkStatus}
                    isMine={isMine}
                    {...(sendStartedAt === undefined ? {} : { sendStartedAt })}
                  />
                )}
              </div>
            </div>
          </>
        ) : (
          <div
            className="rounded-bubble px-3.5 py-2.5 transition-shadow duration-500"
            style={{
              ...(isMine
                ? { backgroundColor: 'var(--color-bubble-mine)', color: 'white' }
                : { backgroundColor: receivedBg, border: `1px solid ${receivedHairline}`, color: 'var(--color-ios-ink)' }),
              /* Mise en évidence temporaire après un saut de citation — un
                 anneau plutôt qu'un fond, pour ne jamais menacer le contraste
                 du texte qu'il entoure (#5566 défaut 10). */
              boxShadow: highlighted ? '0 0 0 2.5px var(--accent)' : 'none',
            }}
          >
            {/*
              LA BANDE DE REPRISE EST **DANS** LA BULLE, pas sous le fil —
              c'est le parti d'iOS : un bandeau global dirait « un envoi a
              échoué » sans dire LEQUEL. HORS VOILE (D-23) : un échec se voit
              même sur un message protégé.
            */}
            {localDelivery === 'failed' ? (
              <FailedSendBand
                {...(sendFailureReason === undefined ? {} : { reason: sendFailureReason })}
                {...(onRetry === undefined ? {} : { onRetry })}
                textColor={isMine ? 'white' : 'var(--color-error)'}
              />
            ) : null}

            {protectedContentBlock}

            <div
              className={`flex items-start gap-2 ${showsIdentity ? 'pt-2' : 'pt-1'}`}
              style={{ color: isMine ? 'var(--color-meta-mine)' : 'var(--color-meta)' }}
            >
              {showsIdentity ? (
                <Avatar
                  initials={initialsOf(message.sender?.displayName ?? '')}
                  color="var(--accent)"
                  size={32}
                  name={message.sender?.displayName ?? ''}
                  /* `nowMs`, jamais `Date.now()` — l'horloge de cette bulle est
                     INJECTABLE (prop `now`, ci-dessus) et `presenceOf` prend la
                     sienne en paramètre précisément pour que la loi 1/3/5 se
                     mesure sans dépendre de l'horloge réelle (revue #5935). */
                  presence={presenceOf(message.sender, nowMs)}
                />
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {showsIdentity ? (
                  <span className="text-title font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
                    {message.sender?.displayName ?? ''}
                  </span>
                ) : null}
                <div className="flex items-center gap-1">
                  {/* PrismPastille/Flags N'APPARAISSENT QUE quand la loi du pied
                      l'autorise (D-23, critère c) — la bulle IGNORAIT cette loi
                      avant ce lot et rendait ces contrôles sur CHAQUE message,
                      voilé compris (`bulle.md` § 9 écart 5). */}
                  {showsBottomLine ? (
                    <>
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
                      />
                    </>
                  ) : null}
                  <span className="flex-1" />
                  <time
                    className="text-time font-medium tabular-nums"
                    dateTime={new Date(message.createdAt).toISOString()}
                  >
                    {time(message.createdAt)}
                  </time>
                  {/* `checkStatusOf` et non `deliveryOf` (revue-correction #5813) :
                      `null` sur un envoi ÉCHOUÉ, dont la bande dit déjà « Non
                      envoyé ». Peindre là la coche « envoyé » (ce que
                      `deliveredCount: 0` produit) contredirait la bande à dix
                      pixels de distance, `title` compris. */}
                  {checkStatus === null ? null : (
                    <Check
                      status={checkStatus}
                      isMine={isMine}
                      {...(sendStartedAt === undefined ? {} : { sendStartedAt })}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {reactions.length > 0 ? (
          /* Les reactions se posent en DEBORD du coin bas, du cote OPPOSE au
             bord d'ecran : a moitie sous la bulle, a moitie dehors. Les
             centrer sous la bulle les ferait passer pour un contenu. */
          <div
            className={`absolute flex gap-1 ${isMine ? 'left-0 -translate-x-1' : 'right-0 translate-x-1'}`}
            style={{ bottom: -8 }}
          >
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
        ) : null}
      </div>
    </div>
  );
}
