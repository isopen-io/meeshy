import { useState, type ReactNode, type Ref } from 'react';

import { yieldingChrome } from '@/lib/view/chrome-yields';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';

import '@/styles/viewer-chrome.css';

import { Avatar } from './avatar';
import { CHROME_ACTION_HIT_CLASS } from './chrome-action';
import { Glyph } from './glyph';
import { PersonName } from './person-name';

/**
 * **LE CHROME COMMUN DES VISIONNEUSES PLEIN ÉCRAN** (#8879, directive porteur
 * 2026-09-30) — contrat : `docs/product/visionneuse-plein-ecran.md`.
 *
 * Quatre plein écrans (story, réel, média de conversation, scène de
 * publication) dessinaient chacun leur croix, leur disque, leur rail et leur
 * voile : cinq opacités de noir pour un même disque, trois tailles d'avatar
 * pour une même identité, la croix à gauche ici et à droite là. Ces
 * primitives sont le site UNIQUE de ce dessin.
 *
 * **ELLES NE DÉCIDENT RIEN.** Aucun service, aucun magasin : l'hôte remet des
 * rappels, et **un rappel absent ⇒ le contrôle n'existe pas** (loi 4 — jamais
 * un bouton `disabled` qui annoncerait une action que le produit ne rend
 * pas). Les libellés arrivent TRADUITS : l'hôte tient la langue.
 *
 * **UN CHROME QUI CÈDE EST INERTE** (`yieldingChrome`, D-90, #7040) — caché
 * aux yeux ⇒ caché au doigt, au clavier et au lecteur d'écran.
 *
 * **TOUCHER UN CONTRÔLE NE REMONTE JAMAIS AU PLATEAU** : le plateau porte ses
 * gestes (changer de story au tiers droit, basculer le plein cadre) ; sans la
 * coupure, « Répondre » tapé dans le tiers droit ferait AUSSI avancer.
 */

/** La matière de tout ce qui flotte SUR le média — le verre sombre mesuré AA contre du blanc pur (`glass.css`). */
export const VIEWER_GLASS = 'glass-call';

/** Ce que le rail réserve au bord de fin : 44 de cible + 8 de marge + 8 de respiration. */
export const VIEWER_RAIL_CORRIDOR = 60;

type Placement = 'overlay' | 'corridor';

/** Les PRISES qu'un gate tape déjà (`data-story-action`, `data-reel-gesture`…) — posées telles quelles sur le contrôle. */
export type ViewerProbe = Readonly<Record<`data-${string}`, string>>;

const stop = (event: { stopPropagation: () => void }): void => event.stopPropagation();

/** Les coupures d'un contrôle posé sur le plateau — le `click` est coupé par chaque gestionnaire. */
const HALT = { onPointerDown: stop, onPointerUp: stop } as const;

function useYield(hidden: boolean) {
  return yieldingChrome({ hidden, reducedMotion: prefersReducedMotion() });
}

export type ViewerIdentityModel = {
  readonly name: string;
  readonly initials: string;
  readonly avatarSrc?: string;
  /** L'accent du contexte (conversation) — `--color-ios-brand` par défaut. */
  readonly avatarColor?: string;
  /** Présent ⇒ l'avatar et le nom mènent au profil ; absent (sa propre story) ⇒ rien. */
  readonly profileUsername?: string;
  readonly time?: { readonly iso: string; readonly label: string };
};

/** Avatar 32, nom, heure — sur UNE ligne : l'heure qualifie l'auteur, elle n'est pas un sous-titre. */
export function ViewerIdentity({ identity, nameProbe }: { readonly identity: ViewerIdentityModel; readonly nameProbe?: ViewerProbe }) {
  return (
    <div data-viewer-identity="" className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2" onPointerDown={stop}>
      <Avatar
        initials={identity.initials}
        color={identity.avatarColor ?? 'var(--color-ios-brand)'}
        size={32}
        name={identity.name}
        {...(identity.avatarSrc === undefined ? {} : { src: identity.avatarSrc })}
        {...(identity.profileUsername === undefined ? {} : { profileUsername: identity.profileUsername })}
      />
      <div {...nameProbe} className="flex min-w-0 items-baseline gap-2">
        <PersonName name={identity.name} username={identity.profileUsername} className="viewer-ink-shadow truncate text-body font-semibold">
          {identity.name}
        </PersonName>
        {identity.time === undefined ? null : (
          <time dateTime={identity.time.iso} className="viewer-ink-muted viewer-ink-shadow shrink-0 text-check">
            {identity.time.label}
          </time>
        )}
      </div>
    </div>
  );
}

