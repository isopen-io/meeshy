require "xcodeproj"

project_path = "Meeshy.xcodeproj"
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == "Meeshy" }
build_phase = target.source_build_phase

# Find and remove stale file references pointing to wrong paths
stale_refs = []
build_phase.files.each do |bf|
  if bf.file_ref 
    real_path = bf.file_ref.real_path.to_s rescue nil
    if real_path && real_path.include?("OnboardingCoordinatorView") && !real_path.include?("Onboarding/Views")
      stale_refs << bf
      puts "Found stale reference: #{real_path}"
    end
  end
end

stale_refs.each do |bf|
  puts "Removing stale build file"
  bf.remove_from_project
end

# Also check file references
project.files.each do |file|
  if file.path && file.path.include?("OnboardingCoordinatorView")
    real_path = file.real_path.to_s rescue nil
    puts "File ref: #{file.path} -> #{real_path}"
  end
end

project.save
puts "Done!"
