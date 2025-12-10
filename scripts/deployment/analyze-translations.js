// ===== MEESHY - ANALYSE DES TRADUCTIONS =====
// Script pour analyser le nombre de messages et de traductions dans la base de données
// Usage: Exécuter ce script via mongosh dans le conteneur database

const db = db.getSiblingDB('meeshy');

print('\n========================================');
print('📊 ANALYSE DES TRADUCTIONS - MEESHY');
print('========================================\n');

// Comptage des messages
const totalMessages = db.Message.countDocuments();
print(`📨 Total de messages: ${totalMessages}`);

// Comptage des traductions
const totalTranslations = db.MessageTranslation.countDocuments();
print(`🌐 Total de traductions: ${totalTranslations}`);

// Calcul du ratio
if (totalMessages > 0) {
    const ratio = (totalTranslations / totalMessages).toFixed(2);
    print(`📈 Ratio traductions/messages: ${ratio}`);
    print(`   (${totalTranslations} traductions pour ${totalMessages} messages)`);
} else {
    print('⚠️  Aucun message trouvé dans la base de données');
}

print('\n');

// Analyse par langue cible
print('🌍 Répartition par langue cible:');
print('─────────────────────────────────');
const translationsByLanguage = db.MessageTranslation.aggregate([
    {
        $group: {
            _id: '$targetLanguage',
            count: { $sum: 1 }
        }
    },
    {
        $sort: { count: -1 }
    }
]).toArray();

if (translationsByLanguage.length > 0) {
    translationsByLanguage.forEach(lang => {
        const percentage = totalTranslations > 0 ? ((lang.count / totalTranslations) * 100).toFixed(1) : 0;
        print(`  ${lang._id}: ${lang.count} (${percentage}%)`);
    });
} else {
    print('  Aucune traduction trouvée');
}

print('\n');

// Analyse par modèle de traduction
print('🤖 Répartition par modèle de traduction:');
print('──────────────────────────────────────');
const translationsByModel = db.MessageTranslation.aggregate([
    {
        $group: {
            _id: '$translationModel',
            count: { $sum: 1 }
        }
    },
    {
        $sort: { count: -1 }
    }
]).toArray();

if (translationsByModel.length > 0) {
    translationsByModel.forEach(model => {
        const percentage = totalTranslations > 0 ? ((model.count / totalTranslations) * 100).toFixed(1) : 0;
        print(`  ${model._id || 'non spécifié'}: ${model.count} (${percentage}%)`);
    });
} else {
    print('  Aucune traduction trouvée');
}

print('\n');

// Analyse des messages avec/sans traductions
print('📊 Messages avec/sans traductions:');
print('──────────────────────────────────');
const messagesWithTranslations = db.Message.aggregate([
    {
        $lookup: {
            from: 'MessageTranslation',
            localField: '_id',
            foreignField: 'messageId',
            as: 'translations'
        }
    },
    {
        $project: {
            hasTranslations: { $gt: [{ $size: '$translations' }, 0] },
            translationsCount: { $size: '$translations' }
        }
    },
    {
        $group: {
            _id: '$hasTranslations',
            count: { $sum: 1 },
            avgTranslations: { $avg: '$translationsCount' }
        }
    }
]).toArray();

const withTranslations = messagesWithTranslations.find(g => g._id === true);
const withoutTranslations = messagesWithTranslations.find(g => g._id === false);

if (withTranslations) {
    const percentage = totalMessages > 0 ? ((withTranslations.count / totalMessages) * 100).toFixed(1) : 0;
    print(`  ✅ Avec traductions: ${withTranslations.count} (${percentage}%)`);
    print(`     Moyenne de traductions: ${withTranslations.avgTranslations.toFixed(2)}`);
}

if (withoutTranslations) {
    const percentage = totalMessages > 0 ? ((withoutTranslations.count / totalMessages) * 100).toFixed(1) : 0;
    print(`  ❌ Sans traductions: ${withoutTranslations.count} (${percentage}%)`);
}

print('\n');

// Analyse des langues sources
print('🔤 Répartition par langue source:');
print('─────────────────────────────────');
const messagesByLanguage = db.Message.aggregate([
    {
        $group: {
            _id: '$originalLanguage',
            count: { $sum: 1 }
        }
    },
    {
        $sort: { count: -1 }
    }
]).toArray();

if (messagesByLanguage.length > 0) {
    messagesByLanguage.forEach(lang => {
        const percentage = totalMessages > 0 ? ((lang.count / totalMessages) * 100).toFixed(1) : 0;
        print(`  ${lang._id}: ${lang.count} (${percentage}%)`);
    });
} else {
    print('  Aucun message trouvé');
}

print('\n');

// Performance du cache
print('⚡ Analyse du cache:');
print('───────────────────');
const uniqueCacheKeys = db.MessageTranslation.distinct('cacheKey').length;
print(`  Clés de cache uniques: ${uniqueCacheKeys}`);
if (totalTranslations > 0 && uniqueCacheKeys > 0) {
    const cacheEfficiency = ((totalTranslations - uniqueCacheKeys) / totalTranslations * 100).toFixed(1);
    print(`  Réutilisation du cache: ${cacheEfficiency}%`);
    print(`  (${totalTranslations - uniqueCacheKeys} traductions réutilisées)`);
}

print('\n');

// Messages récents
print('📅 Messages récents (dernières 24h):');
print('────────────────────────────────────');
const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
const recentMessages = db.Message.countDocuments({ createdAt: { $gte: oneDayAgo } });
const recentTranslations = db.MessageTranslation.countDocuments({ createdAt: { $gte: oneDayAgo } });
print(`  Messages: ${recentMessages}`);
print(`  Traductions: ${recentTranslations}`);
if (recentMessages > 0) {
    const recentRatio = (recentTranslations / recentMessages).toFixed(2);
    print(`  Ratio: ${recentRatio}`);
}

print('\n========================================\n');
