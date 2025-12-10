// Script de migration des URLs d'avatars vers static.meeshy.me
// Ce script met à jour toutes les URLs d'avatars en base de données

const users = db.User.find({ avatar: { $exists: true, $ne: null } }).toArray();

print(`\n📊 Analyse des avatars:`);
print(`Total utilisateurs avec avatar: ${users.length}`);
print(`\n`);

let updated = 0;
let skipped = 0;
let errors = 0;

users.forEach(user => {
    const oldAvatar = user.avatar;
    let newAvatar = oldAvatar;
    
    // Cas 1: URLs avec meeshy.me (ancien domaine)
    if (oldAvatar.includes('meeshy.me') && !oldAvatar.includes('static.meeshy.me')) {
        newAvatar = oldAvatar.replace('https://meeshy.me', 'https://static.meeshy.me');
        newAvatar = newAvatar.replace('http://meeshy.me', 'https://static.meeshy.me');
    }
    
    // Cas 2: URLs avec localhost (dev)
    if (oldAvatar.includes('localhost')) {
        newAvatar = oldAvatar.replace('http://localhost:3100', 'https://static.meeshy.me');
        newAvatar = newAvatar.replace('http://localhost:3000', 'https://static.meeshy.me');
    }
    
    // Cas 3: Supprimer /i/p/ et le remplacer par juste /
    if (newAvatar.includes('/i/p/')) {
        newAvatar = newAvatar.replace('/i/p/', '/');
    }
    
    // Cas 4: Si l'URL commence par /i/ (chemin relatif), ajouter le domaine
    if (newAvatar.startsWith('/i/')) {
        newAvatar = 'https://static.meeshy.me' + newAvatar.replace('/i/', '/');
    }
    
    if (oldAvatar !== newAvatar) {
        try {
            db.User.updateOne(
                { _id: user._id },
                { $set: { avatar: newAvatar } }
            );
            print(`✅ ${user.username}: ${oldAvatar} → ${newAvatar}`);
            updated++;
        } catch (e) {
            print(`❌ Erreur pour ${user.username}: ${e.message}`);
            errors++;
        }
    } else {
        print(`⏭️  ${user.username}: Déjà à jour (${oldAvatar})`);
        skipped++;
    }
});

print(`\n`);
print(`📈 Résumé de la migration:`);
print(`  - Mis à jour: ${updated}`);
print(`  - Déjà à jour: ${skipped}`);
print(`  - Erreurs: ${errors}`);
print(`\n`);

// Vérification finale
print(`📋 URLs après migration (5 premiers):`);
db.User.find({ avatar: { $exists: true, $ne: null } }, { username: 1, avatar: 1, _id: 0 }).limit(5).forEach(u => {
    print(`  ${u.username}: ${u.avatar}`);
});

print(`\n✅ Migration terminée\n`);

