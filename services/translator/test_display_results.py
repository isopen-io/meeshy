#!/usr/bin/env python3
"""
Affichage des résultats de traduction - Entrée et Sortie
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from utils.text_segmentation import TextSegmenter, EMOJI_PATTERN


def print_test(name, text, length_category):
    """Affiche un test complet avec entrée et sortie"""
    print('\n' + '='*100)
    print(f'🧪 TEST: {name} ({length_category})')
    print('='*100)

    print(f'\n📥 TEXTE ORIGINAL ({len(text)} chars, {text.count(chr(10))} lignes):')
    print('-'*100)
    print(text)
    print('-'*100)

    # Segmentation
    segmenter = TextSegmenter(max_segment_length=100)
    segments, emojis_map = segmenter.segment_text(text)

    original_emojis = EMOJI_PATTERN.findall(text)
    print(f'\n📊 Segmentation:')
    print(f'   • {len(segments)} segments créés')
    print(f'   • {len(emojis_map)} emojis extraits sur {len(original_emojis)} détectés')

    # Réassemblage
    reassembled = segmenter.reassemble_text(segments, emojis_map)

    print(f'\n📤 TEXTE RÉASSEMBLÉ ({len(reassembled)} chars, {reassembled.count(chr(10))} lignes):')
    print('-'*100)
    print(reassembled)
    print('-'*100)

    # Vérifications
    reassembled_emojis = EMOJI_PATTERN.findall(reassembled)
    print(f'\n📊 VÉRIFICATIONS:')
    print(f'   • Longueur: {len(text)} → {len(reassembled)} chars')
    print(f'   • Lignes: {text.count(chr(10))} → {reassembled.count(chr(10))} lignes')
    print(f'   • Emojis: {len(original_emojis)} → {len(reassembled_emojis)}')

    if reassembled == text:
        print(f'\n✅ PARFAIT: Texte identique à l\'original!')
        print(f'✅ Structure préservée à 100%')
        return True
    else:
        print(f'\n❌ DIFFÉRENCE détectée')
        if len(reassembled) != len(text):
            print(f'   • Longueur différente: {len(text)} → {len(reassembled)}')
        if text.count(chr(10)) != reassembled.count(chr(10)):
            print(f'   • Lignes différentes: {text.count(chr(10))} → {reassembled.count(chr(10))}')
        return False


# ============================================================================
# TESTS
# ============================================================================

# Test 1: 100-200 chars
text_100 = """🎉 New Feature Alert!

We've just launched our new dashboard with real-time analytics. Check it out now and let us know what you think! 📊"""

# Test 2: 400 chars
text_400 = """📢 TEAM UPDATE - Week of Dec 4th

🎯 ACHIEVEMENTS
✅ Released v3.2 with 15 new features
✅ Reduced API response time by 40%
✅ Onboarded 5 new team members
✅ Completed security audit

🔄 IN PROGRESS
• Mobile app redesign (75% complete)
• Database migration to PostgreSQL
• New authentication system testing

⏰ UPCOMING
• Holiday team building event 🎄
• Q4 performance reviews
• 2025 roadmap planning session

Great work everyone! Keep up the momentum! 🚀💪

#TeamWork #Progress #Innovation"""

# Test 3: 600 chars
text_600 = """🚀 PRODUCT RELEASE v4.0 - Major Update

📱 NEW FEATURES

🎨 User Interface
✅ Complete redesign with modern Material Design 3
✅ Dark mode support across all screens
✅ Customizable themes and color schemes
✅ Improved navigation with bottom tabs
✅ Animated transitions and micro-interactions

⚡ Performance
✅ 60% faster app startup time
✅ Reduced memory usage by 35%
✅ Optimized image loading and caching
✅ Improved battery efficiency

🔐 Security
✅ End-to-end encryption for all messages
✅ Biometric authentication (Face ID / Touch ID)
✅ Two-factor authentication support
✅ Enhanced privacy controls

🐛 BUG FIXES
• Fixed crash on iOS 16
• Resolved sync issues
• Fixed notification delays

📥 Download now and experience the difference! 🎉

#AppUpdate #NewFeatures #UserExperience"""

