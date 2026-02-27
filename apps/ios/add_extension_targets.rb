#!/usr/bin/env ruby
require 'xcodeproj'

PROJECT_PATH = File.join(__dir__, 'Meeshy.xcodeproj')
project = Xcodeproj::Project.open(PROJECT_PATH)
main_target = project.targets.find { |t| t.name == 'Meeshy' }

TEAM_ID = 'J2LP6UE7JQ'
DEPLOYMENT_TARGET = '17.0'
SWIFT_VERSION = '5.0'

def common_build_settings(target_name, bundle_id, entitlements_path)
  {
    'ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME' => 'AccentColor',
    'CLANG_ANALYZER_NONNULL' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'gnu++20',
    'CLANG_ENABLE_MODULES' => 'YES',
    'CODE_SIGN_ENTITLEMENTS' => entitlements_path,
    'CODE_SIGN_IDENTITY' => 'Apple Development',
    'CODE_SIGN_STYLE' => 'Automatic',
    'CURRENT_PROJECT_VERSION' => '1',
    'DEVELOPMENT_TEAM' => TEAM_ID,
    'GENERATE_INFOPLIST_FILE' => 'NO',
    'INFOPLIST_FILE' => "#{target_name}/Info.plist",
    'IPHONEOS_DEPLOYMENT_TARGET' => DEPLOYMENT_TARGET,
    'MARKETING_VERSION' => '1.0',
    'PRODUCT_BUNDLE_IDENTIFIER' => bundle_id,
    'PRODUCT_NAME' => '$(TARGET_NAME)',
    'SKIP_INSTALL' => 'YES',
    'SWIFT_EMIT_LOC_STRINGS' => 'YES',
    'SWIFT_VERSION' => SWIFT_VERSION,
    'TARGETED_DEVICE_FAMILY' => '1,2',
  }
end

def add_extension_target(project, main_target, name, bundle_id, product_type, entitlements_path, source_files, frameworks)
  puts "Adding target: #{name}"

  target = project.new_target(product_type, name, :ios, DEPLOYMENT_TARGET)

  # Build settings
  settings = common_build_settings(name, bundle_id, entitlements_path)
  target.build_configurations.each do |config|
    settings.each { |k, v| config.build_settings[k] = v }
    if config.name == 'Debug'
      config.build_settings['DEBUG_INFORMATION_FORMAT'] = 'dwarf'
      config.build_settings['SWIFT_OPTIMIZATION_LEVEL'] = '-Onone'
    else
      config.build_settings['DEBUG_INFORMATION_FORMAT'] = 'dwarf-with-dsym'
      config.build_settings['SWIFT_OPTIMIZATION_LEVEL'] = '-O'
    end
  end

  # Find or create group
  group = project.main_group.find_subpath(name, false) || project.main_group.new_group(name, name)

  # Add source files
  source_files.each do |file_path|
    file_name = File.basename(file_path)
    existing = group.files.find { |f| f.display_name == file_name }
    unless existing
      ref = group.new_file(file_path)
      target.source_build_phase.add_file_reference(ref)
      puts "  Added source: #{file_name}"
    end
  end

  # Add Info.plist reference if not already there
  info_plist = "#{name}/Info.plist"
  unless group.files.find { |f| f.display_name == 'Info.plist' }
    group.new_file(info_plist)
    puts "  Added Info.plist"
  end

  # Add entitlements reference
  entitlements_file = File.basename(entitlements_path)
  unless group.files.find { |f| f.display_name == entitlements_file }
    group.new_file(entitlements_path)
    puts "  Added entitlements: #{entitlements_file}"
  end

  # Add framework dependencies
  frameworks.each do |fw|
    target.frameworks_build_phase
    puts "  Framework: #{fw}"
  end

  # Add dependency and embed extension in main app
  main_target.add_dependency(target)
  puts "  Added dependency to main target"

  # Embed extension
  embed_phase = main_target.build_phases.find { |p| p.is_a?(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase) && p.name == 'Embed App Extensions' }
  unless embed_phase
    embed_phase = project.new(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase)
    embed_phase.name = 'Embed App Extensions'
    embed_phase.symbol_dst_subfolder_spec = :plug_ins
    main_target.build_phases << embed_phase
    puts "  Created 'Embed App Extensions' build phase"
  end

  product_ref = target.product_reference
  build_file = embed_phase.add_file_reference(product_ref, true)
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
  puts "  Embedded extension in main app"

  target
end

# ============================================================
# 1. Widget Extension
# ============================================================
widget_target = add_extension_target(
  project, main_target,
  'MeeshyWidgets',
  'com.meeshy.app.widgets',
  :app_extension,
  'MeeshyWidgets/MeeshyWidgets.entitlements',
  [
    'MeeshyWidgets/MeeshyWidgets.swift',
    'MeeshyWidgets/LiveActivities.swift',
  ],
  ['WidgetKit', 'SwiftUI']
)

# Widget-specific build settings
widget_target.build_configurations.each do |config|
  config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/../../Frameworks']
end

puts "\nWidget extension target added successfully!"

# ============================================================
# 2. Notification Service Extension
# ============================================================
notif_target = add_extension_target(
  project, main_target,
  'MeeshyNotificationExtension',
  'com.meeshy.app.notification-service',
  :app_extension,
  'MeeshyNotificationExtension/MeeshyNotificationExtension.entitlements',
  [
    'MeeshyNotificationExtension/NotificationService.swift',
  ],
  ['UserNotifications']
)

# Notification-specific build settings
notif_target.build_configurations.each do |config|
  config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/../../Frameworks']
end

puts "Notification service extension target added successfully!"

# ============================================================
# Save
# ============================================================
project.save
puts "\nProject saved successfully!"

# Verify
puts "\nTargets in project:"
project.targets.each do |t|
  puts "  - #{t.name} (#{t.product_type})"
end
