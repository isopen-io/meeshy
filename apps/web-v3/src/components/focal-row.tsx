import { useState } from 'react';

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
  GROUP_TOP_PADDING,
  META_TEXT_OPACITY,
  ROW_PADDING_HORIZONTAL,
  ROW_PADDING_VERTICAL,
  TEXT_INDENT,
} from '@/lib/reading-mode/metrics';

import { Avatar } from './avatar';
import { Glyph } from './glyph';
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
 */
export function FocalRow({
  mode,
  place,
  languages,
  viewerId,
  localDelivery,
  onRetry,
  onJumpToMessage,
  highlighted = false,
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

  return (
    <div
      data-reading-mode={mode}
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
      <div className="flex justify-center pt-0.5">
        {head ? <Avatar initials={initialsOf(senderName)} color="var(--accent)" size={AVATAR_SIZE} /> : null}
      </div>

      <div className="min-w-0">
        {head ? (
          /* TÊTE DE GROUPE : l'IDENTITÉ seule (défaut 6) — « cet en-tête ne
             date plus rien » (iOS, `FocalIdentityHeader.swift:13-18`).
             L'heure vit désormais dans la colonne méta, accolée à CHAQUE
             rangée, tête comme continuation. */
          <div className="pb-0.5">
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
                sur un message sans rien à dire. */}
            {showsBottomLine ? (
              <div className="flex items-center gap-1 pt-1" style={{ color: 'var(--color-meta)' }}>
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
                />
                {reactions.map(([glyph, count]) => (
                  <ReactionChip key={glyph} glyph={glyph} count={count} />
                ))}
              </div>
            ) : null}
          </div>

          {/* LA COLONNE MÉTA — heure puis accusé, sur CHAQUE rangée (défaut
              6). `Check` est déjà silencieux (`isMine === false` ⇒ `null`) :
              une rangée reçue ne porte que l'heure. */}
          <div className="flex shrink-0 items-center gap-1 pb-0.5">
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
        </div>
      </div>
    </div>
  );
}
