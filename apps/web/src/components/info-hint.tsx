import { createContext, useContext, useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';

import { GlyphSvg, type GlyphShape } from './glyph';

/**
 * LE DÉTAIL DERRIÈRE UN (i) — UN composant pour tous les écrans d'entrée (#6441,
 * extrait par #6626).
 *
 * Directive porteur 2026-09-15 : « moins de détails sur la page de connexion et
 * d'enregistrement ; utiliser des (i) pour pouvoir informer sur le mode de
 * fonctionnement si naturellement ce n'est pas clair ». Le (i) vivait DANS
 * `Field` et, recopié à la main, sous le téléphone de l'inscription : la
 * connexion par e-mail en demande deux de plus HORS de tout champ (sous le
 * titre, et pendant l'attente). Une troisième et une quatrième copie auraient
 * dérivé au premier correctif — d'où ce site unique.
 *
 * DEUX morceaux et un état, parce que le bouton et la note ne vivent pas au même
 * endroit : le bouton se pose DANS le cadre d'un champ ou à côté d'un titre, la
 * note SOUS le bloc. `useInfoHint` tient l'identifiant qui les relie
 * (`aria-controls`) et l'état ouvert.
 *
 * **Replié ne veut pas dire absent.** La note reste dans le DOM en `sr-only` :
 * un champ la cite dans `aria-describedby`, et un lecteur d'écran l'entend sans
 * avoir à trouver le bouton.
 *
 * Le tracé vient de l'APPELANT, jamais d'un import ici — ce composant est au
 * socle, et le jeu d'écran qui porte `info` n'y entre pas (`extract-glyphs.mjs`).
 */

export type InfoHint = {
  readonly text: string;
  readonly glyph: GlyphShape;
  /** Le nom accessible du bouton — la QUESTION que la note répond
   * (« Comment ça marche », « Rien reçu ? »), jamais « Plus d'infos ». */
  readonly label: string;
};

export type InfoHintState = {
  readonly id: string;
  readonly isOpen: boolean;
  readonly toggle: () => void;
};

/**
 * UN SEUL (i) OUVERT PAR ÉCRAN (#17587, épure #17584). Un écran qui pose des
 * notes sur ses rangées et ses titres monte `InfoHintScope` : ouvrir une note
 * referme la précédente. Sans portée, chaque (i) garde son propre état — les
 * écrans d'entrée, qui n'en ont qu'un ou deux, n'ont rien à changer.
 */
type InfoHintScopeValue = {
  readonly openId: string | null;
  readonly setOpenId: (next: (current: string | null) => string | null) => void;
};

const InfoHintScopeContext = createContext<InfoHintScopeValue | null>(null);

export function InfoHintScope({ children }: { readonly children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return <InfoHintScopeContext.Provider value={{ openId, setOpenId }}>{children}</InfoHintScopeContext.Provider>;
}

/** `fixedId` sert l'hôte dont un champ cite la note par un identifiant ÉCRIT
 * (`aria-describedby="signup-phone-hint"`) ; sinon `useId`. Une note ouverte se
 * referme à Échap. */
export function useInfoHint(fixedId?: string): InfoHintState {
  const generatedId = useId();
  const id = fixedId ?? generatedId;
  const scope = useContext(InfoHintScopeContext);
  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = scope === null ? localOpen : scope.openId === id;
  const setOpen = (open: boolean): void => {
    if (scope === null) setLocalOpen(open);
    else scope.setOpenId((current) => (open ? id : current === id ? null : current));
  };
  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  });
  return { id, isOpen, toggle: () => setOpen(!isOpen) };
}

export function InfoHintButton({
  hint,
  state,
  showsLabel = false,
  style,
}: {
  readonly hint: InfoHint;
  readonly state: InfoHintState;
  /** Le libellé LU en plus du glyphe — pour un (i) posé seul, loin de tout
   * champ ou titre qui dirait de quoi il parle. */
  readonly showsLabel?: boolean;
  readonly style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={state.toggle}
      aria-expanded={state.isOpen}
      aria-controls={state.id}
      aria-label={hint.label}
      className={showsLabel ? 'inline-flex items-center gap-1.5 text-caption font-medium' : 'grid shrink-0 place-items-center rounded-full'}
      style={{ minWidth: 44, minHeight: 44, color: 'var(--color-ios-ink-3)', ...style }}
    >
      <GlyphSvg glyph={hint.glyph} size={18} />
      {showsLabel ? <span>{hint.label}</span> : null}
    </button>
  );
}

export function InfoHintText({
  hint,
  state,
  className,
  inline = false,
}: {
  readonly hint: InfoHint;
  readonly state: InfoHintState;
  readonly className?: string;
  /** Rendue en `span` bloc — pour une note posée dans une rangée dont le texte est déjà un `span`. */
  readonly inline?: boolean;
}) {
  const classes = ['text-caption', inline ? 'block' : undefined, state.isOpen ? undefined : 'sr-only', className].filter((part) => part !== undefined);
  const Tag = inline ? 'span' : 'p';
  return (
    <Tag id={state.id} className={classes.join(' ')} style={{ color: 'var(--color-ios-ink-2)' }}>
      {hint.text}
    </Tag>
  );
}

/**
 * UNE NOTE FACULTATIVE À CÔTÉ D'UN NOM (#17587, épure #17584) — un titre de
 * bloc ou le nom d'une rangée de réglage. Sans note, l'enfant est rendu tel
 * quel ; avec une note, le (i) se pose à sa fin et la note sous lui, repliée
 * mais lue. Le (i) est un BOUTON : il ne se pose jamais dans un lien ni dans un
 * `label`, et l'hôte le place à côté de ces contrôles, pas dedans.
 */
export function InfoNoted({
  note,
  noteId,
  inline = false,
  className,
  children,
}: {
  readonly note: InfoHint | undefined;
  /** L'identifiant de la note quand un contrôle voisin la cite (`aria-describedby`). */
  readonly noteId?: string;
  readonly inline?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  if (note === undefined) return <>{children}</>;
  return (
    <WithNote note={note} inline={inline} {...(noteId === undefined ? {} : { noteId })} {...(className === undefined ? {} : { className })}>
      {children}
    </WithNote>
  );
}

function WithNote({
  note,
  noteId,
  inline,
  className,
  children,
}: {
  readonly note: InfoHint;
  readonly noteId?: string;
  readonly inline: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const state = useInfoHint(noteId);
  const Row = inline ? 'span' : 'div';
  return (
    <>
      <Row className={['flex min-w-0 items-center gap-1', className].filter((part) => part !== undefined).join(' ')}>
        <span className="min-w-0">{children}</span>
        <InfoHintButton hint={note} state={state} />
      </Row>
      <InfoHintText hint={note} state={state} inline={inline} />
    </>
  );
}

/**
 * UN (i) POSÉ SEUL, SANS TEXTE À CÔTÉ (épure #17584, règle 1) — la page ou la
 * fiche dont le titre dit déjà l'objet et dont l'explication ne tient pas à un
 * libellé : l'icône seule porte la QUESTION comme nom accessible, la note reste
 * lue repliée.
 */
export function InfoAlone({ hint, className }: { readonly hint: InfoHint; readonly className?: string }) {
  const state = useInfoHint();
  return (
    <div className={['grid justify-items-center', className].filter((part) => part !== undefined).join(' ')}>
      <InfoHintButton hint={hint} state={state} />
      <InfoHintText hint={hint} state={state} />
    </div>
  );
}
