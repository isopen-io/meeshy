/**
 * **LE COULOIR DES DISQUES FLOTTANTS** (#6277) — les cotes que la POSE des
 * disques (`floating-pose.ts`, chunk à la demande) et le CHROME des écrans qui
 * les portent (`routes/feed.tsx`) partagent au pixel près.
 *
 * Miroir de `FloatingButtonSafeZone` (`packages/MeeshySDK/Sources/MeeshyUI/
 * Primitives/FloatingButtons.swift:48-59`), qu'iOS écrit UNE fois parce que le
 * `50` qu'elle remplace vivait à trois endroits qui devaient rester d'accord.
 * Le web avait reproduit ce défaut à l'identique : `126` dans la feuille des
 * menus, `178` recopié dans `feed.tsx` avec un commentaire qui l'avouait
 * (« Dupliqué plutôt qu'importé »). Un module sans dépendance de quatre
 * nombres se partage entre deux chunks pour quelques octets ; une jumelle, elle,
 * diverge au premier changement de cote.
 *
 * **LA LOI QUI LES LIE AU CONTENU — celle d'iOS.** iOS pose ses disques sous
 * l'en-tête étendu (`FloatingButtonSafeZone.top` = encoche + 64) et ouvre ses
 * écrans de hub par un chrome de hauteur FIXE — le plateau des stories
 * (`StoryTrayView.frame(height: 120)`), présent même vide puisqu'il porte
 * « Moi » : le premier contenu de lecture commence donc TOUJOURS sous le
 * couloir. Les disques peuvent survoler le chrome (la cible
 * `targets/feed.*.png` pose le disque du Flux sur la première tuile), jamais un
 * texte ni un contrôle. `scripts/check-floating-clearance.mjs` le mesure par
 * `elementFromPoint`, dans les deux schémas et aux deux gabarits.
 */

/** Le disque fermé — `FreeFloatingButtonsContainer.buttonSize`. */
export const FLOATING_BUTTON = 52;

/** La marge latérale — `minEdgePadding`. */
export const FLOATING_SIDE = 20;

/**
 * Le haut du couloir, sous l'encoche réelle (`env(safe-area-inset-top)`) —
 * `FloatingButtonSafeZone.top` d'iOS (62 d'encoche majorée + 64 d'en-tête).
 * Le web connaît son encoche exacte et l'ajoute en CSS ; il garde 126 parce
 * que ses en-têtes de hub portent, sous leurs 64 px, un plateau dont les
 * PORTES se calent en haut (`RailActions`, `story-rail.tsx`) : elles finissent
 * à 116, le couloir commence à 126.
 */
export const FLOATING_TOP = 126;

/** Le bas du couloir, au repos — sous lui, le premier contenu de lecture. */
export const FLOATING_CORRIDOR_BOTTOM = FLOATING_TOP + FLOATING_BUTTON;
