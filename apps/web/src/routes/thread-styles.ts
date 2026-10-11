/**
 * LES FEUILLES PROPRES À L'ÉCRAN DU FIL (correction de revue #5648, défaut
 * majeur 6) — imports STATIQUES, atteints seulement par `routes/thread.tsx`,
 * lui-même chargé par `import('@/routes/thread')` (`route-table.tsx`) : Vite
 * scinde donc ces CSS dans le CHUNK du fil, jamais dans la feuille globale
 * chargée par `main.tsx` sur CHAQUE route. Extraits de `thread.tsx` (budget de
 * taille) quand la colonne de lecture de bureau (#10072) s'y est ajoutée ;
 * la feuille de bureau du fil (#10101) les rejoint, même chunk.
 */
import '@/styles/thread-scene.css';
import '@/styles/thread-protection.css';
import '@/styles/thread-menu.css';
import '@/styles/thread-system.css';
import '@/styles/thread-column.css';
import '@/styles/thread-desktop.css';
