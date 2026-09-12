import { useStore } from 'zustand/react';

import '@/styles/floating-menus.css';

import { Avatar } from './avatar';
import { MenuGlyph } from './menu-glyph';
import { sessionStore } from '@/lib/api/session';
import { initialsOf } from '@/lib/view/conversation';
import { FEED_DESTINATION, MENU_LADDER, PROFILE_DESTINATION } from '@/lib/view/floating-menu';
import {
  FEED_DEFAULT,
  FLOATING_BUTTON,
  LADDER_RUNG,
  MENU_DEFAULT,
  floatingLeft,
  floatingTop,
  ladderExpandsDown,
  ladderRungOffset,
} from '@/lib/view/floating-pose';
import { useRovingMenu } from '@/lib/view/roving-menu';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { Link, href, navigate } from '@/routes/route-table';

/**
 * **LES DEUX MENUS FLOTTANTS** (#6104) — miroir de
 * `FreeFloatingButtonsContainer` (`packages/MeeshySDK/Sources/MeeshyUI/
 * Primitives/FloatingButtons.swift:88`), monté par
 * `RootView.draggableFloatingButtons` (`apps/ios/.../RootView.swift:1550`).
 *
 * **Les deux boutons ne sont PAS symétriques, et c'est le fait qui gouverne ce
 * fichier.** Celui de gauche ne déplie rien : il OUVRE le Flux, et c'est donc
 * un lien. Celui de droite porte le visage de la personne et déplie une
 * échelle de six barreaux. Les traiter comme deux instances d'un même objet
 * aurait demandé une abstraction qui n'aurait servi qu'à les rendre pareils —
 * ils ne le sont pas.
 *
 * **Ce composant se charge à la demande**, depuis `shell.tsx`, et le motif
 * n'est pas spéculatif : la première peinture est mesurée à 37,19 Ko pour un
 * plafond de 40 (`budgets.json`), et la pastille de synchronisation a déjà été
 * REFUSÉE par le gate du poids pour 5,57 Ko montés en statique. Le chunk est
 * néanmoins PRÉCHARGÉ par la coquille : « à la demande » ne doit pas vouloir
 * dire « au moment où l'on appuie ».
 *
 * **L'échelle n'est montée QUE lorsqu'elle est ouverte** — divergence assumée
 * avec iOS, qui la garde montée à opacité nulle pour que son ressort parte
 * d'un état existant (`RootView.swift:1723-1737`). Sur le web, six liens
 * invisibles resteraient dans le parcours de TABULATION : on tabulerait à
 * travers un menu fermé. La cascade est donc jouée par une `@keyframes` à la
 * naissance plutôt que par une transition.
 *
 * **Aucune pastille de non-lus dans ce lot, et c'est délibéré.** iOS en pose
 * une au coin du bouton droit, alimentée par `notificationManager.unreadCount`.
 * Mesuré sur `dev` : cette application n'a AUCUNE source de notifications —
 * ni endpoint, ni magasin, ni corpus de recette. Peindre un nombre inventé
 * serait pire que l'absence, et écrire l'atome `UnreadCornerBadge` sans son
 * premier appelant réel est exactement ce que son propre doc-comment interdit
 * (`unread-badge.tsx:41-47`) — ce dépôt l'a déjà payé une fois sur CETTE
 * pastille. Elle reviendra avec le compteur, dans le même commit que lui.
 */

/** Le dégradé du disque — les deux couples de teintes d'iOS, à l'hexadécimal près. */
const FEED_GRADIENT = 'linear-gradient(135deg, #F87171, #A5B4FC)';
const MENU_GRADIENT = 'linear-gradient(135deg, #4F46E5, #A5B4FC)';
const MENU_GRADIENT_OPEN = 'linear-gradient(135deg, #F87171, #A5B4FC)';

