import type { Message } from './api/types';

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
/**
 * Une horloge de message voyage en `Date` depuis la passerelle et en chaîne
 * ISO depuis une charge JSON non désérialisée. Les deux entrent ici : c'est
 * `new Date(x)` qui tranche, pas l'appelant.
 */
type Clock = Date | string;

export function continues(previous: Message | undefined, next: Message | undefined): boolean {
  if (!previous || !next) return false;
  if (previous.senderId === '' || previous.senderId !== next.senderId) return false;
  return sameLocalDay(previous.createdAt, next.createdAt);
}

export function sameLocalDay(a: Clock, b: Clock): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
  );
}

export type PlacedMessage = {
  readonly message: Message;
  /** Premier d'une suite du meme auteur le meme jour. */
  readonly head: boolean;
  /** DERNIER d'une suite — c'est LUI qui porte l'avatar et le nom (choix iOS). */
  readonly tail: boolean;
  /** Non nul quand ce message ouvre un nouveau JOUR : le libelle du separateur. */
  readonly opensDay: string | null;
};

export function place(messages: readonly Message[]): readonly PlacedMessage[] {
  return messages.map((message, i) => {
    const previous = messages[i - 1];
    const next = messages[i + 1];
    return {
      message,
      head: !continues(previous, message),
      tail: !continues(message, next),
      opensDay:
        previous && sameLocalDay(previous.createdAt, message.createdAt) ? null : dayLabel(message.createdAt),
    };
  });
}

export function dayLabel(iso: Clock, now: Date = new Date()): string {
  const d = new Date(iso);
  const days = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000,
  );
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

export function time(iso: Clock): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
