#!/bin/bash

# Script to add GoogleService-Info.plist to Xcode project
# This script adds the file reference and includes it in the Copy Bundle Resources phase

PROJECT_FILE="/Users/smpceo/Documents/Services/Meeshy/ios/Meeshy.xcodeproj/project.pbxproj"
PLIST_PATH="Meeshy/GoogleService-Info.plist"

echo "Adding GoogleService-Info.plist to Xcode project..."

# Create backup
cp "$PROJECT_FILE" "$PROJECT_FILE.backup"

# Generate a unique reference ID (using timestamp)
FILE_REF_ID="FIREBASE$(date +%s)PLIST123ABC"
BUILD_FILE_ID="FIREBASE$(date +%s)BUILD456DEF"

# Add file reference to PBXFileReference section
perl -i -pe 'BEGIN{undef $/;} s/(\/\* Begin PBXFileReference section \*\/\n)/$1\t\t'"$FILE_REF_ID"' \/\* GoogleService-Info.plist \*\/ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = \"GoogleService-Info.plist\"; sourceTree = \"<group>\"; };\n/smg' "$PROJECT_FILE"

# Add build file to PBXBuildFile section
perl -i -pe 'BEGIN{undef $/;} s/(\/\* Begin PBXBuildFile section \*\/\n)/$1\t\t'"$BUILD_FILE_ID"' \/\* GoogleService-Info.plist in Resources \*\/ = {isa = PBXBuildFile; fileRef = '"$FILE_REF_ID"' \/\* GoogleService-Info.plist \*\/; };\n/smg' "$PROJECT_FILE"

# Add to PBXResourcesBuildPhase (Copy Bundle Resources)
perl -i -pe 'BEGIN{undef $/;} s/(PBXResourcesBuildPhase.*?files = \(\n)/$1\t\t\t\t'"$BUILD_FILE_ID"' \/\* GoogleService-Info.plist in Resources \*\/,\n/smg' "$PROJECT_FILE"

echo "✅ GoogleService-Info.plist added to project"
echo "📋 Backup created at: $PROJECT_FILE.backup"