export type ViewerExit = {
  /** `close` : la visionneuse est posée PAR-DESSUS (✕, en fin de barre). `back` : un écran qu'on a poussé (‹, en tête). */
  readonly kind: 'close' | 'back';
  readonly label: string;
  readonly onExit: () => void;
  readonly buttonRef?: Ref<HTMLButtonElement>;
  readonly probe?: ViewerProbe;
};

export function ViewerExitButton({ exit }: { readonly exit: ViewerExit }) {
  return (
    <button
      ref={exit.buttonRef}
      type="button"
      {...exit.probe}
      data-viewer-exit={exit.kind}
      aria-label={exit.label}
      onClick={exit.onExit}
      {...HALT}
      className={`${CHROME_ACTION_HIT_CLASS} pointer-events-auto`}
    >
      <span className={`${VIEWER_GLASS} viewer-disc grid place-items-center rounded-full`}>
        {exit.kind === 'close' ? <Glyph name="x" size={16} /> : <Glyph name="caretLeft" size={20} className="rtl:-scale-x-100" />}
      </span>
    </button>
  );
}

export type ViewerAction = {
  /** La prise du bouton (`data-viewer-action`) — `react`, `reply`, `share`… */
  readonly action: string;
  readonly label: string;
  readonly glyph: ReactNode;
  /** Absent ⇒ le bouton n'est pas rendu (loi 4). */
  readonly onPress?: (() => void) | undefined;
  /** Bascule (réaction posée, muet) — `aria-pressed`, jamais un libellé qui change. */
  readonly pressed?: boolean | undefined;
  readonly busy?: boolean | undefined;
  /** Un compteur nul ou absent ne s'affiche pas. */
  readonly count?: number | null | undefined;
  /** L'encre du glyphe quand l'état le dit (cœur posé : `--ios-error`, hors schéma) ; blanc sinon. */
  readonly ink?: string | undefined;
  /** Une capsule posée sur le disque (code langue), `aria-hidden`. */
  readonly badge?: string | null | undefined;
  /** L'action est ALLUMÉE (son ouvert, cœur posé) : un halo de cette couleur autour du disque. */
  readonly glow?: string | undefined;
  /** Le lecteur a déjà FAIT ce geste (aimé, commenté, envoyé, republié) : l'anneau du cœur, dans cette couleur. */
  readonly contour?: string | undefined;
  /** Remplace le bouton ENTIER à sa place dans le rail (l'anneau d'un export en cours). */
  readonly override?: ReactNode;
  readonly buttonRef?: Ref<HTMLButtonElement>;
  readonly probe?: ViewerProbe;
};

