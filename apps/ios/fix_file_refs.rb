require "xcodeproj"

project_path = "Meeshy.xcodeproj"
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == "Meeshy" }
build_phase = target.source_build_phase

# Remove bad file reference
project.files.each do |file|
  real_path = file.real_path.to_s rescue nil
  if real_path == "/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/OnboardingCoordinatorView.swift"
    puts "Removing bad file ref"
    file.remove_from_project
  end
end

# Find the correct OnboardingCoordinatorView file
correct_ref = project.files.find { |f| 
  rp = f.real_path.to_s rescue nil
  rp && rp.include?("Onboarding/Views/OnboardingCoordinatorView.swift")
}

if correct_ref
  # Check if already in build phase
  already_in = build_phase.files.any? { |bf| bf.file_ref == correct_ref }
  unless already_in
    build_phase.add_file_reference(correct_ref)
    puts "Added correct OnboardingCoordinatorView to build phase"
  else
    puts "OnboardingCoordinatorView already in build phase"
  end
else
  puts "Could not find correct OnboardingCoordinatorView file ref"
  
  # List all refs containing "OnboardingCoordinator"
  project.files.each do |f|
    if f.path && f.path.include?("OnboardingCoordinator")
      rp = f.real_path.to_s rescue nil
      puts "  Found: #{f.path} -> #{rp}"
    end
  end
end

project.save
puts "Done!"
