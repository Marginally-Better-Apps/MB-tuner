import SwiftUI

/// User-selectable appearance preference.
///
/// Persisted with `@AppStorage` under `TunerUIStorageKeys.appTheme`
/// so iOS and macOS remember the choice across launches. The default
/// value is `.system`, meaning the app follows the OS appearance until
/// the user explicitly flips the Dark Mode toggle.
///
/// watchOS has no UI to change this — it simply follows the system
/// appearance (which on Apple Watch mirrors the paired iPhone).
public enum AppTheme: String, CaseIterable, Identifiable, Sendable {
    case system
    case light
    case dark

    public var id: String { rawValue }

    /// Color scheme to pin, or `nil` when the app should follow the
    /// system appearance.
    public var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light:  return .light
        case .dark:   return .dark
        }
    }
}

public enum TunerUIStorageKeys {
    public static let appTheme = "tuner.appTheme"
}

// MARK: - Root modifier

public extension View {
    /// Applies the user's persisted appearance preference at the scene
    /// root. When the stored preference is `.system`, no explicit color
    /// scheme is forced.
    ///
    /// Attach this once at the root of the scene on iOS/macOS. watchOS
    /// should not use this — the watch follows the system appearance.
    func preferredAppTheme() -> some View {
        modifier(PreferredAppThemeModifier())
    }
}

private struct PreferredAppThemeModifier: ViewModifier {
    @AppStorage(TunerUIStorageKeys.appTheme) private var themeRaw: String = AppTheme.system.rawValue

    func body(content: Content) -> some View {
        let theme = AppTheme(rawValue: themeRaw) ?? .system
        content.preferredColorScheme(theme.colorScheme)
    }
}

// MARK: - Dark mode toggle

/// Standard platform toggle labeled "Dark Mode".
///
/// Off ⇒ light, On ⇒ dark. Before the user has interacted with it the
/// stored preference is `.system`, and the toggle's visible state
/// reflects the current system appearance. Flipping it writes an
/// explicit `.light` or `.dark` override to `@AppStorage`.
public struct DarkModeToggle: View {
    @AppStorage(TunerUIStorageKeys.appTheme) private var themeRaw: String = AppTheme.system.rawValue
    @Environment(\.colorScheme) private var systemScheme

    public init() {}

    public var body: some View {
        let theme = AppTheme(rawValue: themeRaw) ?? .system
        let isOn = Binding<Bool>(
            get: {
                switch theme {
                case .dark:   return true
                case .light:  return false
                case .system: return systemScheme == .dark
                }
            },
            set: { newValue in
                themeRaw = newValue ? AppTheme.dark.rawValue : AppTheme.light.rawValue
            }
        )

        Toggle(isOn: isOn) {
            Text("Dark Mode")
                .font(.system(.body, design: .rounded).weight(.medium))
                .foregroundStyle(TuningColors.textBody)
        }
        .tint(TuningColors.primary)
    }
}
