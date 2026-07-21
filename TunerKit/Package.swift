// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TunerKit",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
        .watchOS(.v10)
    ],
    products: [
        .library(name: "TunerCore", targets: ["TunerCore"]),
        .library(name: "TunerAudio", targets: ["TunerAudio"]),
        .library(name: "TunerUI", targets: ["TunerUI"])
    ],
    targets: [
        .target(
            name: "TunerCore",
            path: "Sources/TunerCore"
        ),
        .target(
            name: "TunerAudio",
            dependencies: ["TunerCore"],
            path: "Sources/TunerAudio"
        ),
        .target(
            name: "TunerUI",
            dependencies: ["TunerCore", "TunerAudio"],
            path: "Sources/TunerUI"
        ),
        .testTarget(
            name: "TunerCoreTests",
            dependencies: ["TunerCore"],
            path: "Tests/TunerCoreTests"
        ),
        .testTarget(
            name: "TunerAudioTests",
            dependencies: ["TunerCore", "TunerAudio"],
            path: "Tests/TunerAudioTests"
        )
    ]
)
