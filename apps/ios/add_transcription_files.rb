#!/usr/bin/env ruby
# Script to add auto-transcription files to the Xcode project

require 'xcodeproj'

project_path = 'Meeshy.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Get the main target
target = project.targets.find { |t| t.name == 'Meeshy' }

unless target
  puts "Error: Target 'Meeshy' not found"
  exit 1
end

# Find groups by navigating the project structure
media_services_group = nil
translation_services_group = nil

project.main_group.recursive_children.each do |child|
  if child.is_a?(Xcodeproj::Project::Object::PBXGroup)
    if child.name == 'Services' || child.path == 'Services'
      parent = child.parent
      if parent && (parent.name == 'Media' || parent.path == 'Media')
        grandparent = parent.parent
        if grandparent && (grandparent.name == 'Features' || grandparent.path == 'Features')
          media_services_group = child
          puts "Found Media/Services group"
        end
      elsif parent && (parent.name == 'Translation' || parent.path == 'Translation')
        grandparent = parent.parent
        if grandparent && (grandparent.name == 'Features' || grandparent.path == 'Features')
          translation_services_group = child
          puts "Found Translation/Services group"
        end
      end
    end
  end
end

unless media_services_group
  puts "Error: Could not find Features/Media/Services group"
  exit 1
end

# Files to add
files_to_add = [
  { name: 'AutoTranscriptionService.swift', group: media_services_group }
]

# Add Translation/Services file if group exists
if translation_services_group
  files_to_add << { name: 'TargetLanguageResolver.swift', group: translation_services_group }
end

added_count = 0
skipped_count = 0

files_to_add.each do |file_info|
  file_name = file_info[:name]
  target_group = file_info[:group]

  puts "\nProcessing: #{file_name}"

  # Check if file already exists in the group
  existing_file = target_group.files.find { |f|
    f.name == file_name || (f.path && f.path.end_with?(file_name))
  }

  if existing_file
    puts "  Skipping (already exists): #{file_name}"
    skipped_count += 1
    next
  end

  # Add the file reference with just the filename (path relative to group)
  file_ref = target_group.new_file(file_name)

  # Add to target's source build phase
  target.source_build_phase.add_file_reference(file_ref)

  puts "  Added: #{file_name}"
  added_count += 1
end

# Save the project
project.save

puts "\n=== Summary ==="
puts "Added: #{added_count} files"
puts "Skipped: #{skipped_count} files (already in project)"
puts "Project saved successfully!"
