import { useState } from 'react';

import type { Message, Attachment } from '@/lib/api/types';
import { kindOf, waveformOf } from '@/lib/view/message';
import type { Delivery } from '@/lib/view/message';
import { languageColor, flag, languageName } from '@/lib/languages';

import { Glyph } from './glyph';
import type { GlyphName } from './glyphs';

/**
 * LES BLOCS DE CONTENU D'UN MESSAGE — extraits de `bubble.tsx` (#5566, étape 0
 * de la spécification) pour que la rangée plate du Fil (`focal-row.tsx`) et la
 * bulle (`bubble.tsx`) rendent le MÊME contenu : citation, pièces jointes
 * (vocal, image, fichier), bande de langues et coche d'envoi.
 *
 * Deux PEAUX, un seul contenu — sans cette extraction, `focal-row.tsx`
 * deviendrait la jumelle de `bubble.tsx` sur exactement l'audio et les
 * langues (règle du dépôt : « UNE source de vérité, aucune jumelle
 * divergente »). Ce que ce fichier NE PORTE PAS : le rayon de bulle, le fond,
 * l'alignement gauche/droite — ça reste le métier de chaque peau.
 */

export const CHECKS: Record<Delivery, { readonly name: GlyphName; readonly size: number; readonly read: boolean } | null> = {
  pending: { name: 'clock', size: 10, read: false },
  sent: { name: 'check', size: 10, read: false },
  delivered: { name: 'checks', size: 10, read: false },
  read: { name: 'checks', size: 11, read: true },
};

export const STATUS_LABEL: Record<Delivery, string> = {
  pending: 'en cours d’envoi',
  sent: 'envoyé',
  delivered: 'remis',
  read: 'lu',
};

/**
 * LA PASTILLE DU PRISME — elle ne se montre QUE si le texte affiché est une
 * TRADUCTION (« la traduction ne se signale que par la pastille du pied ») et
 * elle a un EFFET : elle ouvre, et referme, le message dans sa langue
 * d'origine. Elle était rendue INCONDITIONNELLEMENT et sans `onClick` — donc
 * elle mentait deux fois : sur un message non traduit, et à chaque clic.
 *
 * Le geste double celui du premier drapeau du pied, et c'est voulu :
 * l'exploration de l'original est l'affordance DISCRÈTE du Prisme, le pied
 * étant l'affordance EXHAUSTIVE (toutes les langues servies).
 */
export function PrismPastille({
  servedLanguage,
  originalLanguage,
  active,
  onToggle,
}: {
  servedLanguage: string;
  originalLanguage: string;
  active: string | null;
  onToggle: () => void;
}) {
  if (servedLanguage === originalLanguage) return null;
  const isOpen = active === originalLanguage;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isOpen}
      aria-label={
        isOpen
          ? 'Masquer le message dans sa langue d’origine'
          : 'Afficher le message dans sa langue d’origine'
      }
      /* `tap-target-22` étend la zone TACTILE par un `::after` en débord
         (`app.css`) sans grandir le DESSIN — élargir visuellement ce bouton
         grandirait chaque message traduit. Défaut #5566 (revue, défaut 11
         puis défaut 1 de la revue-correction) : plein en VERTICAL (-11px,
         rien ne le dispute), borné en HORIZONTAL à la moitié du gap réel
         vers `Flags` (-2px) pour ne jamais voler le clic du premier drapeau —
         le geste PLEIN existe ailleurs (menu long-appui du message, hors
         périmètre de ce lot). */
      className="tap-target-22 grid size-[22px] place-items-center rounded-menu"
      style={{ color: isOpen ? languageColor(originalLanguage) : 'var(--color-i400)' }}
    >
      <Glyph name="translate" size={12} />
    </button>
  );
}

/**
 * `reactionSummary` est la forme DÉNORMALISÉE du serveur (`{ emoji: n }`) —
 * une seule lecture pour les DEUX peaux (bulle et rangée plate), sinon la
 * seconde oublie les réactions, ce qui est exactement arrivé.
 */
export function reactionEntries(
  summary: Message['reactionSummary'],
): readonly (readonly [string, number])[] {
  return Object.entries(summary ?? {});
}

/** UNE pilule de réaction — la bulle la pose en débord, la rangée plate en ligne basse. */
export function ReactionChip({ glyph, count }: { glyph: string; count: number }) {
  return (
    <span
      className="flex items-center gap-0.5 rounded-chip px-1.5 py-0.5 text-check"
      style={{ backgroundColor: 'var(--color-ios-card)', border: '1px solid var(--color-edge)' }}
    >
      <span aria-hidden>{glyph}</span>
      <span className="tabular-nums opacity-70">{count}</span>
      <span className="offscreen">
        {count} réaction{count > 1 ? 's' : ''} {glyph}
      </span>
    </span>
  );
}