const shownCount = (value: number | null | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

/**
 * **LE REBOND SUIT UN CHANGEMENT D'ÉTAT, JAMAIS UN MONTAGE** — miroir de
 * `adaptiveSymbolBounce(value:)` d'iOS, qui ne joue qu'au changement de sa
 * valeur. Le compteur sert de clé au disque : chaque bascule remonte le disque
 * et rejoue l'animation, la première peinture n'en joue aucune. L'état se
 * corrige PENDANT le rendu (motif React « ajuster l'état sur une prop »), sans
 * effet ni rendu de rattrapage.
 */
function usePops(lit: boolean): number {
  const [seen, setSeen] = useState({ lit, pops: 0 });
  if (seen.lit !== lit) {
    const next = { lit, pops: seen.pops + 1 };
    setSeen(next);
    return next.pops;
  }
  return seen.pops;
}

/** L'anneau et le halo — deux couches `aria-hidden` sous le glyphe : un décor ne parle pas au lecteur d'écran. */
function DiscEffects({ glow, contour }: { readonly glow: string | undefined; readonly contour: string | undefined }) {
  return (
    <>
      {glow === undefined ? null : (
        <span data-viewer-halo="" aria-hidden="true" className="viewer-disc-halo pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: `0 0 14px 3px ${glow}` }} />
      )}
      {contour === undefined ? null : (
        <span data-viewer-contour="" aria-hidden="true" className="pointer-events-none absolute -inset-0.5 rounded-full" style={{ boxShadow: `0 0 0 2px ${contour}` }} />
      )}
    </>
  );
}

export function ViewerActionButton({ item }: { readonly item: ViewerAction }) {
  const pops = usePops(item.glow !== undefined || item.contour !== undefined);
  if (item.onPress === undefined) return null;
  const count = shownCount(item.count);
  const onPress = item.onPress;
  return (
    <button
      ref={item.buttonRef}
      type="button"
      {...item.probe}
      data-viewer-action={item.action}
      {...(count === undefined ? { 'aria-label': item.label } : {})}
      {...(item.pressed === undefined ? {} : { 'aria-pressed': item.pressed })}
      {...(item.busy === true ? { 'aria-busy': true } : {})}
      disabled={item.busy === true}
      onClick={(event) => {
        event.stopPropagation();
        onPress();
      }}
      {...HALT}
      className="pointer-events-auto flex min-w-11 flex-col items-center gap-1 rounded-chip"
    >
      <span className="grid size-11 place-items-center">
        <span
          key={pops}
          data-viewer-disc=""
          {...(item.glow === undefined ? {} : { 'data-viewer-glow': '' })}
          {...(pops === 0 ? {} : { 'data-viewer-pop': '' })}
          className={`${VIEWER_GLASS} viewer-disc relative grid place-items-center rounded-full${pops === 0 ? '' : ' viewer-disc-pop'}`}
          style={{ ...(item.ink === undefined ? {} : { color: item.ink }), ...(item.busy === true ? { opacity: 0.5 } : {}) }}
        >
          <DiscEffects glow={item.glow} contour={item.contour} />
          {item.glyph}
          {item.badge === undefined || item.badge === null ? null : (
            <span
              data-viewer-badge=""
              aria-hidden="true"
              className="absolute -top-0.5 -start-3 rounded-menu px-1 font-mono text-mini font-semibold leading-tight text-ios-on-brand"
              style={{ background: 'var(--ios-indigo-500)' }}
            >
              {item.badge}
            </span>
          )}
        </span>
      </span>
      {count === undefined ? null : (
        <>
          <span className="sr-only">{item.label}</span>
          <span data-viewer-count="" className="viewer-ink-shadow text-check font-semibold tabular-nums">
            {count}
          </span>
        </>
      )}
    </button>
  );
}

export function ViewerActionRail({
  label,
  actions,
  hidden = false,
  anchored,
  probe,
}: {
  readonly label: string;
  readonly actions: readonly ViewerAction[];
  readonly hidden?: boolean;
  readonly probe?: ViewerProbe;
  /** Une surface ancrée À GAUCHE d'un bouton RENDU (traînée d'émojis, langues). */
  readonly anchored?: { readonly action: string; readonly node: ReactNode };
}) {
  const chrome = useYield(hidden);
  const shown = actions.filter((item) => item.onPress !== undefined);
  if (shown.length === 0) return null;
  return (
    <div
      {...probe}
      data-viewer-rail=""
      role="toolbar"
      aria-orientation="vertical"
      {...(hidden ? {} : { 'aria-label': label })}
      data-chrome-yields={chrome['data-chrome-yields']}
      inert={chrome.inert}
      style={chrome.style}
      className="viewer-chrome pointer-events-none flex flex-col items-center gap-2"
    >
      {shown.map((item) => {
        const node = item.override ?? <ViewerActionButton item={item} />;
        if (anchored?.action !== item.action) return <div key={item.action}>{node}</div>;
        return (
          <div key={item.action} className="relative" data-viewer-anchor={item.action}>
            {node}
            <div className="pointer-events-auto absolute end-full top-1/2 me-3 -translate-y-1/2" style={{ zIndex: 10 }}>
              {anchored.node}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ViewerTopBar({
  exit,
  identity,
  trailing,
  above,
  hidden = false,
  placement = 'overlay',
  probe,
}: {
  readonly probe?: ViewerProbe;
  readonly exit: ViewerExit;
  readonly identity?: ViewerIdentityModel;
  /** Menu « … », Enregistrer… — posés entre l'identité et la croix. */
  readonly trailing?: ReactNode;
  /** Ce qui se pose AU-DESSUS de la ligne : les segments de progression d'une story. */
  readonly above?: ReactNode;
  readonly hidden?: boolean;
  /** `overlay` : posée SUR la scène, avec son voile. `corridor` : dans le couloir noir au-dessus d'un plateau. */
  readonly placement?: Placement;
}) {
  const chrome = useYield(hidden);
  const overlay = placement === 'overlay';
  return (
    <div
      {...probe}
      data-viewer-top-bar=""
      data-chrome-yields={chrome['data-chrome-yields']}
      inert={chrome.inert}
      className={`viewer-chrome pointer-events-none flex flex-col gap-2 px-3 ${overlay ? 'viewer-scrim-top absolute inset-x-0 top-0 z-10 pb-11' : 'relative z-10 pb-1'}`}
      style={{ paddingTop: 'calc(var(--safe-top, 0px) + 8px)', ...chrome.style }}
    >
      {above}
      <div className="flex min-h-11 items-center gap-2">
        {exit.kind === 'back' ? <ViewerExitButton exit={exit} /> : null}
        {identity === undefined ? <span className="flex-1" /> : <ViewerIdentity identity={identity} />}
        {trailing === undefined ? null : (
          <div className="pointer-events-auto flex shrink-0 items-center gap-1" onPointerDown={stop}>
            {trailing}
          </div>
        )}
        {exit.kind === 'close' ? <ViewerExitButton exit={exit} /> : null}
      </div>
    </div>
  );
}

const SCRIM_CLASS = { soft: 'viewer-scrim-bottom', strong: 'viewer-scrim-bottom-strong', none: '' } as const;

/** La capsule « Répondre… » — l'ENTRÉE de la réponse, au même endroit sur tous les plein écrans. */
export function ViewerReplyCapsule({ label, onReply }: { readonly label: string; readonly onReply: () => void }) {
  return (
    <button
      type="button"
      data-viewer-reply=""
      onClick={(event) => {
        event.stopPropagation();
        onReply();
      }}
      {...HALT}
      className={`${VIEWER_GLASS} pointer-events-auto flex min-h-11 w-full items-center rounded-full px-4 text-start text-body`}
    >
      <span className="viewer-ink-muted truncate">{label}</span>
    </button>
  );
}

export function ViewerBottomBar({
  caption,
  rail,
  reply,
  children,
  hidden = false,
  placement = 'overlay',
  scrim = 'soft',
  probe,
}: {
  readonly probe?: ViewerProbe;
  /** `strong` : le voile d'une vidéo (le réel), qui n'a aucun plateau noir dessous. `none` : rien à tenir lisible, le fond d'un TIERS (la story de texte) reste tel que l'auteur l'a choisi. */
  readonly scrim?: 'soft' | 'strong' | 'none';
  /** La légende SERVIE par le Prisme — l'hôte pose `lang=`. */
  readonly caption?: ReactNode;
  /** Le rail (`ViewerActionRail`) : il partage la rangée de la légende, qui ne passe donc jamais dessous. */
  readonly rail?: ReactNode;
  /** `onReply` absent ⇒ aucune capsule. */
  readonly reply?: { readonly label: string; readonly onReply?: (() => void) | undefined };
  /** Ce qui PARCOURT le média : barre de lecture, pellicule. */
  readonly children?: ReactNode;
  readonly hidden?: boolean;
  readonly placement?: Placement;
}) {
  const chrome = useYield(hidden);
  const onReply = reply?.onReply;
  const hasRow = caption !== undefined || rail !== undefined;
  if (!hasRow && onReply === undefined && children === undefined) return null;
  const overlay = placement === 'overlay';
  return (
    <div
      {...probe}
      data-viewer-bottom-bar=""
      data-chrome-yields={chrome['data-chrome-yields']}
      inert={chrome.inert}
      className={`viewer-chrome pointer-events-none flex flex-col gap-3 ${overlay ? `${SCRIM_CLASS[scrim]} absolute inset-x-0 bottom-0 z-10 pt-10` : 'relative z-10'}`}
      style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 12px)', ...chrome.style }}
    >
      {hasRow ? (
        <div data-viewer-bottom-row="" className="flex items-end gap-3 ps-4 pe-2">
          <div data-viewer-caption="" className="viewer-ink-shadow flex min-w-0 flex-1 flex-col gap-1">
            {caption}
          </div>
          {rail === undefined ? null : <div className="shrink-0">{rail}</div>}
        </div>
      ) : null}
      {onReply === undefined || reply === undefined ? null : (
        <div className="px-3">
          <ViewerReplyCapsule label={reply.label} onReply={onReply} />
        </div>
      )}
      {children}
    </div>
  );
}
