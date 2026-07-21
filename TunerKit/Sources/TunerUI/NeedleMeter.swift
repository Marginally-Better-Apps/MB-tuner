import SwiftUI
import TunerCore

/// Minimalist centered-needle tuning meter.
///
/// Rendered entirely from SwiftUI `Canvas` primitives using only the
/// app's cool-blue `TuningColors` palette — no bezels, gradients, or
/// drop shadows. The premium feel comes from precise typography, clean
/// proportions, a subtle continuous deviation arc, and smooth spring
/// motion; not from visual ornament.
///
/// Anatomy (outside → inside):
///   - Hairline full-span arc
///   - Tick marks (minor every 5 ¢, major every 25 ¢)
///   - Numeric cent labels at majors on large sizes
///   - Muted `CENTS` unit mark
///   - Deviation arc: thin accent segment from 0 ¢ to the current cents
///   - Sweet-zone band (±`greenZone`) that brightens when in tune
///   - Tapered needle in `tintColor(for:)`
///   - Small hub: ring when silent, filled when active
///   - Prev / current / next note names inside the dial
public struct NeedleMeter: View {
    public let reading: TunerReading
    public var range: Double
    public var greenZone: Double

    public init(reading: TunerReading, range: Double = 50, greenZone: Double = 5) {
        self.reading = reading
        self.range = range
        self.greenZone = greenZone
    }

    public var body: some View {
        GeometryReader { proxy in
            let L = Layout(size: proxy.size, range: range)
            ZStack {
                dial(L)
                noteLabels(L)
            }
            .frame(width: L.w, height: L.h)
        }
        .animation(.spring(response: 0.22, dampingFraction: 0.78), value: reading.cents)
        .animation(.easeInOut(duration: 0.2), value: reading.isSilent)
        .animation(.easeInOut(duration: 0.18), value: reading.isInTune)
    }

    // MARK: - Layout

    /// Geometry shared by every sub-layer so the needle, ticks, arcs,
    /// and labels line up exactly regardless of host frame.
    private struct Layout {
        let w: CGFloat
        let h: CGFloat
        let cx: CGFloat
        let cy: CGFloat
        let radius: CGFloat
        let range: Double

        var isLarge: Bool   { radius >= 100 }
        var isCompact: Bool { radius < 78 }

        init(size: CGSize, range: Double) {
            w = size.width
            h = size.height
            cx = w / 2
            self.range = range
            let pad: CGFloat = max(2, min(size.width, size.height) * 0.02)
            cy = h - pad
            radius = min(w / 2 - pad, cy - pad)
        }

        /// 0 ¢ sits at the top of the dial (270°), +range at the right.
        func angle(cents: Double) -> Double { 270 + 90 * (cents / range) }

        func point(_ r: CGFloat, _ aDeg: Double) -> CGPoint {
            let rad = aDeg * .pi / 180
            return CGPoint(x: cx + r * CoreGraphics.cos(rad),
                           y: cy + r * CoreGraphics.sin(rad))
        }
    }

    // MARK: - Dial

    private func dial(_ L: Layout) -> some View {
        Canvas { ctx, _ in
            drawBaseArc(ctx, L)
            drawDeviationArc(ctx, L)
            drawSweetZone(ctx, L)
            drawTicks(ctx, L)
            if L.isLarge {
                drawNumericLabels(ctx, L)
                drawUnitMark(ctx, L)
            }
            drawNeedle(ctx, L)
            drawHub(ctx, L)
        }
    }

    private func drawBaseArc(_ ctx: GraphicsContext, _ L: Layout) {
        let r = L.radius * 0.84
        var path = Path()
        path.addArc(center: CGPoint(x: L.cx, y: L.cy),
                    radius: r,
                    startAngle: .degrees(180),
                    endAngle: .degrees(360),
                    clockwise: false)
        ctx.stroke(
            path,
            with: .color(TuningColors.primary.opacity(0.16)),
            style: StrokeStyle(lineWidth: 1, lineCap: .round)
        )
    }

    /// Thin arc from 0 ¢ to the current reading. Makes "how far off" a
    /// glance-readable magnitude, in addition to the needle's position.
    /// Drawn beneath the sweet zone so the center highlight always
    /// reads clearly.
    private func drawDeviationArc(_ ctx: GraphicsContext, _ L: Layout) {
        guard !reading.isSilent else { return }
        let clamped = max(-range, min(range, reading.cents))
        guard Swift.abs(clamped) > 0.25 else { return }

        let r = L.radius * 0.84
        let centerAngle: Double = 270
        let endAngle = L.angle(cents: clamped)
        let start = Swift.min(centerAngle, endAngle)
        let finish = Swift.max(centerAngle, endAngle)

        var path = Path()
        path.addArc(center: CGPoint(x: L.cx, y: L.cy),
                    radius: r,
                    startAngle: .degrees(start),
                    endAngle: .degrees(finish),
                    clockwise: false)

        let tint = TuningColors.tintColor(for: reading)
        ctx.stroke(
            path,
            with: .color(tint.opacity(0.35)),
            style: StrokeStyle(
                lineWidth: L.isCompact ? 2 : 3,
                lineCap: .round
            )
        )
    }