export function Check({ status, isMine }: { status: Delivery; isMine: boolean }) {
  if (!isMine) return null;
  const check = CHECKS[status];
  if (!check) return null;
  return (
    <Glyph
      name={check.name}
      size={check.size}
      title={STATUS_LABEL[status]}
      {...(check.read ? { style: { color: 'var(--color-read)' } } : {})}
    />
  );
}

/**
 * La bande de drapeaux du pied — au plus `limit` (4 par défaut, la cote
 * historique de ce composant). La rangée ÉLUE du fil (#5648) passe
 * `FLAG_LIMIT_PLAIN` (3) sur sa ligne basse ordinaire et
 * `FLAG_LIMIT_MAGNIFIED` (5) sur sa bande de focus
 * (`FocalMetrics.FocusStrip.flagLimitPlain/.flagLimitMagnified`,
 * gardées par `scripts/check-curve.mjs`) — deux cotes iOS, un seul
 * composant.
 */
export function Flags({
  languages,
  active,
  onPick,
  limit = 4,
}: {
  languages: readonly string[];
  active: string | null;
  onPick: (code: string) => void;
  limit?: number;
}) {
  return (
    /* `gap-1` (4px) et non `gap-0.5` (2px, defaut 1 de la revue-correction
       #5566) : le debord horizontal de `tap-target-22` (`app.css`) se borne a
       la MOITIE du gap reel pour ne jamais franchir la boite d'un voisin —
       avec 2px de gap la borne (1px) etait trop maigre pour offrir un
       agrandissement horizontal utile ; unifiee sur 4px (le meme gap que le
       conteneur pastille+drapeaux dans `bubble.tsx`/`focal-row.tsx`), elle
       porte -2px de chaque cote sans jamais se recouvrir. */
    <span className="flex items-center gap-1">
      {languages.slice(0, limit).map((code) => {
        const isActive = code === active;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onPick(code)}
            aria-pressed={isActive}
            /* 22 px de DESSIN et non 44 : elargir cette cible grandirait
               CHAQUE bulle traduite. `tap-target-22` (`app.css`) etend la
               zone TACTILE par un `::after` en debord, sans toucher au
               layout — plein en vertical, borne en horizontal a la moitie
               du gap de 4px vers les freres (pastille et drapeaux voisins,
               defaut 1 de la revue-correction #5566) pour qu'aucun drapeau
               ne vole jamais le clic de son voisin. La compensation par un
               second geste a taille pleine ailleurs (menu « Plus »)
               N'EXISTE PAS dans ce depot (mesure, revue #5566 defaut 11) :
               cette classe est desormais la SEULE compensation, et elle est
               reelle — sans jamais deborder sur autrui. */
            className="tap-target-22 grid size-[22px] place-items-center rounded-menu leading-none transition-colors"
            title={languageName(code)}
          >
            <span className="flex flex-col items-center gap-px">
              <span style={{ fontSize: isActive ? 12 : 11 }}>{flag(code)}</span>
              <span
                className="block rounded-full"
                style={{
                  width: 10,
                  height: 1.5,
                  backgroundColor: isActive ? languageColor(code) : 'transparent',
                }}
              />
            </span>
          </button>
        );
      })}
    </span>
  );
}

/** Le panneau qui s'ouvre SOUS le texte quand on tape un drapeau. */
export function SecondaryText({ code, text, isMine }: { code: string; text: string; isMine: boolean }) {
  const color = languageColor(code);
  return (
    <div className="pt-2">
      <div className="flex items-center gap-1.5" aria-hidden>
        <span className="h-px flex-1" style={{ backgroundColor: `color-mix(in srgb, ${color} 40%, transparent)` }} />
        <span className="size-1 rounded-full" style={{ backgroundColor: color }} />
        <span className="h-px flex-1" style={{ backgroundColor: `color-mix(in srgb, ${color} 40%, transparent)` }} />
      </div>
      <div
        className="mt-2 rounded-menu px-2 py-2"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
      >
        <p className="flex items-center gap-1.5 text-mini font-semibold" style={{ color: color }}>
          <span>{flag(code)}</span>
          <span>{languageName(code)}</span>
        </p>
        <p
          className="mt-1 text-title"
          lang={code}
          style={{ color: isMine ? 'color-mix(in srgb, white 85%, transparent)' : 'var(--color-ios-ink-2)' }}
        >
          {text}
        </p>
      </div>
    </div>
  );
}