export function FloatingMenus() {
  const session = useStore(sessionStore, (s) => s.session);
  const expandsDown = ladderExpandsDown(MENU_DEFAULT.y);

  const roving = useRovingMenu({ itemCount: MENU_LADDER.length });
  const { open, setOpen, closeAndFocusButton, activeIndex, buttonRef, menuRef, itemRefs, onMenuKeyDown } = roving;

  const nom =
    session.status === 'authenticated'
      ? (session.user.displayName ?? session.user.username)
      : null;

  /**
   * **Le second tap ouvre le profil** — la règle d'iOS
   * (`RootView.swift:1570-1579`), et la seule porte du profil, qui n'a
   * volontairement pas de barreau.
   *
   * Un bouton dont l'action change avec l'état est un contrôle qui ment si son
   * NOM ne change pas avec elle. Le libellé suit donc l'état, à chaque
   * instant : « Ouvrir le menu » puis « Ouvrir mon profil ».
   */
  const onMenuButton = () => {
    if (open) {
      setOpen(false);
      navigate(href('profile'));
      return;
    }
    setOpen(true);
  };

  return (
    <div className="floating-menus pointer-events-none fixed inset-0 z-30">
      {open ? <LadderDismissLayer onClose={closeAndFocusButton} /> : null}

      {/* LE BOUTON DE GAUCHE — un LIEN, parce qu'il navigue et rien d'autre. */}
      <Link
        to="feed"
        data-floating-feed
        aria-label={FEED_DESTINATION.label}
        className="floating-disc pointer-events-auto absolute grid place-items-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          left: floatingLeft(FEED_DEFAULT),
          top: floatingTop(FEED_DEFAULT),
          width: FLOATING_BUTTON,
          height: FLOATING_BUTTON,
          backgroundImage: FEED_GRADIENT,
          outlineColor: 'var(--color-ios-brand)',
        }}
      >
        <MenuGlyph glyph={FEED_DESTINATION.glyph} size={22} />
      </Link>

      {/* LE BOUTON DE DROITE ET SON ÉCHELLE — un seul bloc positionné, pour que
          les barreaux se placent depuis le CENTRE du bouton sans le mesurer. */}
      <div
        className="pointer-events-none absolute"
        style={{
          left: floatingLeft(MENU_DEFAULT),
          top: floatingTop(MENU_DEFAULT),
          width: FLOATING_BUTTON,
          height: FLOATING_BUTTON,
        }}
      >
        {open ? (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Navigation Meeshy"
            onKeyDown={onMenuKeyDown}
            className="pointer-events-none absolute inset-0"
          >
            {MENU_LADDER.map((destination, index) => (
              <Link
                key={destination.key}
                to={destination.route}
                role="menuitem"
                tabIndex={index === activeIndex ? 0 : -1}
                anchorRef={(el) => {
                  itemRefs.current[index] = el;
                }}
                onClick={() => setOpen(false)}
                aria-label={destination.label}
                className="floating-rung pointer-events-auto absolute grid place-items-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                style={
                  {
                    '--rung': index,
                    left: '50%',
                    top: `calc(50% + ${ladderRungOffset(index, expandsDown)}px)`,
                    width: LADDER_RUNG,
                    height: LADDER_RUNG,
                    backgroundImage: `linear-gradient(135deg, ${destination.tint}, color-mix(in srgb, ${destination.tint} 70%, #000))`,
                    boxShadow: `0 4px 12px color-mix(in srgb, ${destination.tint} 45%, transparent)`,
                    outlineColor: destination.tint,
                  } as React.CSSProperties
                }
              >
                <MenuGlyph glyph={destination.glyph} size={18} />
              </Link>
            ))}
          </div>
        ) : null}

        <button
          ref={buttonRef}
          /* La PRISE des gates et des recettes. Sans elle, `aria-haspopup` ne
             désigne rien : chaque rangée de la liste en porte un aussi. */
          data-floating-menu={open ? 'open' : 'closed'}
          type="button"
          onClick={onMenuButton}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={open ? PROFILE_DESTINATION.label : 'Menu'}
          className="floating-disc pointer-events-auto absolute inset-0 grid place-items-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundImage: open ? MENU_GRADIENT_OPEN : MENU_GRADIENT,
            outlineColor: 'var(--color-ios-brand)',
          }}
        >
          {nom === null ? (
            <MenuGlyph glyph={PROFILE_DESTINATION.glyph} size={22} />
          ) : (
            <Avatar initials={initialsOf(nom)} color="var(--color-ios-brand)" size={38} />
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * **LA COUCHE QUI FERME** — `Color.clear` chez iOS (`RootView.swift:400-408`) :
 * elle prend le geste et n'assombrit RIEN. L'échelle se lit au-dessus du
 * contenu sans le masquer, et c'est ce qui la distingue d'une feuille modale.
 *
 * Elle est un composant à part pour une raison précise : `useBackDismiss` pose
 * son entrée d'historique AU MONTAGE et la rend au démontage. Appelée dans le
 * parent, elle se déclencherait au premier rendu de l'application, menu fermé
 * — et le bouton retour matériel serait avalé en permanence.
 */
function LadderDismissLayer({ onClose }: { readonly onClose: () => void }) {
  useBackDismiss(onClose);

  return (
    <div
      data-floating-dismiss
      aria-hidden="true"
      className="pointer-events-auto fixed inset-0"
      onClick={onClose}
    />
  );
}
