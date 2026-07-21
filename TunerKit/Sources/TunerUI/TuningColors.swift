import SwiftUI
import TunerCore

/// Shared color palette and tuning-state tints.
///
/// Palette:
/// Light:
///   text        #050b0f
///   background  #eff6fb
///   primary     #003a5c
///   secondary   #7fc7f0
///   accent      #3cb2f6
///
/// Dark:
///   text        #f0f6fa
///   background  #0b1622
///   primary     #a3ddff
///   secondary   #0f5680
///   accent      #081d2a
///
/// The palette is intentionally cool and monochromatic and uses only
/// theme-provided tokens.
public enum TuningColors {
    // MARK: Palette

    public static let text       = Color(lightHex: 0x050B0F, darkHex: 0xF0F6FA)
    public static let background = Color(lightHex: 0xEFF6FB, darkHex: 0x0B1622)
    public static let primary    = Color(lightHex: 0x003A5C, darkHex: 0xA3DDFF)
    public static let secondary  = Color(lightHex: 0x7FC7F0, darkHex: 0x0F5680)
    public static let accent     = Color(lightHex: 0x3CB2F6, darkHex: 0x081D2A)

    // MARK: Semantic tokens

    /// Primary body copy — near-black in light, near-white in dark.
    public static let textBody  = text.opacity(0.92)
    /// Secondary copy — labels, values.
    public static let textMuted = text.opacity(0.58)
    /// Tertiary copy — captions, hints.
    public static let textFaint = text.opacity(0.38)

    /// Elevated fill used for cards and rows.
    /// Light: crisp near-white for a tidy panel against the pale blue background.
    /// Dark: a softly lifted panel above the deep navy background.
    public static let surface = Color(lightHex: 0xFFFFFF, darkHex: 0x15283F)

    /// Soft secondary-tinted wash — for subtle pills and inline highlights.
    public static let wash = secondary.opacity(0.18)

    /// Neutral muted tone for silent / idle states.
    public static let muted = text.opacity(0.35)

    /// Hairline stroke used on cards and dividers.
    public static let hairline = primary.opacity(0.12)

    // MARK: Tint for reading

    public static func color(forCents cents: Double) -> Color {
        let magnitude = Swift.abs(cents)
        if magnitude <= 5 { return accent }        // in tune — bright accent
        if magnitude <= 15 { return primary }      // close — deep primary
        return text.opacity(0.55)                  // off — neutral, not a competing blue
    }

    public static func tintColor(for reading: TunerReading) -> Color {
        reading.isSilent ? muted : color(forCents: reading.cents)
    }
}

// MARK: - Color hex helper

public extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >>  8) & 0xFF) / 255.0
        let b = Double( hex        & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }

    init(lightHex: UInt32, darkHex: UInt32) {
        #if canImport(UIKit)
        self.init(
            UIColor { traitCollection in
                traitCollection.userInterfaceStyle == .dark
                ? UIColor(hex: darkHex)
                : UIColor(hex: lightHex)
            }
        )
        #elseif canImport(AppKit)
        self.init(
            NSColor(name: nil) { appearance in
                let best = appearance.bestMatch(from: [.aqua, .darkAqua])
                return best == .darkAqua ? NSColor(hex: darkHex) : NSColor(hex: lightHex)
            }
        )
        #else
        self.init(hex: lightHex)
        #endif
    }
}

#if canImport(UIKit)
import UIKit

private extension UIColor {
    convenience init(hex: UInt32, opacity: Double = 1) {
        let r = CGFloat((hex >> 16) & 0xFF) / 255.0
        let g = CGFloat((hex >>  8) & 0xFF) / 255.0
        let b = CGFloat( hex        & 0xFF) / 255.0
        self.init(red: r, green: g, blue: b, alpha: opacity)
    }
}
#elseif canImport(AppKit)
import AppKit

private extension NSColor {
    convenience init(hex: UInt32, opacity: Double = 1) {
        let r = CGFloat((hex >> 16) & 0xFF) / 255.0
        let g = CGFloat((hex >>  8) & 0xFF) / 255.0
        let b = CGFloat( hex        & 0xFF) / 255.0
        self.init(srgbRed: r, green: g, blue: b, alpha: opacity)
    }
}
#endif

// MARK: - Theme background

/// Flat, minimalist theme background matching the tuner palette.
public struct TunerBackground: View {
    public init() {}
    public var body: some View {
        TuningColors.background
            .ignoresSafeArea()
    }
}