export function Quote({
  quote,
  isMine,
  onJump,
}: {
  quote: NonNullable<Message['replyTo']>;
  isMine: boolean;
  /**
   * SAUTE au message cité et le met en évidence — absent QUE lorsque l'hôte
   * n'a pas encore la liste complète des messages à portée (rare, jamais le
   * cas courant du fil). Le bouton promet une navigation par son nom
   * accessible : sans `onJump`, cette promesse serait fausse — donc câbler
   * cette prop est OBLIGATOIRE chez tout hôte du fil (`focal-row.tsx`,
   * `bubble.tsx`).
   */
  onJump: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onJump}
      className="mb-1.5 flex w-full rounded-quote text-left"
      style={{ backgroundColor: isMine ? 'var(--color-quote-mine)' : 'var(--color-quote)' }}
      aria-label={`Aller au message de ${quote.sender?.displayName ?? 'l’expéditeur'}`}
    >
      <span
        className="w-1 shrink-0 rounded-full"
        style={{
          backgroundColor: isMine ? 'color-mix(in srgb, white 70%, transparent)' : 'var(--accent)',
        }}
        aria-hidden
      />
      {/* Le nom et le texte cite COULENT DANS LE MEME PARAGRAPHE (directive
          iOS #5103) : deux lignes separees feraient de la citation un bloc
          aussi haut que le message, et c'est le message qu'on vient lire. */}
      <span className="min-w-0 py-2 pr-2.5 pl-2 text-title">
        <span className="font-semibold" style={{ color: isMine ? 'white' : 'var(--accent)' }}>
          {quote.sender?.displayName ?? ''}{' '}
        </span>
        <span className="line-clamp-2" style={{ color: isMine ? 'var(--color-meta-mine)' : 'var(--color-ios-ink-2)' }}>
          {quote.content}
        </span>
      </span>
    </button>
  );
}

export function Voice({ attachment }: { attachment: Attachment }) {
  const [playing, setPlaying] = useState(false);
  const waves = waveformOf(attachment);
  // `duration` voyage en MILLISECONDES sur la charge du dépôt.
  const seconds = Math.round((attachment.duration ?? 0) / 1000);
  return (
    <div className="flex items-center gap-2.5 py-1">
      <button
        type="button"
        onClick={() => setPlaying((v) => !v)}
        /* `tap-target-34` (`app.css`) porte la zone tactile de ce bouton de
           34 px de dessin a 44x44, meme dispositif que `tap-target-22`. */
        className="tap-target-34 grid size-[34px] shrink-0 place-items-center rounded-chip"
        style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, transparent))' }}
        aria-label={playing ? 'Mettre en pause' : 'Lire le message vocal'}
      >
        <Glyph name="fillPlay" size={13} className="text-white" />
      </button>
      {/* La forme d'onde est DÉRIVÉE de l'identifiant de la pièce, donc stable
          et honnête : la passerelle n'en sert pas encore. Côté iOS elle est
          réelle (48 barres) et sa silhouette sert à repérer un passage à
          l'oreille — c'est ce qu'il faudra servir ici aussi. */}
      <span className="flex h-6 flex-1 items-center gap-px" aria-hidden>
        {waves.map((h, i) => (
          <span
            key={i}
            className="flex-1 rounded-full"
            style={{
              height: `${Math.max(12, h * 4)}%`,
              backgroundColor: 'currentColor',
              opacity: playing && i < waves.length / 3 ? 1 : 0.45,
            }}
          />
        ))}
      </span>
      <span className="shrink-0 text-time tabular-nums">
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
      </span>
    </div>
  );
}

export function Attachments({ attachments }: { attachments: readonly Attachment[] }) {
  return (
    <>
      {attachments.map((attachment, i) => {
        const kind = kindOf(attachment);
        if (kind === 'audio') return <Voice key={i} attachment={attachment} />;
        if (kind === 'image') {
          return (
            <div
              key={i}
              /* 300 x 240 pour une image seule, rayon 16 — la grille iOS.
                 `aspect-ratio` tient la place AVANT que l'image arrive : c'est
                 la moitie du CLS sur un reseau lent. */
              className="grid max-w-[300px] place-items-center overflow-hidden rounded-card bg-black/40"
              style={{ aspectRatio: '300 / 240' }}
              role="img"
              aria-label={attachment.alt ?? attachment.originalName}
            >
              <Glyph name="image" size={40} className="opacity-40" />
            </div>
          );
        }
        if (kind === 'file') {
          return (
            <div key={i} className="flex items-center gap-2 py-1">
              <Glyph name="file" size={24} />
              <span className="min-w-0 flex-1 truncate text-title">{attachment.originalName}</span>
              <span className="text-time opacity-70">{Math.round(attachment.fileSize / 1024)} Ko</span>
            </div>
          );
        }
        return null;
      })}
    </>
  );
}
