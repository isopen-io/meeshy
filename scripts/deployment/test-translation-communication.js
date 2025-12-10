// ===== MEESHY - TEST DE COMMUNICATION ET TRADUCTIONS =====
// Script pour tester la communication entre utilisateurs et vérifier les traductions
// Usage: Exécuter ce script via mongosh dans le conteneur database

const db = db.getSiblingDB('meeshy');

print('\n========================================');
print('🧪 TEST DE COMMUNICATION - MEESHY');
print('========================================\n');

// Étape 1: Trouver les utilisateurs jcnm et admin
print('🔍 Recherche des utilisateurs...\n');

const jcnm = db.User.findOne({ username: 'jcnm' });
const admin = db.User.findOne({ username: 'admin' });

if (!jcnm) {
    print('❌ Utilisateur jcnm non trouvé!');
} else {
    print(`✅ Utilisateur jcnm trouvé: ${jcnm._id}`);
    print(`   - Langue système: ${jcnm.systemLanguage}`);
    print(`   - Langue régionale: ${jcnm.regionalLanguage}`);
    print(`   - Traduction auto: ${jcnm.autoTranslateEnabled}`);
}

if (!admin) {
    print('❌ Utilisateur admin non trouvé!');
} else {
    print(`✅ Utilisateur admin trouvé: ${admin._id}`);
    print(`   - Langue système: ${admin.systemLanguage}`);
    print(`   - Langue régionale: ${admin.regionalLanguage}`);
    print(`   - Traduction auto: ${admin.autoTranslateEnabled}`);
}

if (!jcnm || !admin) {
    print('\n❌ Impossible de continuer sans les deux utilisateurs\n');
    print('========================================\n');
} else {
    print('\n');
    
    // Étape 2: Trouver ou créer une conversation entre eux
    print('💬 Recherche d\'une conversation entre jcnm et admin...\n');
    
    const conversation = db.Conversation.findOne({
        type: 'direct',
        $or: [
            { identifier: /^jcnm.*admin/ },
            { identifier: /^admin.*jcnm/ }
        ]
    });
    
    if (!conversation) {
        print('⚠️  Aucune conversation directe trouvée entre jcnm et admin');
        print('💡 Suggestion: Créez une conversation directe via l\'interface\n');
    } else {
        print(`✅ Conversation trouvée: ${conversation.identifier} (${conversation._id})`);
        print(`   Type: ${conversation.type}`);
        print(`   Titre: ${conversation.title || 'Non défini'}\n`);
        
        // Étape 3: Analyser les messages dans cette conversation
        print('📊 Analyse des messages dans cette conversation...\n');
        
        const totalMessages = db.Message.countDocuments({
            conversationId: conversation._id
        });
        
        print(`📨 Total de messages: ${totalMessages}`);
        
        if (totalMessages === 0) {
            print('⚠️  Aucun message dans cette conversation');
            print('💡 Suggestion: Envoyez des messages via l\'interface\n');
        } else {
            // Récupérer les derniers messages
            const messages = db.Message.find({
                conversationId: conversation._id
            }).sort({ createdAt: -1 }).limit(10).toArray();
            
            print('\n📝 Derniers messages:');
            print('───────────────────────────────────────\n');
            
            messages.reverse().forEach((msg, index) => {
                const sender = db.User.findOne({ _id: msg.senderId });
                const senderName = sender ? sender.username : 'inconnu';
                
                print(`${index + 1}. [${msg.createdAt.toISOString()}] ${senderName}:`);
                print(`   "${msg.content.substring(0, 80)}${msg.content.length > 80 ? '...' : ''}"`);
                print(`   Langue: ${msg.originalLanguage}`);
                
                // Vérifier les traductions pour ce message
                const translations = db.MessageTranslation.find({
                    messageId: msg._id
                }).toArray();
                
                if (translations.length === 0) {
                    print(`   ❌ 0 traduction`);
                } else {
                    print(`   ✅ ${translations.length} traduction(s):`);
                    translations.forEach(t => {
                        print(`      - ${t.sourceLanguage} → ${t.targetLanguage}: "${t.translatedContent.substring(0, 50)}..."`);
                        print(`        Modèle: ${t.translationModel}, Cache: ${t.cacheKey.substring(0, 20)}...`);
                    });
                }
                print('');
            });
            
            // Statistiques des traductions
            const messagesWithTranslations = messages.filter(msg => {
                const count = db.MessageTranslation.countDocuments({ messageId: msg._id });
                return count > 0;
            }).length;
            
            const totalTranslations = db.MessageTranslation.countDocuments({
                messageId: { $in: messages.map(m => m._id) }
            });
            
            print('\n📈 Statistiques de traduction:');
            print('───────────────────────────────────────');
            print(`Messages analysés: ${messages.length}`);
            print(`Messages avec traductions: ${messagesWithTranslations}`);
            print(`Messages sans traductions: ${messages.length - messagesWithTranslations}`);
            print(`Total de traductions: ${totalTranslations}`);
            
            if (totalTranslations > 0) {
                const ratio = (totalTranslations / messages.length).toFixed(2);
                print(`Ratio traductions/message: ${ratio}`);
            }
        }
    }
    
    print('\n========================================');
    print('📋 RÉSUMÉ');
    print('========================================');
    
    if (!conversation) {
        print('❌ Aucune conversation directe trouvée');
        print('');
        print('🚀 Actions recommandées:');
        print('1. Connectez-vous en tant que jcnm');
        print('2. Créez une conversation directe avec admin');
        print('3. Envoyez quelques messages');
        print('4. Relancez ce script pour vérifier les traductions');
    } else if (totalMessages === 0) {
        print('⚠️  Conversation trouvée mais aucun message');
        print('');
        print('🚀 Actions recommandées:');
        print('1. Connectez-vous en tant que jcnm ou admin');
        print('2. Envoyez quelques messages dans la conversation');
        print('3. Relancez ce script pour vérifier les traductions');
    } else {
        const totalTranslations = db.MessageTranslation.countDocuments({
            messageId: {
                $in: db.Message.find({
                    conversationId: conversation._id
                }).map(m => m._id)
            }
        });
        
        if (totalTranslations === 0) {
            print('❌ Messages trouvés mais AUCUNE traduction créée!');
            print('');
            print('🔍 Diagnostic:');
            print('Le service Translator ne semble pas fonctionner correctement.');
            print('');
            print('🚀 Actions recommandées:');
            print('1. Vérifier les logs du translator: docker compose logs -f meeshy-translator');
            print('2. Vérifier que le service est actif: docker compose ps meeshy-translator');
            print('3. Tester la communication Gateway → Translator');
        } else {
            print('✅ Messages ET traductions trouvés!');
            print('');
            print(`📊 Ratio: ${(totalTranslations / totalMessages).toFixed(2)} traductions/message`);
            print('');
            print('✨ Le système de traduction fonctionne correctement!');
        }
    }
    
    print('========================================\n');
}
