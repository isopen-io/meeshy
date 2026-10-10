#!/usr/bin/env python3
"""Publie la fiche Google Play de me.meeshy.app (#9843) par l'API Android Publisher.

    python3 apps/web/android/play/publish-listing.py [--graphics <dossier>] [--dry-run]

Textes : apps/web/android/play/listings/<langue>/{title,short_description,full_description}.txt
Visuels (hors dépôt) : <dossier>/icon-512.png, <dossier>/<langue>/feature-graphic.png,
<dossier>/<langue>/phone/*.png (2 à 8, triés par nom). Une langue sans visuels garde
ceux de la langue par défaut.
Compte de service : ~/.meeshy-secrets/android-release/play-service-account.json
(PyJWT requis : /opt/homebrew/bin/python3 l'a).

Tout passe dans UNE édition, validée à la fin : une erreur au milieu ne publie rien.
"""
import argparse
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import jwt

PACKAGE = 'me.meeshy.app'
API = f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE}'
UPLOAD = f'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{PACKAGE}'
SERVICE_ACCOUNT = Path.home() / '.meeshy-secrets/android-release/play-service-account.json'
LISTINGS = Path(__file__).resolve().parent / 'listings'
DEFAULT_GRAPHICS = Path.home() / 'Documents/Meeshy-campagne-virale-HD/6-google-play'
DEFAULT_LANGUAGE = 'fr-FR'
DETAILS = {
    'defaultLanguage': DEFAULT_LANGUAGE,
    'contactEmail': 'support@meeshy.me',
    'contactWebsite': 'https://meeshy.me',
}
LIMITS = {'title': 30, 'short_description': 80, 'full_description': 4000}


def access_token():
    account = json.loads(SERVICE_ACCOUNT.read_text())
    now = int(time.time())
    assertion = jwt.encode(
        {
            'iss': account['client_email'],
            'scope': 'https://www.googleapis.com/auth/androidpublisher',
            'aud': 'https://oauth2.googleapis.com/token',
            'iat': now,
            'exp': now + 3600,
        },
        account['private_key'],
        algorithm='RS256',
    )
    body = urllib.parse.urlencode({
        'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion': assertion,
    }).encode()
    return json.load(urllib.request.urlopen('https://oauth2.googleapis.com/token', body))['access_token']


class Play:
    def __init__(self, token):
        self.token = token

    def call(self, method, url, body=None, data=None, content_type=None):
        headers = {'Authorization': f'Bearer {self.token}'}
        if body is not None:
            data = json.dumps(body).encode()
            headers['Content-Type'] = 'application/json'
        elif content_type:
            headers['Content-Type'] = content_type
        request = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            raw = urllib.request.urlopen(request).read()
        except urllib.error.HTTPError as error:
            sys.exit(f'✗ {method} {url} → {error.code} {error.read().decode()[:600]}')
        return json.loads(raw) if raw else {}


def read_listing(language_dir):
    texts = {name: (language_dir / f'{name}.txt').read_text(encoding='utf-8').strip() for name in LIMITS}
    over = [f'{name} {len(text)}/{LIMITS[name]}' for name, text in texts.items() if len(text) > LIMITS[name]]
    if over:
        sys.exit(f'✗ {language_dir.name} dépasse : {", ".join(over)}')
    return {
        'title': texts['title'],
        'shortDescription': texts['short_description'],
        'fullDescription': texts['full_description'],
    }


def images_for(graphics, language):
    root = graphics / language
    phone = sorted((root / 'phone').glob('*.png')) if (root / 'phone').is_dir() else []
    if phone and not 2 <= len(phone) <= 8:
        sys.exit(f'✗ {language} : {len(phone)} captures, Google Play en veut 2 à 8')
    feature = root / 'feature-graphic.png'
    return {
        'featureGraphic': [feature] if feature.is_file() else [],
        'phoneScreenshots': phone,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--graphics', type=Path, default=DEFAULT_GRAPHICS)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    languages = sorted(p.name for p in LISTINGS.iterdir() if p.is_dir())
    listings = {language: read_listing(LISTINGS / language) for language in languages}
    if DEFAULT_LANGUAGE not in listings:
        sys.exit(f'✗ la langue par défaut {DEFAULT_LANGUAGE} n’a pas de fiche')
    icon = args.graphics / 'icon-512.png'
    if not icon.is_file():
        sys.exit(f'✗ icône absente : {icon}')
    images = {language: images_for(args.graphics, language) for language in languages}
    if len(images[DEFAULT_LANGUAGE]['phoneScreenshots']) < 2 or not images[DEFAULT_LANGUAGE]['featureGraphic']:
        sys.exit(f'✗ la langue par défaut doit avoir sa bannière et au moins 2 captures')

    for language in languages:
        counts = {kind: len(files) for kind, files in images[language].items()}
        print(f'  {language}: « {listings[language]["title"]} » · {counts}')
    if args.dry_run:
        return

    play = Play(access_token())
    edit = play.call('POST', f'{API}/edits', {})['id']
    play.call('PUT', f'{API}/edits/{edit}/details', DETAILS)
    for language in languages:
        play.call('PUT', f'{API}/edits/{edit}/listings/{language}', {'language': language, **listings[language]})
        uploads = {'icon': [icon], **images[language]} if language == DEFAULT_LANGUAGE else images[language]
        for kind, files in uploads.items():
            if not files:
                continue
            play.call('DELETE', f'{API}/edits/{edit}/listings/{language}/{kind}')
            for path in files:
                play.call('POST', f'{UPLOAD}/edits/{edit}/listings/{language}/{kind}?uploadType=media',
                          data=path.read_bytes(), content_type=mimetypes.guess_type(path.name)[0] or 'image/png')
        print(f'✓ {language}')
    play.call('POST', f'{API}/edits/{edit}:commit')
    print('✓ fiche publiée (édition validée)')


if __name__ == '__main__':
    main()
