#!/usr/bin/env ruby
# Script to add bubble-related files to the Xcode project
# v3 - Uses proper path resolution by finding existing groups

require 'xcodeproj'

project_path = 'Meeshy.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Get the main target
target = project.targets.find { |t| t.name == 'Meeshy' }

unless target
  puts "Error: Target 'Meeshy' not found"
  exit 1
end

# Find a group by path recursively
def find_group_by_path(group, path)
  return group if group.path == path || group.name == path

  group.groups.each do |subgroup|
    result = find_group_by_path(subgroup, path)
    return result if result
  end

  nil
end

# Navigate to find Theme and Components groups
theme_group = nil
components_group = nil
views_group = nil

# Search through all groups
def search_groups(group, name, level = 0)
  return group if group.name == name || group.path == name

  group.groups.each do |subgroup|
    result = search_groups(subgroup, name, level + 1)
    return result if result
  end

  nil
end

# Find the Theme group under DesignSystem
project.main_group.recursive_children.each do |child|
  if child.is_a?(Xcodeproj::Project::Object::PBXGroup)
    if child.name == 'Theme' || child.path == 'Theme'
      # Check if parent is DesignSystem
      parent = child.parent
      if parent && (parent.name == 'DesignSystem' || parent.path == 'DesignSystem')
        theme_group = child
        puts "Found Theme group"
      end
    elsif child.name == 'Components' || child.path == 'Components'
      parent = child.parent
      if parent && (parent.name == 'DesignSystem' || parent.path == 'DesignSystem')
        components_group = child
        puts "Found Components group (under DesignSystem)"
      end
    elsif child.name == 'Views' || child.path == 'Views'
      parent = child.parent
      if parent && (parent.name == 'Chat' || parent.path == 'Chat')
        grandparent = parent.parent
        if grandparent && (grandparent.name == 'Features' || grandparent.path == 'Features')
          views_group = child
          puts "Found Views group (under Features/Chat)"
        end
      end
    end
  end
end

unless theme_group && components_group && views_group
  puts "Error: Could not find all required groups"
  puts "Theme: #{theme_group ? 'found' : 'not found'}"
  puts "Components: #{components_group ? 'found' : 'not found'}"
  puts "Views: #{views_group ? 'found' : 'not found'}"
  exit 1
end

# Files to add
files_to_add = [
  { name: 'MeeshyMessageBubble.swift', group: views_group },
  { name: 'ModernBubbleShape.swift', group: components_group },
  { name: 'BubbleAnimations.swift', group: components_group },
  { name: 'MessageBubbleColors.swift', group: theme_group }
]

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
