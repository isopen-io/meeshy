import type { Message } from './api/modele';

/**
 * LE REGROUPEMENT DES MESSAGES — la meme loi que iOS
 * (`Bubble/MessageDayGrouping.swift`), le web (`utils/message-grouping.ts`) et
 * Android (`MessageGrouping.kt`).
 *
 * DEUX criteres, et deux seulement : MEME AUTEUR et MEME JOUR LOCAL.
 *
 * Il n'y a PAS de fenetre temporelle, contrairement a iMessage : deux messages
 * du meme auteur separes de six heures dans la meme journee restent groupes.
 * L'ecrire avec un « et moins de N minutes » produirait un fil visuellement
 * different d'iOS sur exactement les conversations lentes — celles d'une zone
 * ou le reseau coupe, c'est-a-dire la cible.
 */
export function continue_(precedent: Message | undefined, suivant: Message | undefined): boolean {
  if (!precedent || !suivant) return false;
  if (precedent.auteur.id === '' || precedent.auteur.id !== suivant.auteur.id) return false;
  return memeJourLocal(precedent.envoyeA, suivant.envoyeA);
}

export function memeJourLocal(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
  );
}

export type MessagePlace = {
  readonly message: Message;
  /** Premier d'une suite du meme auteur le meme jour. */
  readonly tete: boolean;
  /** DERNIER d'une suite — c'est LUI qui porte l'avatar et le nom (choix iOS). */
  readonly queue: boolean;
  /** Non nul quand ce message ouvre un nouveau JOUR : le libelle du separateur. */
  readonly ouvreLeJour: string | null;
};

export function place(messages: readonly Message[]): readonly MessagePlace[] {
  return messages.map((message, i) => {
    const precedent = messages[i - 1];
    const suivant = messages[i + 1];
    return {
      message,
      tete: !continue_(precedent, message),
      queue: !continue_(message, suivant),
      ouvreLeJour:
        precedent && memeJourLocal(precedent.envoyeA, message.envoyeA) ? null : libelleDuJour(message.envoyeA),
    };
  });
}

export function libelleDuJour(iso: string, maintenant: Date = new Date()): string {
  const d = new Date(iso);
  const jours = Math.round(
    (new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000,
  );
  if (jours === 0) return "Aujourd'hui";
  if (jours === 1) return 'Hier';
  if (jours < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

export function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