# Test 4: 900 chars (exemple original)
text_900 = """🎉 MAJOR UPDATES - Last 48 Hours 🚀

🎤 AUDIO RECORDING OVERHAUL
✅ Universal MP4/AAC format - works on ALL browsers (Safari, Chrome, Firefox, Brave)
✅ Fixed Chrome buffer issues - no more audio glitches!
✅ Up to 10-minute recordings supported
✅ Multiple audio files in single message
✅ Smart send button - disabled during recording
✅ Optimized blob & memory management

🖼️ IMAGES & ATTACHMENTS
✅ Fully responsive on all screen sizes
✅ Smart alignment based on sender/receiver
✅ Optimized PNG support
✅ Enhanced image carousel

🔗 SECURE CONVERSATION LINKS
✅ Quick link creation modal
✅ New params: requireAccount & requireBirthday
✅ 2-step config with summary

⚡ PERFORMANCE & UX
✅ Google Analytics integrated
✅ Real-time WebSocket fixes
✅ Repositioned message actions
✅ Optimized mobile UI/UX

📊 40+ commits | Performance boost | Better audio quality!

#Meeshy #Updates #RealTimeMessaging #AudioMessages"""

# Test 5: 1500 chars
text_1500 = """📊 Q4 2025 QUARTERLY REPORT

🎯 EXECUTIVE SUMMARY
We're thrilled to share our strongest quarter yet! Revenue up 145%, user growth at 220%, and customer satisfaction at an all-time high of 96%. Our team has worked incredibly hard to deliver exceptional results. 🚀

💰 FINANCIAL HIGHLIGHTS
✅ Revenue: $4.2M (↑ 145% YoY)
✅ ARR: $16.8M (↑ 180% YoY)
✅ Gross Margin: 78% (↑ 5pts)
✅ Cash Position: $8.5M
✅ Burn Rate: -$350K/month (improved 40%)

📈 GROWTH METRICS
✅ Total Users: 125,000 (↑ 220% YoY)
✅ Active Users (DAU): 45,000 (↑ 190%)
✅ Enterprise Customers: 450 (↑ 280%)
✅ Customer Retention: 94% (best in class)
✅ NPS Score: 72 (industry leading)

🚀 PRODUCT ACHIEVEMENTS
✅ Launched 5 major features
✅ 99.98% uptime maintained
✅ API response time: 120ms avg (↓ 40%)
✅ Mobile apps: 4.8★ rating (25K reviews)
✅ Integration partnerships: +15 new

👥 TEAM GROWTH
✅ Headcount: 45 → 68 (+51%)
✅ Engineering: 18 → 28
✅ Sales: 8 → 15
✅ Customer Success: 5 → 10
✅ Diversity: 48% women, 35% underrepresented minorities

🎯 Q1 2025 OBJECTIVES
🔹 Launch enterprise tier with advanced features
🔹 Expand to European market (UK, DE, FR)
🔹 Achieve $6M+ revenue target
🔹 Scale team to 85 employees
🔹 Raise Series A funding ($15M target)

🎉 TEAM RECOGNITION
Huge shoutout to everyone who made this possible! Special recognition to Engineering for crushing performance goals, Sales for exceeding targets by 160%, and Customer Success for maintaining our 94% retention rate! 👏🌟

Let's keep this momentum going into 2025! 💪🚀

#QuarterlyReport #Growth #Success #TeamWork #Innovation"""


if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.WARNING)

    print('\n' + '='*100)
    print('🚀 TESTS DE TRADUCTION - AFFICHAGE ENTRÉE/SORTIE')
    print('='*100)

    results = []

    results.append(print_test("Product announcement", text_100, "100-200 chars"))
    results.append(print_test("Team update", text_400, "400 chars"))
    results.append(print_test("Product release notes", text_600, "600 chars"))
    results.append(print_test("Major platform updates (EXEMPLE ORIGINAL)", text_900, "900 chars"))
    results.append(print_test("Quarterly report", text_1500, "1500 chars"))

    # Rapport final
    print('\n' + '='*100)
    print('📊 RAPPORT FINAL')
    print('='*100)

    passed = sum(1 for r in results if r)
    total = len(results)

    print(f'\nRésultats: {passed}/{total} tests réussis ({100*passed/total:.0f}%)')

    if passed == total:
        print('\n🎉 TOUS LES TESTS ONT RÉUSSI!')
        print('✅ La structure est parfaitement préservée pour tous les textes!')
    else:
        print(f'\n⚠️  {total-passed} test(s) ont échoué')

    sys.exit(0 if passed == total else 1)
