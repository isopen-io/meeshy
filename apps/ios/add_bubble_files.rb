#!/usr/bin/env ruby
# Script to add bubble-related files to the Xcode project

require 'xcodeproj'

project_path = 'Meeshy.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Get the main target
target = project.targets.find { |t| t.name == 'Meeshy' }

unless target
  puts "Error: Target 'Meeshy' not found"
  exit 1
end

# Files to add
files_to_add = [
  # Chat Views
  { path: 'Meeshy/Features/Chat/Views/MeeshyMessageBubble.swift', group_path: 'Meeshy/Features/Chat/Views' },

  # DesignSystem - Components
  { path: 'Meeshy/DesignSystem/Components/ModernBubbleShape.swift', group_path: 'Meeshy/DesignSystem/Components' },
  { path: 'Meeshy/DesignSystem/Components/BubbleAnimations.swift', group_path: 'Meeshy/DesignSystem/Components' },

  # DesignSystem - Theme
  { path: 'Meeshy/DesignSystem/Theme/MessageBubbleColors.swift', group_path: 'Meeshy/DesignSystem/Theme' },
]

def find_or_create_group(project, path_parts, parent = nil)
  parent ||= project.main_group

  if path_parts.empty?
    return parent
  end

  first_part = path_parts.first
  remaining = path_parts.drop(1)

  group = parent.children.find { |g| g.is_a?(Xcodeproj::Project::Object::PBXGroup) && g.name == first_part }

  if group.nil?
    group = parent.new_group(first_part, first_part)
    puts "Created group: #{first_part}"
  end

  find_or_create_group(project, remaining, group)
end

added_count = 0
skipped_count = 0

files_to_add.each do |file_info|
  file_path = file_info[:path]
  group_path = file_info[:group_path]

  unless File.exist?(file_path)
    puts "Warning: File not found: #{file_path}"
    next
  end

  # Find or create the group
  group_parts = group_path.split('/')
  group = find_or_create_group(project, group_parts)

  # Check if file already exists in the group
  file_name = File.basename(file_path)
  existing_file = group.files.find { |f| f.name == file_name || f.path&.end_with?(file_name) }

  if existing_file
    puts "Skipping (already exists): #{file_name}"
    skipped_count += 1
    next
  end

  # Add the file reference
  file_ref = group.new_file(file_path)

  # Add to target's source build phase
  target.source_build_phase.add_file_reference(file_ref)

  puts "Added: #{file_path}"
  added_count += 1
end

# Save the project
project.save

puts "\n=== Summary ==="
puts "Added: #{added_count} files"
puts "Skipped: #{skipped_count} files (already in project)"
puts "Project saved successfully!"
