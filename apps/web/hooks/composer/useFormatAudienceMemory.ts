'use client';

import { useCallback, useEffect, useState } from 'react';
import { PUBLICATION_VISIBILITY_OPTIONS } from '@/components/v2/publication-visibility';
import { DEFAULT_PUBLICATION_VISIBILITY } from '@meeshy/shared/types/post';
import type { PostVisibility } from '@meeshy/shared/types/post';

/**
 * La mémoire d'audience PAR FORMAT (loi 10 de la doctrine) — un réglage retenu
 * par `localStorage`, sous une clé nommée par le FORMAT qui la lit.
 *
 * Miroir de `@AppStorage(ComposerAudienceMemory.statusKey)`
 * (`apps/ios/.../ComposerMoodSurface.swift`) : MÊME clé littérale
 * (`"lastStatusVisibility"`), pour que les deux plateformes documentent le
 * même réglage produit, même si `localStorage` (navigateur) et `UserDefaults`
 * (iOS, via `@AppStorage`) sont deux magasins physiquement indépendants — rien
 * ne traverse entre les deux appareils. Une clé neuve en ferait une mémoire
 * SECONDE à faire diverger de la doctrine, pas une mémoire partagée.
 *
 * **Seul le format `status` a un appelant aujourd'hui** — le mood (W6). Le
 * mot « PAR FORMAT » dans la loi est général ; l'implémentation ne l'est pas
 * encore : `STORAGE_KEYS` ne porte qu'UNE entrée, et l'ajout d'un second
 * format (ex. la mémoire du format post, capacité que le web n'a pas non
 * plus) est un geste futur, pas une garantie que ce module tient aujourd'hui.
 */
const STORAGE_KEYS = {
  status: 'lastStatusVisibility',
} as const;

export type AudienceMemoryFormat = keyof typeof STORAGE_KEYS;

const KNOWN_VISIBILITIES = new Set<string>(PUBLICATION_VISIBILITY_OPTIONS.map((opt) => opt.id));

/**
 * Ce qu'une mémoire rend quand on la relit — `null` dès qu'elle porte autre
 * chose qu'une audience CONNUE (mémoire d'une version antérieure, réglage
 * effacé, valeur corrompue). Ne lève JAMAIS : `localStorage` est indisponible
 * en navigation privée sur certains navigateurs, et l'appelant doit alors
 * recevoir le DÉFAUT, jamais une exception.
 */
function readRemembered(format: AudienceMemoryFormat): PostVisibility | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS[format]);
    return raw !== null && KNOWN_VISIBILITIES.has(raw) ? (raw as PostVisibility) : null;
  } catch {
    return null;
  }
}

export interface UseFormatAudienceMemoryResult {
  readonly visibility: PostVisibility;
  /** Choisir écrit la mémoire dans le MÊME geste — sinon une publication
   * suivante repartirait sur l'audience d'avant. */
  readonly remember: (next: PostVisibility) => void;
}

/**
 * @param format Le format dont on relit/écrit la mémoire — `'status'` seul
 * aujourd'hui (voir la doc du module).
 */
export function useFormatAudienceMemory(format: AudienceMemoryFormat): UseFormatAudienceMemoryResult {
  const [visibility, setVisibility] = useState<PostVisibility>(DEFAULT_PUBLICATION_VISIBILITY);

  // La mémoire s'applique à l'APPARITION (un effet, pas l'état initial) : un
  // rendu serveur et le premier rendu client doivent peindre le MÊME
  // balisage, et `localStorage` n'existe que dans le navigateur — le lire
  // dans l'initialiseur de `useState` ferait diverger les deux passes.
  useEffect(() => {
    const remembered = readRemembered(format);
    if (remembered) setVisibility(remembered);
  }, [format]);

  const remember = useCallback((next: PostVisibility) => {
    setVisibility(next);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEYS[format], next);
    } catch {
      // Navigation privée / quota plein : le réglage vit pour cette session
      // seulement, jamais une exception remontée à l'auteur.
    }
  }, [format]);

  return { visibility, remember };
}
