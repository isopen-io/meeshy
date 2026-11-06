import Foundation
import Testing
@testable import MeeshySDK

/// **Le nom choisi se relit sur le nom de la copie temporaire** (#11166).
struct ImportedCopyNameTests {

    private let uuid = "058F7FEA-B7A2-4CF3-876F-763EDA90E946"

    @Test(arguments: ["file", "composer_file", "composer_sound", "comment", "paste", "drop"])
    func chosenName_ofATechnicalCopy_isTheChosenName(prefix: String) {
        #expect(ImportedCopyName.chosenName(in: "\(prefix)_\(uuid)_On fait comme ça.m4a") == "On fait comme ça.m4a")
    }

    @Test(arguments: ImportedCopyName.Door.allCases)
    func chosenName_readsBackWhatEveryDoorWrites(door: ImportedCopyName.Door) {
        #expect(ImportedCopyName.chosenName(in: ImportedCopyName.copyName(of: "Devis_final.pdf", through: door)) == "Devis_final.pdf")
    }

    @Test(arguments: ["0.m4a", "file_photo.jpg", "file_\("058F7FEA")_Devis.pdf", "composer_camera_058F7FEA-B7A2-4CF3-876F-763EDA90E946.mov", "Devis.pdf", ""])
    func chosenName_ofAnythingElse_isNil(name: String) {
        #expect(ImportedCopyName.chosenName(in: name) == nil)
    }

    @Test func chosenName_ofACopyOfALegacyName_peelsEveryTechnicalLayer() {
        let legacy = "file_\(uuid)_On fait comme ça.m4a"

        #expect(ImportedCopyName.chosenName(in: ImportedCopyName.copyName(of: legacy, through: .composerDocument)) == "On fait comme ça.m4a")
    }

    @Test func chosenName_withNothingAfterThePrefix_isNil() {
        #expect(ImportedCopyName.chosenName(in: "file_\(uuid)_") == nil)
    }
}
