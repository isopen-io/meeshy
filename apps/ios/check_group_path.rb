require "xcodeproj"

project_path = "Meeshy.xcodeproj"
project = Xcodeproj::Project.open(project_path)

# Find the file reference for OnboardingCoordinatorView
project.files.each do |file|
  if file.path && file.path.include?("OnboardingCoordinatorView")
    puts "File: #{file.path}"
    puts "Real path: #{file.real_path}"
    
    # Walk up the parent chain
    parent = file.parent
    path_chain = [file.path]
    while parent && parent != project.main_group
      path_chain.unshift(parent.path || parent.display_name)
      parent = parent.parent
    end
    puts "Full path chain: #{path_chain.join(' / ')}"
  end
end
