import { memo, useState } from 'react';

import { deliveryOf, isMineOf, translationsOf } from '@/lib/view/message';
import type { LocalDelivery } from '@/lib/view/message';
import { initialsOf } from '@/lib/view/conversation';
import { served } from '@/lib/api/prism';
import type { PlacedMessage } from '@/lib/grouping';
import { time } from '@/lib/grouping';
import type { FlatRowMode } from '@/lib/reading-mode/decision';
import { mountsBottomLine } from '@/lib/reading-mode/meta';
import {
  AVATAR_SIZE,
  FLAG_LIMIT_PLAIN,
  GROUP_TOP_PADDING,
  META_TEXT_OPACITY,
  ROW_PADDING_HORIZONTAL,
  ROW_PADDING_VERTICAL,
  TEXT_INDENT,
} from '@/lib/reading-mode/metrics';

import { Avatar } from './avatar';
import { Glyph } from './glyph';
import { FocusCard, FocusIdentity, FocusStamp, FocusStrip } from './focal-focus-overlays';
import {
  Attachments,
  Check,
  Flags,
  PrismPastille,
  Quote,
  ReactionChip,
  SecondaryText,
  reactionEntries,
} from './message-blocks';

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
 */
export const FocalRow = memo(function FocalRow({
  mode,
  place,
  languages,
  viewerId,
  localDelivery,
  onRetry,
  onJumpToMessage,
  highlighted = false,
  elected = false,
}: {
  mode: FlatRowMode;
  place: PlacedMessage;
  languages: readonly string[];
  viewerId: string;
  /** L'opinion de CE client sur l'envoi, tant que le transport n'a pas tranché. */
  localDelivery?: LocalDelivery;
  onRetry?: () => void;
  /** Saute au message cité (défaut #5566 défaut 10 : le bouton ne faisait rien). */
  onJumpToMessage: (messageId: string) => void;
  /** Mis en évidence brièvement après un saut de citation. */
  highlighted?: boolean;
  /** Élue par la scène du fil (`reading-mode/scene.ts`) — Focal seul, jamais Script. */
  elected?: boolean;
}) {
  const { message, head, tail } = place;
  const isMine = isMineOf(message, viewerId);
  const [openLanguage, setOpenLanguage] = useState<string | null>(null);

  const translations = translationsOf(message);
  const rendered = served({
    preferredLanguages: languages,
    originalLanguage: message.originalLanguage,
    translations: message.translations,
    original: message.content,
  });

  const footerLanguages = [...new Set([message.originalLanguage, ...translations.map((t) => t.language)])];
  const secondary =
    openLanguage === null
      ? null
      : openLanguage === message.originalLanguage
        ? message.content
        : (translations.find((t) => t.language === openLanguage)?.text ?? null);

  // Le viewer n'a pas toujours de `sender` peuplé sur ses propres messages
  // (fixture, charge socket allégée) — « Vous » comble l'identité, jamais un
  // nom vide en tête de groupe.
  const senderName = message.sender?.displayName ?? (isMine ? 'Vous' : '');
  const reactions = reactionEntries(message.reactionSummary);

  /**
   * LA LIGNE BASSE — miroir de `FocalMetaColumn.mountsBottomLine` (défaut 7) :
   * elle ne monte plus systématiquement, seulement si elle a quelque chose à
   * dire (un jeu de drapeaux SUR LE DERNIER message d'un groupe traduit et
   * non voilé, ou une réaction). `hasTranslation` porte sur CE message —
   * indépendamment de l'exploration en cours (`openLanguage`) : la loi ne
   * connaît que la donnée, jamais l'état d'un panneau ouvert.
   */
  const showsBottomLine = mountsBottomLine({
    hasTranslation: translations.length > 0,
    isBlurred: message.isBlurred,
    isLastInGroup: tail,
    hasReactions: reactions.length > 0,
  });

  const delivery = localDelivery === 'pending' ? 'pending' : deliveryOf(message);

  // Le tampon n'est calculé QUE quand il est rendu (§5.6 de la spécification
  // #5648) — cette rangée ne re-rend que sur un changement de `elected`
  // (`memo`), donc `new Date()` ici ne tourne pas à chaque frame de la scène.
  const now = elected ? new Date() : null;

  return (
    <div
      data-reading-mode={mode}
      data-elected={elected ? 'true' : undefined}
      className="grid transition-colors duration-500"
      style={{
        gridTemplateColumns: `${TEXT_INDENT}px 1fr`,
        paddingInline: ROW_PADDING_HORIZONTAL,
        paddingBlockStart: head ? GROUP_TOP_PADDING : ROW_PADDING_VERTICAL,
        paddingBlockEnd: ROW_PADDING_VERTICAL,
        borderRadius: 10,
        backgroundColor: highlighted
          ? 'color-mix(in srgb, var(--accent) 22%, transparent)'
          : 'transparent',
      }}
    >
      {/* L'AVATAR DE LA TÊTE DE GROUPE — s'EFFACE en focus, comme le nom
          juste à côté : côté iOS l'en-tête d'identité ENTIER (avatar + nom)
          passe à `opacity: 0` (`FocalRow.swift:269`) et `focusIdentityChip`
          le REMPLACE à la même place. Le laisser visible peignait DEUX
          pastilles et DEUX noms sur la même rangée (mesuré sur
          `thread-focal-scene.dark.png`, correction de revue #5648). */}
      <div className="flex justify-center pt-0.5" style={{ opacity: elected ? 0 : 1 }}>
        {head ? <Avatar initials={initialsOf(senderName)} color="var(--accent)" size={AVATAR_SIZE} /> : null}
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
          <FocusIdentity initials={initialsOf(senderName)} name={senderName} accent="var(--accent)" />
        ) : null}

        {head ? (
          /* TÊTE DE GROUPE : l'IDENTITÉ seule (défaut 6) — « cet en-tête ne
             date plus rien » (iOS, `FocalIdentityHeader.swift:13-18`).
             L'heure vit désormais dans la colonne méta, accolée à CHAQUE
             rangée, tête comme continuation. S'EFFACE en focus (:269) —
             `FocusIdentity` la remplace en overlay. */
          <div className="pb-0.5" style={{ opacity: elected ? 0 : 1 }}>
            <span className="text-title font-extrabold" style={{ color: 'var(--color-ios-ink)' }}>
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
            {/* `isMine={false}` DÉLIBÉRÉMENT, et ce n'est pas un oubli : la peau
                « mine » de la citation est écrite pour le fond INDIGO de la bulle
                (nom en blanc, texte en blanc 70 %, filet blanc). La rangée plate
                n'a AUCUN fond — servie « mine », la citation d'un message à soi
                devenait du blanc sur du blanc en schéma clair, donc INVISIBLE
                (mesuré : contraste 1,0:1). Une peau ne se choisit pas sur
                l'expéditeur mais sur la SURFACE qui la porte. */}
            {message.replyTo ? (
              <Quote quote={message.replyTo} isMine={false} onJump={() => onJumpToMessage(message.replyTo!.id)} />
            ) : null}
            {message.attachments ? <Attachments attachments={message.attachments} /> : null}

            {/* La bande de reprise reste DANS la rangée du message concerné —
                même parti que la bulle (§ commentaire `bubble.tsx`). */}
            {localDelivery === 'failed' && onRetry !== undefined ? (
              <button
                type="button"
                onClick={onRetry}
                className="mb-1.5 flex w-full items-center gap-1.5 rounded-quote px-2 py-1.5 text-left text-check font-semibold"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-error) 18%, transparent)',
                  color: 'var(--color-error)',
                }}
              >
                <Glyph name="warningCircle" size={12} />
                <span className="flex-1">Non envoyé</span>
                <span style={{ textDecoration: 'underline' }}>Réessayer</span>
              </button>
            ) : null}

            {rendered.text ? (
              <p
                className="text-bubble leading-[1.35] whitespace-pre-wrap"
                lang={rendered.language}
                style={{ color: 'var(--color-ios-ink)' }}
              >
                {rendered.text}
              </p>
            ) : null}

            {openLanguage !== null && secondary !== null ? (
              <SecondaryText code={openLanguage} text={secondary} isMine={false} />
            ) : null}

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
                  servedLanguage={rendered.language}
                  originalLanguage={message.originalLanguage}
                  active={openLanguage}
                  onToggle={() =>
                    setOpenLanguage((v) => (v === message.originalLanguage ? null : message.originalLanguage))
                  }
                />
                <Flags
                  languages={footerLanguages}
                  active={openLanguage}
                  onPick={(code) => setOpenLanguage((v) => (v === code ? null : code))}
                  limit={FLAG_LIMIT_PLAIN}
                />
                {reactions.map(([glyph, count]) => (
                  <ReactionChip key={glyph} glyph={glyph} count={count} />
                ))}
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
            /* `opacity: 0` ne retire RIEN de l'arbre d'accessibilité : sans
               cette garde, la rangée élue annonçait son heure DEUX fois (la
               colonne méta masquée, puis `FocusStamp` qui la porte en clair
               avec sa date et son accusé). */
            aria-hidden={elected ? true : undefined}
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
            <Check status={delivery} isMine={isMine} />
          </div>

          {elected && now !== null ? (
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
                  servedLanguage={rendered.language}
                  originalLanguage={message.originalLanguage}
                  footerLanguages={footerLanguages}
                  active={openLanguage}
                  onToggleOriginal={() =>
                    setOpenLanguage((v) => (v === message.originalLanguage ? null : message.originalLanguage))
                  }
                  onPickLanguage={(code) => setOpenLanguage((v) => (v === code ? null : code))}
                  reactions={reactions}
                />
              ) : null}
              <FocusStamp
                sentAt={new Date(message.createdAt)}
                now={now}
                timeString={time(message.createdAt)}
                locale={languages[0] ?? 'fr'}
                delivery={delivery}
                isMine={isMine}
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
});
