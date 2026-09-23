import { useEffect, useState } from 'react';

/**
 * **LA SAISIE POSÉE** — la valeur d'un champ de recherche une fois la frappe
 * arrêtée depuis `delayMs`, comme le `debounce` des recherches d'iOS (350 ms,
 * `CommunityListView`, `DiscoverTab`). Un champ VIDÉ se pose sans attendre :
 * effacer une recherche ne doit pas laisser ses résultats une demi-seconde.
 *
 * Un seul site pour les écrans qui cherchent (communautés, découverte) :
 * deux copies auraient divergé au premier réglage de délai. Le lecteur de
 * Réels s'en sert aussi pour le réel POSÉ, dont il tient la salle (#7395) :
 * la même règle — la valeur qui a cessé de bouger — sur un identifiant.
 */
export function useSettled(value: string, delayMs: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (value.trim() === '') {
      setSettled('');
      return undefined;
    }
    const handle = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return settled;
}
