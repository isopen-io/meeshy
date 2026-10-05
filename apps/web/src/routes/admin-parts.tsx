/**
 * LES PIÈCES PARTAGÉES DE L'ESPACE D'ADMINISTRATION (#6432).
 *
 * Ce n'est plus qu'un relais : le squelette, le refus et l'annonce vivent dans
 * `components/admin` (#9463), et le cartouche de compteur, sans plus aucun
 * consommateur, a cédé sa place à `AdminStatCard`. Le fichier part quand le
 * dernier écran importe le kit directement.
 */

export { ADMIN_HEADER_HEIGHT, AdminHeader, AdminScreenFrame } from './admin-shell';
/* Le squelette, le refus plein écran et l'annonce vivent désormais dans le kit (#9463) : ces
   réexports tiennent les écrans pas encore migrés, et partent avec ce fichier. */
export { AdminAnnouncement } from '@/components/admin/announcement';
export { AdminDeniedScreen as AdminDenied, AdminSkeleton } from '@/components/admin/states';