    /// ±greenZone highlight at the top of the dial. Low opacity by
    /// default, bright when the reading is in tune.
    private func drawSweetZone(_ ctx: GraphicsContext, _ L: Layout) {
        let r = L.radius * 0.84
        let halfAngle = 90 * (greenZone / range)
        var path = Path()
        path.addArc(center: CGPoint(x: L.cx, y: L.cy),
                    radius: r,
                    startAngle: .degrees(270 - halfAngle),
                    endAngle: .degrees(270 + halfAngle),
                    clockwise: false)
        let opacity = reading.isInTune ? 0.9 : 0.28
        ctx.stroke(
            path,
            with: .color(TuningColors.accent.opacity(opacity)),
            style: StrokeStyle(
                lineWidth: L.isCompact ? 2 : 3,
                lineCap: .round
            )
        )
    }

    private func drawTicks(_ ctx: GraphicsContext, _ L: Layout) {
        let outer = L.radius * 0.92
        let majorLen: CGFloat = L.isCompact ? 6 : 11
        let minorLen: CGFloat = L.isCompact ? 3 : 5

        for cents in stride(from: -range, through: range, by: 5) {
            let aDeg = L.angle(cents: cents)
            let isMajor = Int(cents.rounded()) % 25 == 0
            let len = isMajor ? majorLen : minorLen
            var tick = Path()
            tick.move(to: L.point(outer, aDeg))
            tick.addLine(to: L.point(outer - len, aDeg))
            ctx.stroke(
                tick,
                with: .color(TuningColors.primary.opacity(isMajor ? 0.6 : 0.25)),
                style: StrokeStyle(
                    lineWidth: isMajor ? 1 : 0.75,
                    lineCap: .round
                )
            )
        }
    }

    private func drawNumericLabels(_ ctx: GraphicsContext, _ L: Layout) {
        let r = L.radius * 0.92 - 11 - 11
        let values: [Int] = [-50, -25, 0, 25, 50]
        for c in values {
            let aDeg = L.angle(cents: Double(c))
            let pt = L.point(r, aDeg)
            let sign = c > 0 ? "+" : (c < 0 ? "\u{2212}" : "")
            let text = Text("\(sign)\(abs(c))")
                .font(.system(size: 10, weight: .medium, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(TuningColors.textMuted)
            ctx.draw(text, at: pt)
        }
    }

    /// Tiny unit mark, like the "VU" print on an analog meter face.
    private func drawUnitMark(_ ctx: GraphicsContext, _ L: Layout) {
        let pt = CGPoint(x: L.cx, y: L.cy - L.radius * 0.24)
        let text = Text("CENTS")
            .font(.system(size: 8, weight: .semibold, design: .rounded))
            .kerning(2.5)
            .foregroundStyle(TuningColors.textFaint)
        ctx.draw(text, at: pt)
    }

    private func drawNeedle(_ ctx: GraphicsContext, _ L: Layout) {
        let clamped = max(-range, min(range, reading.cents))
        let aDeg = L.angle(cents: clamped)
        let len = L.radius * 0.76
        let baseWidth: CGFloat = L.isCompact ? 2 : 3
        let tipWidth: CGFloat = 0.75

        ctx.drawLayer { layer in
            layer.translateBy(x: L.cx, y: L.cy)
            layer.rotate(by: .degrees(aDeg - 270))

            var p = Path()
            p.move(to: CGPoint(x: -baseWidth / 2, y: 0))
            p.addLine(to: CGPoint(x: -tipWidth / 2, y: -len))
            p.addLine(to: CGPoint(x:  tipWidth / 2, y: -len))
            p.addLine(to: CGPoint(x:  baseWidth / 2, y: 0))
            p.closeSubpath()

            let color = reading.isSilent
                ? TuningColors.muted
                : TuningColors.tintColor(for: reading)
            layer.fill(p, with: .color(color))
        }
    }

    private func drawHub(_ ctx: GraphicsContext, _ L: Layout) {
        let size: CGFloat = L.isCompact ? 8 : 12
        let rect = CGRect(
            x: L.cx - size / 2,
            y: L.cy - size / 2,
            width: size,
            height: size
        )
        if reading.isSilent {
            ctx.stroke(
                Path(ellipseIn: rect),
                with: .color(TuningColors.muted),
                lineWidth: 1
            )
        } else {
            ctx.fill(
                Path(ellipseIn: rect),
                with: .color(TuningColors.tintColor(for: reading))
            )
        }
    }

    // MARK: - Note labels

    private var centerNote: Note { reading.note }
    private var leftNote: Note   { Note(midi: centerNote.midi - 1, a4: centerNote.a4) }
    private var rightNote: Note  { Note(midi: centerNote.midi + 1, a4: centerNote.a4) }

    private func noteLabels(_ L: Layout) -> some View {
        let r = L.radius * 0.55
        return ZStack {
            meterNoteLabel(leftNote.name)
                .position(L.point(r, 212))
            meterNoteLabel(centerNote.name, emphasized: true)
                .position(L.point(r * 1.02, 270))
            meterNoteLabel(rightNote.name)
                .position(L.point(r, 328))
        }
    }

    @ViewBuilder
    private func meterNoteLabel(_ name: String, emphasized: Bool = false) -> some View {
        Text(name)
            .font(.system(emphasized ? .footnote : .caption2,
                          design: .rounded)
                .weight(emphasized ? .semibold : .medium))
            .monospacedDigit()
            .foregroundStyle(TuningColors.primary.opacity(emphasized ? 0.75 : 0.42))
            .opacity(reading.isSilent ? 0.45 : 1.0)
    }
}
