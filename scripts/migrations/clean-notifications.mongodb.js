/**
 * Script MongoDB - Nettoyer toutes les notifications
 *
 * ATTENTION: Ce script supprime TOUTES les notifications existantes.
 * À utiliser uniquement si vous voulez repartir de zéro.
 *
 * Exécution:
 * mongosh "mongodb://..." < clean-notifications.mongodb.js
 *
 * Ou via mongosh interactif:
 * > use votre_db_name
 * > db.Notification.deleteMany({})
 */

// Se connecter à la DB (automatique si exécuté via mongosh)
const result = db.Notification.deleteMany({});

print(`✅ Supprimé ${result.deletedCount} notifications`);
print('Le système peut maintenant créer des notifications avec la nouvelle structure.');
