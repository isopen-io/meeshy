import { useSyncExternalStore } from 'react';

/**
 * **TOUCHER L'HUMEUR MONTRE L'HUMEUR ET SON TEXTE** (#10528, directive porteur
 * du 2026-10-13) — miroir de `StatusBubbleController` (iOS), que la racine
 * présente par-dessus l'écran où l'on est.
 *
 * Un magasin hors de React, minuscule, sur le patron de `profile-peek.ts` :
 * la pastille ne transporte que QUI et QUELLE humeur. Le texte se lit à
 * l'ouverture, dans le corpus déjà servi (`mood-peek-content.ts`) — aucune
 * rangée de liste ne le porte, donc aucune ne se re-rend pour lui.
 *
 * **SANS HÔTE MONTÉ, LA PASTILLE RESTE UN DESSIN** : un bouton sans effet
 * serait un contrôle qui ment (loi 4).
 */
export type MoodPeek = {
  readonly authorId: string;
  readonly emoji: string;
  readonly name?: string;
};

let current: MoodPeek | null = null;
let hosts = 0;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function currentMoodPeek(): MoodPeek | null {
  return current;
}

function hosted(): boolean {
  return hosts > 0;
}

export function peekMood(peek: MoodPeek): boolean {
  if (hosts === 0 || peek.authorId === '' || peek.emoji === '') return false;
  current = peek;
  emit();
  return true;
}

export function closeMoodPeek(): void {
  if (current === null) return;
  current = null;
  emit();
}

/** Déclare un hôte : rend sa propre désinscription. */
export function registerMoodPeekHost(): () => void {
  hosts += 1;
  emit();
  return () => {
    hosts -= 1;
    if (hosts === 0) closeMoodPeek();
    emit();
  };
}

export function useMoodPeek(): MoodPeek | null {
  return useSyncExternalStore(subscribe, currentMoodPeek, currentMoodPeek);
}

/** Un hôte écoute-t-il ? La pastille ne devient un bouton qu'à cette condition. */
export function useMoodPeekHosted(): boolean {
  return useSyncExternalStore(subscribe, hosted, hosted);
}
