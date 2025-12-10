/**
 * Script de normalisation des données utilisateur - OBSOLÈTE
 *
 * ⚠️ ATTENTION: Ce script est obsolète et ne doit PLUS être utilisé!
 *
 * Ancienne approche (obsolète):
 * - email et username en minuscules ❌
 * - firstName et lastName avec première lettre en majuscule ✓
 * - displayName (pseudonyme) en minuscules ❌
 *
 * Nouvelle approche (depuis 2025):
 * - email en minuscules ✓ (standard email)
 * - username préservé tel qu'entré par l'utilisateur (comparaisons en case-insensitive)
 * - displayName préservé tel qu'entré (trim + suppression \n et \t uniquement)
 * - firstName et lastName avec première lettre en majuscule ✓
 */

// Fonction pour capitaliser (première lettre en majuscule, reste en minuscule)
function capitalize(str) {
  if (!str) return str;
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

print("=== NORMALISATION DES DONNÉES UTILISATEUR ===");
print("");
print("Date: " + new Date().toISOString());
print("");

// Compter les utilisateurs
const totalUsers = db.User.countDocuments({});
print("Nombre total d'utilisateurs: " + totalUsers);
print("");

// Statistiques avant normalisation
print("--- État AVANT normalisation ---");
const beforeStats = {
  emailsWithUppercase: db.User.countDocuments({ email: { $regex: /[A-Z]/ } }),
  usernamesWithUppercase: db.User.countDocuments({ username: { $regex: /[A-Z]/ } }),
  displayNamesWithUppercase: db.User.countDocuments({ displayName: { $regex: /[A-Z]/ } })
};
print("Emails avec majuscules: " + beforeStats.emailsWithUppercase);
print("Usernames avec majuscules: " + beforeStats.usernamesWithUppercase);
print("DisplayNames avec majuscules: " + beforeStats.displayNamesWithUppercase);
print("");

// Récupérer tous les utilisateurs
const users = db.User.find({}).toArray();
let updatedCount = 0;
let errorCount = 0;

print("--- Normalisation en cours ---");

users.forEach((user, index) => {
  try {
    const updates = {};
    let hasChanges = false;

    // Normaliser email (minuscules)
    if (user.email) {
      const normalizedEmail = user.email.toLowerCase();
      if (normalizedEmail !== user.email) {
        updates.email = normalizedEmail;
        hasChanges = true;
      }
    }

    // Normaliser username (minuscules)
    if (user.username) {
      const normalizedUsername = user.username.toLowerCase();
      if (normalizedUsername !== user.username) {
        updates.username = normalizedUsername;
        hasChanges = true;
      }
    }

    // Normaliser displayName (minuscules)
    if (user.displayName) {
      const normalizedDisplayName = user.displayName.toLowerCase();
      if (normalizedDisplayName !== user.displayName) {
        updates.displayName = normalizedDisplayName;
        hasChanges = true;
      }
    }

    // Normaliser firstName (capitalize)
    if (user.firstName) {
      const normalizedFirstName = capitalize(user.firstName);
      if (normalizedFirstName !== user.firstName) {
        updates.firstName = normalizedFirstName;
        hasChanges = true;
      }
    }

    // Normaliser lastName (capitalize)
    if (user.lastName) {
      const normalizedLastName = capitalize(user.lastName);
      if (normalizedLastName !== user.lastName) {
        updates.lastName = normalizedLastName;
        hasChanges = true;
      }
    }

    // Mettre à jour si nécessaire
    if (hasChanges) {
      db.User.updateOne(
        { _id: user._id },
        { $set: updates }
      );
      updatedCount++;
      
      if ((index + 1) % 10 === 0) {
        print("Progression: " + (index + 1) + "/" + users.length);
      }
    }
  } catch (error) {
    print("Erreur pour l'utilisateur " + user._id + ": " + error);
    errorCount++;
  }
});

print("");
print("--- Résultats de la normalisation ---");
print("Utilisateurs mis à jour: " + updatedCount);
print("Erreurs: " + errorCount);
print("");

// Statistiques après normalisation
print("--- État APRÈS normalisation ---");
const afterStats = {
  emailsWithUppercase: db.User.countDocuments({ email: { $regex: /[A-Z]/ } }),
  usernamesWithUppercase: db.User.countDocuments({ username: { $regex: /[A-Z]/ } }),
  displayNamesWithUppercase: db.User.countDocuments({ displayName: { $regex: /[A-Z]/ } })
};
print("Emails avec majuscules: " + afterStats.emailsWithUppercase);
print("Usernames avec majuscules: " + afterStats.usernamesWithUppercase);
print("DisplayNames avec majuscules: " + afterStats.displayNamesWithUppercase);
print("");

// Afficher quelques exemples
print("--- Exemples d'utilisateurs normalisés ---");
const examples = db.User.find({}, {
  username: 1,
  email: 1,
  firstName: 1,
  lastName: 1,
  displayName: 1,
  _id: 0
}).limit(5).toArray();
printjson(examples);
print("");

print("✅ Normalisation terminée!");
print("Date de fin: " + new Date().toISOString());

