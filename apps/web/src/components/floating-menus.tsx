import { useId, useState } from 'react';
import { useStore } from 'zustand/react';

import '@/styles/floating-menus.css';

import { Avatar } from './avatar';
import { MenuGlyph } from './menu-glyph';
import { UnreadCornerBadge, UnreadRungBadge, unreadBadgeText } from './unread-badge';
import { sessionStore } from '@/lib/api/session';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useNotificationCounts } from '@/lib/view/use-notification-counts';
import { usePendingFriendRequestCount } from '@/lib/view/use-pending-friend-requests';
import { initialsOf, participantAvatarOf } from '@/lib/view/conversation';
import { PROFILE_DESTINATION, feedDiscDestination, menuLadderFor, type FloatingDestination } from '@/lib/view/floating-menu';
import { isContextMenuKey } from '@/lib/view/long-press';
import {
  FEED_DEFAULT,
  FLOATING_BUTTON,
  FLOATING_SIDE,
  FLOATING_TOP,
  LADDER_RUNG,
  MENU_DEFAULT,
  floatingLeft,
  floatingTop,
  ladderExpandsDown,
  ladderPitch,
  ladderRooms,
  ladderRungOffset,
  type LadderRooms,
} from '@/lib/view/floating-pose';
import { useAdminAccess } from '@/lib/view/use-admin-access';
import { useFloatingDrag } from '@/lib/view/use-floating-drag';
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
 * fichier.** Celui de gauche ne déplie rien : il NAVIGUE, et c'est donc un
 * lien — vers le Flux, ou vers les conversations depuis le Flux, et vers les
 * Réels à l'appui long (#6456). Celui de droite porte le visage de la personne et déplie une
 * échelle de six barreaux — sept pour qui administre (#6458). Les traiter comme deux instances d'un même objet
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
 * **La pastille de non-lus est arrivée AVEC son compteur** (#6219, #6288),
 * comme ce paragraphe l'avait exigé quand #6104 l'avait refusée faute de
 * source : iOS la pose au coin du bouton droit, alimentée par
 * `notificationManager.unreadCount` ; ici `UnreadCornerBadge` lit
 * `useNotificationCounts` — `GET /notifications/counts`, tenu par les gestes
 * optimistes de la cloche et par `notification:counts`. La pastille est
 * décorative : c'est le BOUTON qui annonce le compte, dans son nom.
 */

/** Le dégradé du disque — les deux couples de teintes d'iOS, à l'hexadécimal près. */
const FEED_GRADIENT = 'linear-gradient(135deg, #F87171, #A5B4FC)';
const MENU_GRADIENT = 'linear-gradient(135deg, #4F46E5, #A5B4FC)';
const MENU_GRADIENT_OPEN = 'linear-gradient(135deg, #F87171, #A5B4FC)';

/** Le nom du bouton FERMÉ — il dit le compte quand il y en a un, une fois. */
function closedMenuLabel(language: InterfaceLanguage, unread: number): string {
  if (unread <= 0) return translate(language, 'a11y.floating.menu');
  const key = unread === 1 ? 'a11y.floating.menu.unread.one' : 'a11y.floating.menu.unread.other';
  return translate(language, key, { count: String(unread) });
}

type RungBadge = NonNullable<FloatingDestination['badge']>;
type RungCounts = Readonly<Record<RungBadge, number>>;

/** Le compteur que CE barreau porte — `menuBadgeCount` d'iOS (`RootView.swift:1740`). */
function rungCount(destination: FloatingDestination, counts: RungCounts): number {
  return destination.badge === undefined ? 0 : counts[destination.badge];
}

/**
 * Le nom qui dit un compte, par compteur. Les notifications disent le nombre
 * SERVI par la passerelle ; les demandes reçues sont comptées sur une page de
 * cent, donc « 99+ » au-delà, comme la pastille (#6321).
 */
const RUNG_LABELS = {
  unreadNotifications: {
    one: 'a11y.floating.rung.notifications.unread.one',
    other: 'a11y.floating.rung.notifications.unread.other',
    text: (count: number) => String(count),
  },
  pendingFriendRequests: {
    one: 'a11y.floating.rung.discover.requests.one',
    other: 'a11y.floating.rung.discover.requests.other',
    text: unreadBadgeText,
  },
} as const;

/** Le nom d'un barreau — il dit son compte quand il en porte un, une fois. */
function rungLabel(language: InterfaceLanguage, destination: FloatingDestination, counts: RungCounts): string {
  const count = rungCount(destination, counts);
  if (count <= 0 || destination.badge === undefined) return translate(language, destination.labelKey);
  const labels = RUNG_LABELS[destination.badge];
  return translate(language, count === 1 ? labels.one : labels.other, { count: labels.text(count) });
}

/**
 * **LA PLACE DE L'ÉCHELLE, MESURÉE** (#6458) — le centre du disque et le cadre
 * de la couche, lus au navigateur ; la barre d'état se lit sur le témoin de
 * position `start`, posé par la même loi que le disque (`top` du couloir =
 * barre d'état + 126). Aucune cote n'est recopiée : c'est le motif de
 * `use-floating-drag.ts`.
 *
 * Un cadre DÉGÉNÉRÉ (hors mise en page, ou un document de témoin) rend
 * `null` : le pas d'iOS s'applique, jamais un pas calculé depuis des zéros.
 */
function measureLadderRooms(button: HTMLElement | null): LadderRooms | null {
  const couche = button?.closest('.floating-menus') ?? null;
  const sonde = couche?.querySelector('[data-floating-probe="start"]') ?? null;
  if (button === null || couche === null || sonde === null) return null;

  const cadre = couche.getBoundingClientRect();
  if (cadre.height <= 0) return null;
  const disque = button.getBoundingClientRect();

  return ladderRooms({
    center: disque.top + disque.height / 2,
    frameTop: cadre.top,
    frameBottom: cadre.bottom,
    safeTop: sonde.getBoundingClientRect().top - cadre.top - FLOATING_TOP,
  });
}

/** Les Réels sans graine — `ReelsPresenter.presentFresh()`, le geste de l'appui long. */
const ouvrirReels = () => navigate(href('reels'));

export function FloatingMenus({ routeKey }: { readonly routeKey: string }) {
  const session = useStore(sessionStore, (s) => s.session);
  const unread = useNotificationCounts().data?.unread ?? 0;
  const pendingFriendRequests = usePendingFriendRequestCount();
  const counts: RungCounts = { unreadNotifications: unread, pendingFriendRequests };
  /* LA BASCULE (#6456) : où le tap mène, lu sur la route que la coquille sert. */
  const disque = feedDiscDestination(routeKey);
  const indiceDisque = useId();
  const flux = useFloatingDrag('feed', FEED_DEFAULT, { onLongPress: ouvrirReels });
  const menu = useFloatingDrag('menu', MENU_DEFAULT);
  const expandsDown = ladderExpandsDown(menu.position.y);

  /* L'ÉCHELLE DE CE LECTEUR (#6458) : le barreau d'administration n'existe que
     sur une matrice SERVIE portant le droit — jamais monté puis masqué. */
  const ladder = menuLadderFor({ canAccessAdmin: useAdminAccess() });
  const [rooms, setRooms] = useState<LadderRooms | null>(null);

  const roving = useRovingMenu({
    itemCount: ladder.length,
    /* Une rotation échelle ouverte change la place : le pas se remesure. */
    onResize: () => setRooms(measureLadderRooms(roving.buttonRef.current)),
  });
  const { open, setOpen, closeAndFocusButton, activeIndex, buttonRef, menuRef, itemRefs, onMenuKeyDown } = roving;
  const pitch = ladderPitch({ count: ladder.length, room: rooms === null ? null : expandsDown ? rooms.down : rooms.up });

  /* La langue d'INTERFACE, lue au rendu : son catalogue est chargé avec le
     chunk de ce composant (`shell.tsx`, #6206). */
  const langue = currentInterfaceLanguage();

  const nom =
    session.status === 'authenticated'
      ? (session.user.displayName ?? session.user.username)
      : null;
  /**
   * MA PHOTO SUR LE DISQUE (#6975) — `session.user` était déjà lu juste
   * au-dessus, pour le NOM SEULEMENT : `avatar` arrivait dans le même objet
   * (`SessionUser`, `api/session.ts:53`) et le disque, présent sur CHAQUE
   * écran de l'application, rendait deux initiales. `participantAvatarOf`
   * plutôt qu'un test direct : un `avatar: ''` en base ne devient pas ici un
   * `<img src="">` (qui recharge la page courante).
   */
  const maPhoto = session.status === 'authenticated' ? participantAvatarOf(session.user) : undefined;

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
    if (menu.consumeClick()) return;
    if (open) {
      setOpen(false);
      navigate(href('profile'));
      return;
    }
    /* La place se mesure AVANT de monter l'échelle : ses barreaux naissent à
       leur pas définitif, jamais à celui d'iOS pour sauter à la suivante. */
    setRooms(measureLadderRooms(buttonRef.current));
    setOpen(true);
  };

  return (
    <div
      className="floating-menus pointer-events-none fixed inset-0 z-30"
      /* LES COULOIRS SONT POSÉS DEPUIS LA LOI (`lib/view/floating-corridor.ts`),
         que le chrome du Flux lit aussi — la feuille ne garde que le couloir
         bas, qu'aucun écran ne partage. */
      style={
        {
          '--float-side': `${FLOATING_SIDE}px`,
          '--float-top': `calc(env(safe-area-inset-top, 0px) + ${FLOATING_TOP}px)`,
        } as React.CSSProperties
      }
    >
      {open ? <LadderDismissLayer onClose={closeAndFocusButton} /> : null}

      {/* LES DEUX TÉMOINS DE POSITION — voir `use-floating-drag.ts`. Ils
          portent la MÊME pose que les boutons, aux deux extrêmes de la
          course : c'est d'eux que le geste tire les quatre bornes, plutôt
          que d'une seconde table de nombres qui aurait divergé. */}
      <span
        data-floating-probe="start"
        aria-hidden="true"
        className="absolute"
        style={{ left: floatingLeft({ x: 0, y: 0 }), top: floatingTop({ x: 0, y: 0 }), width: 0, height: 0 }}
      />
      <span
        data-floating-probe="end"
        aria-hidden="true"
        className="absolute"
        style={{ left: floatingLeft({ x: 1, y: 1 }), top: floatingTop({ x: 1, y: 1 }), width: 0, height: 0 }}
      />

      {/* L'INDICE DU GESTE INVISIBLE — `leftA11yHint` d'iOS : un appui long que
          rien ne signale à l'écran doit au moins être ANNONCÉ. Hors du lien,
          pour ne pas entrer dans son nom ; `hidden`, pour n'être lu QUE comme
          sa description (#6499) — un `sr-only` restait un texte que le
          balayage de VoiceOver et TalkBack lisait seul. `aria-describedby`
          lit un élément masqué qu'il référence directement. */}
      <span id={indiceDisque} hidden>
        {translate(langue, 'a11y.floating.feed.hint')}
      </span>

      {/* LE BOUTON DE GAUCHE — un LIEN, parce qu'il navigue et rien d'autre.
          Son adresse, son nom et son glyphe sont ceux de la destination du tap
          (#6456) : Flux, ou Conversations quand on est sur le Flux. */}
      <Link
        to={disque.route}
        data-floating-feed
        data-disc-face={disque.key}
        data-dragging={flux.dragging ? 'true' : undefined}
        aria-label={translate(langue, disque.labelKey)}
        aria-describedby={indiceDisque}
        aria-keyshortcuts="Shift+F10"
        onPointerDown={flux.onPointerDown}
        onPointerMove={flux.onPointerMove}
        onPointerUp={flux.onPointerUp}
        onPointerCancel={flux.onPointerCancel}
        onContextMenu={flux.onContextMenu}
        /* L'APPUI LONG AU CLAVIER — les deux touches du menu d'un message
           (`long-press.ts`) : même geste, même effet. */
        onKeyDown={(event) => {
          if (!isContextMenuKey(event)) return;
          event.preventDefault();
          ouvrirReels();
        }}
        /* **UN LIEN EST NATIVEMENT DÉPLAÇABLE**, et c'est ce qui cassait le
           geste : le glisser-déposer du navigateur démarrait au premier
           mouvement, emportait la suite des événements de pointeur, et le
           disque se figeait à mi-course sans que rien ne soit enregistré.
           Mesuré à la recette. Le défaut n'existe QUE sur le bouton de gauche,
           parce qu'il est le seul des deux à être un lien. */
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
        /* UN DÉPLACEMENT N'OUVRE RIEN. `Link` consulte `defaultPrevented`
           après avoir appelé ce gestionnaire : c'est la porte par laquelle un
           geste de déplacement avale la navigation qu'il aurait déclenchée. */
        onClick={(event) => {
          if (flux.consumeClick()) event.preventDefault();
        }}
        className="floating-disc glass-prominent glass-card pointer-events-auto absolute grid touch-none place-items-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          left: floatingLeft(flux.position),
          top: floatingTop(flux.position),
          width: FLOATING_BUTTON,
          height: FLOATING_BUTTON,
          backgroundImage: FEED_GRADIENT,
          outlineColor: 'var(--color-ios-brand)',
          /* `scale(1.15)` accompagne le déplacement — `FloatingButtons.swift:332`.
             Il dit « c'est bien CE disque que tu tiens », au moment précis où le
             doigt le recouvre entièrement. */
          ...(flux.offset === null
            ? {}
            : { transform: `translate(${flux.offset.x}px, ${flux.offset.y}px) scale(1.15)` }),
        }}
      >
        <MenuGlyph glyph={disque.glyph} size={22} />
      </Link>

      {/* LE BOUTON DE DROITE ET SON ÉCHELLE — un seul bloc positionné, pour que
          les barreaux se placent depuis le CENTRE du bouton sans le mesurer. */}
      <div
        className="pointer-events-none absolute"
        style={{
          left: floatingLeft(menu.position),
          top: floatingTop(menu.position),
          width: FLOATING_BUTTON,
          height: FLOATING_BUTTON,
          ...(menu.offset === null
            ? {}
            : { transform: `translate(${menu.offset.x}px, ${menu.offset.y}px) scale(1.15)` }),
        }}
      >
        {open ? (
          <div
            ref={menuRef}
            role="menu"
            aria-label={translate(langue, 'a11y.floating.menu.ladder')}
            onKeyDown={onMenuKeyDown}
            className="pointer-events-none absolute inset-0"
          >
            {ladder.map((destination, index) => (
              <Link
                key={destination.key}
                to={destination.route}
                role="menuitem"
                tabIndex={index === activeIndex ? 0 : -1}
                anchorRef={(el) => {
                  itemRefs.current[index] = el;
                }}
                onClick={() => setOpen(false)}
                aria-label={rungLabel(langue, destination, counts)}
                className="floating-rung pointer-events-auto absolute grid place-items-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                style={
                  {
                    '--rung': index,
                    left: '50%',
                    top: `calc(50% + ${ladderRungOffset(index, expandsDown, pitch)}px)`,
                    width: LADDER_RUNG,
                    height: LADDER_RUNG,
                    backgroundImage: `linear-gradient(135deg, ${destination.tint}, color-mix(in srgb, ${destination.tint} 70%, #000))`,
                    boxShadow: `0 4px 12px color-mix(in srgb, ${destination.tint} 45%, transparent)`,
                    outlineColor: destination.tint,
                  } as React.CSSProperties
                }
              >
                <MenuGlyph glyph={destination.glyph} size={18} />
                <UnreadRungBadge count={rungCount(destination, counts)} tint={destination.tint} size={LADDER_RUNG} />
              </Link>
            ))}
          </div>
        ) : null}

        <button
          ref={buttonRef}
          /* La PRISE des gates et des recettes. Sans elle, `aria-haspopup` ne
             désigne rien : chaque rangée de la liste en porte un aussi. */
          data-floating-menu={open ? 'open' : 'closed'}
          data-dragging={menu.dragging ? 'true' : undefined}
          type="button"
          onPointerDown={menu.onPointerDown}
          onPointerMove={menu.onPointerMove}
          onPointerUp={menu.onPointerUp}
          onPointerCancel={menu.onPointerCancel}
          onClick={onMenuButton}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={open ? translate(langue, PROFILE_DESTINATION.labelKey) : closedMenuLabel(langue, unread)}
          className="floating-disc glass-prominent glass-card pointer-events-auto absolute inset-0 grid touch-none place-items-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundImage: open ? MENU_GRADIENT_OPEN : MENU_GRADIENT,
            outlineColor: 'var(--color-ios-brand)',
          }}
        >
          {nom === null ? (
            <MenuGlyph glyph={PROFILE_DESTINATION.glyph} size={22} />
          ) : (
            <Avatar
              initials={initialsOf(nom)}
              color="var(--color-ios-brand)"
              size={38}
              {...(maPhoto === undefined ? {} : { src: maPhoto })}
            />
          )}
        </button>
        {/* MENU OUVERT, LE COMPTE CHANGE DE PORTEUR — `RootView.swift:1666`
            retire la pastille du disque, le barreau « Notifications » la
            reprend. Les deux ensemble peindraient deux fois le même nombre. */}
        {open ? null : <UnreadCornerBadge count={unread} />}
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
