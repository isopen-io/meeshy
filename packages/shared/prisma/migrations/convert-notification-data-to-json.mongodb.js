/**
 * Migration: Convertir le champ Notification.data de String à Json
 *
 * Cette migration convertit les valeurs string JSON en objets JSON natifs
 * pour le champ 'data' dans la collection 'Notification'.
 *
 * IMPORTANT: Cette migration est safe car MongoDB est schemaless.
 * Les documents avec data: null ou data: undefined ne sont pas affectés.
 *
 * Date: 2026-01-28
 * Auteur: Claude Code
 */

// Connexion à la base de données
const db = db.getSiblingDB('meeshy'); // Remplacer 'meeshy' par le nom de votre DB

print('🔄 Début de la migration: Notification.data String → Json');

// Compteurs pour le reporting
let totalProcessed = 0;
let totalConverted = 0;
let totalErrors = 0;

try {
  // Trouver toutes les notifications avec un champ 'data' de type string
  const notifications = db.Notification.find({
    data: { $type: 'string' } // Seulement les strings
  });

  const count = notifications.count();
  print(`📊 ${count} notification(s) trouvée(s) avec data de type string`);

  if (count === 0) {
    print('✅ Aucune notification à migrer - Terminé');
    quit(0);
  }

  // Traiter chaque notification
  notifications.forEach(notification => {
    totalProcessed++;

    try {
      // Tenter de parser le JSON
      const dataString = notification.data;

      if (!dataString || dataString.trim() === '') {
        // Si la string est vide, la convertir en null
        db.Notification.updateOne(
          { _id: notification._id },
          { $set: { data: null } }
        );
        totalConverted++;
        print(`  ✓ ${notification._id}: Converti string vide en null`);
      } else {
        // Tenter de parser le JSON
        let parsedData;
        try {
          parsedData = JSON.parse(dataString);
        } catch (parseError) {
          print(`  ⚠️  ${notification._id}: JSON invalide, conservation de la string`);
          print(`      Valeur: ${dataString.substring(0, 50)}...`);
          totalErrors++;
          return; // Passer à la notification suivante
        }

        // Remplacer la string par l'objet JSON parsé
        db.Notification.updateOne(
          { _id: notification._id },
          { $set: { data: parsedData } }
        );
        totalConverted++;

        if (totalConverted % 100 === 0) {
          print(`  📈 Progression: ${totalConverted}/${count} convertis`);
        }
      }
    } catch (error) {
      totalErrors++;
      print(`  ❌ Erreur pour ${notification._id}: ${error.message}`);
    }
  });

  // Rapport final
  print('\n' + '='.repeat(60));
  print('📊 Rapport de Migration');
  print('='.repeat(60));
  print(`✅ Notifications traitées: ${totalProcessed}`);
  print(`✅ Notifications converties: ${totalConverted}`);
  print(`❌ Erreurs: ${totalErrors}`);
  print('='.repeat(60));

  if (totalErrors > 0) {
    print('\n⚠️  ATTENTION: Certaines notifications n\'ont pas pu être converties');
    print('   Vérifier les logs ci-dessus pour plus de détails');
    quit(1);
  } else {
    print('\n🎉 Migration terminée avec succès!');
    quit(0);
  }

} catch (error) {
  print(`\n❌ ERREUR FATALE: ${error.message}`);
  print(error.stack);
  quit(1);
}
