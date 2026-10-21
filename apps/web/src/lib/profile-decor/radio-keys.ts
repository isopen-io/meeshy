/**
 * Le déplacement du focus dans un groupe de choix (WAI-ARIA radiogroup) :
 * flèches ↓/→ vers le suivant, ↑/← vers le précédent, bouclage aux bords,
 * Début/Fin aux extrémités. `null` pour toute autre touche. En RTL les flèches
 * horizontales suivent le sens de lecture (`rtl` inverse ←/→).
 */
export function nextRadioIndex(key: string, index: number, count: number, rtl = false): number | null {
  if (count <= 0) return null;
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
  const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
  if (key === 'ArrowDown' || key === forward) return (index + 1) % count;
  if (key === 'ArrowUp' || key === backward) return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}
