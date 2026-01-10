#!/usr/bin/env ruby
# Script to add bubble-related files to the Xcode project
# v2 - Uses proper relative paths

require 'xcodeproj'

project_path = 'Meeshy.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Get the main target
target = project.targets.find { |t| t.name == 'Meeshy' }

unless target
  puts "Error: Target 'Meeshy' not found"
  exit 1
end

# Navigate to the Meeshy main group
meeshy_group = project.main_group.children.find { |g| g.name == 'Meeshy' || g.path == 'Meeshy' }

unless meeshy_group
  puts "Error: Meeshy group not found in project"
  exit 1
end

puts "Found Meeshy group"

# Helper to find or create a group chain
def find_or_create_group_chain(parent_group, path_parts)
  return parent_group if path_parts.empty?

  part = path_parts.first
  remaining = path_parts.drop(1)

  existing = parent_group.children.find { |g|
    g.is_a?(Xcodeproj::Project::Object::PBXGroup) && (g.name == part || g.path == part)
  }

  if existing
    puts "  Using existing group: #{part}"
    find_or_create_group_chain(existing, remaining)
  else
    new_group = parent_group.new_group(part, part)
    puts "  Created group: #{part}"
    find_or_create_group_chain(new_group, remaining)
  end
end

# Files to add with their relative paths from the Meeshy group
files_to_add = [
  {
    file: 'Features/Chat/Views/MeeshyMessageBubble.swift',
    group_path: ['Features', 'Chat', 'Views']
  },
  {
    file: 'DesignSystem/Components/ModernBubbleShape.swift',
    group_path: ['DesignSystem', 'Components']
  },
  {
    file: 'DesignSystem/Components/BubbleAnimations.swift',
    group_path: ['DesignSystem', 'Components']
  },
  {
    file: 'DesignSystem/Theme/MessageBubbleColors.swift',
    group_path: ['DesignSystem', 'Theme']
  }
]

added_count = 0
skipped_count = 0

files_to_add.each do |file_info|
  relative_path = file_info[:file]
  full_path = "Meeshy/#{relative_path}"
  group_path = file_info[:group_path]

  puts "\nProcessing: #{relative_path}"

  unless File.exist?(full_path)
    puts "  Warning: File not found: #{full_path}"
    next
  end

  # Find or create the group chain
  target_group = find_or_create_group_chain(meeshy_group, group_path)

  # Check if file already exists in the group
  file_name = File.basename(relative_path)
  existing_file = target_group.files.find { |f|
    (f.name == file_name) || (f.path && f.path.end_with?(file_name))
  }

  if existing_file
    puts "  Skipping (already exists): #{file_name}"
    skipped_count += 1
    next
  end

  # Add the file reference using relative path from the group
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
