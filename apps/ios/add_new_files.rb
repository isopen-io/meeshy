require 'xcodeproj'

project = Xcodeproj::Project.open('Meeshy.xcodeproj')
target = project.targets.find { |t| t.name == 'Meeshy' }

meeshy_group = project.groups.find { |g| g.display_name == 'Meeshy' }
puts 'Found Meeshy group'

# Get or create Core group
core = meeshy_group['Core']
unless core
  core = meeshy_group.new_group('Core', 'Meeshy/Core')
  puts 'Created Core group'
end

# Get or create Launch group under Core
launch = core['Launch']
unless launch
  launch = core.new_group('Launch', 'Meeshy/Core/Launch')
  puts 'Created Launch group'
end

# Get or create Persistence/FastCache groups
persistence = core['Persistence']
unless persistence
  persistence = core.new_group('Persistence', 'Meeshy/Core/Persistence')
  puts 'Created Persistence group'
end

fast_cache = persistence['FastCache']
unless fast_cache
  fast_cache = persistence.new_group('FastCache', 'Meeshy/Core/Persistence/FastCache')
  puts 'Created FastCache group'
end

# Add AppLaunchCoordinator.swift
alc_path = 'Meeshy/Core/Launch/AppLaunchCoordinator.swift'
alc_full = File.expand_path(alc_path)
if File.exist?(alc_full)
  existing = launch.files.find { |f| f.display_name == 'AppLaunchCoordinator.swift' }
  unless existing
    ref = launch.new_file(alc_full)
    target.source_build_phase.add_file_reference(ref)
    puts 'Added AppLaunchCoordinator.swift to project'
  else
    puts 'AppLaunchCoordinator.swift already in project'
  end
else
  puts "File not found: #{alc_full}"
end

# Add FirstLaunchManager.swift
flm_path = 'Meeshy/Core/Launch/FirstLaunchManager.swift'
flm_full = File.expand_path(flm_path)
if File.exist?(flm_full)
  existing = launch.files.find { |f| f.display_name == 'FirstLaunchManager.swift' }
  unless existing
    ref = launch.new_file(flm_full)
    target.source_build_phase.add_file_reference(ref)
    puts 'Added FirstLaunchManager.swift to project'
  else
    puts 'FirstLaunchManager.swift already in project'
  end
else
  puts "File not found: #{flm_full}"
end

# Add CommunityCache.swift
cc_path = 'Meeshy/Core/Persistence/FastCache/CommunityCache.swift'
cc_full = File.expand_path(cc_path)
if File.exist?(cc_full)
  existing = fast_cache.files.find { |f| f.display_name == 'CommunityCache.swift' }
  unless existing
    ref = fast_cache.new_file(cc_full)
    target.source_build_phase.add_file_reference(ref)
    puts 'Added CommunityCache.swift to project'
  else
    puts 'CommunityCache.swift already in project'
  end
else
  puts "File not found: #{cc_full}"
end

project.save
puts ''
puts 'Project saved successfully!'
