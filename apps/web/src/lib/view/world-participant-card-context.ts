import { createContext } from 'react';

/**
 * LE CONTEXTE DES FICHES DE WORLD WIDE (#10102) — séparé de la loi d'accès
 * (`world-participant-card-access.ts`) parce que ses lecteurs, l'avatar et le
 * nom d'un auteur, vivent dans TOUS les chunks qui montrent une personne (fil,
 * fil d'actualité, commentaires, appels) : ils ne doivent tirer que ce
 * contexte, jamais la hiérarchie des rôles qu'aucun d'eux ne consulte.
 */
/**
 * Ce que le fil remet à chaque auteur quand la porte est ouverte : ouvrir la
 * fiche d'un participant (`senderId`), et NOMMER ce geste pour le lecteur
 * d'écran.
 */
export type WorldParticipantCardOpener = {
  readonly open: (participantId: string) => void;
  readonly labelFor: (name: string) => string;
};

/**
 * Posé par l'hôte du fil (`components/world-participant-card-host.tsx`), lu par
 * l'avatar et le nom de chaque auteur (`AuthorAvatar`, `PersonName`). `null` —
 * hors World Wide, ou lecteur qui n'est pas de l'équipe — : rien ne change, un
 * anonyme reste muet et un compte mène à son profil.
 */
export const WorldParticipantCardContext = createContext<WorldParticipantCardOpener | null>(null);
