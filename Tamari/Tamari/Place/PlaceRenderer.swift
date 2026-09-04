import SwiftUI

/// 場の描画。SwiftUI Canvas 一本に固定する（Sprite / Metal / 3D に散らさない）。
/// ループ動画を作らない。`snapshot.cut` が変わるたびに別の一枚を描く。
struct PlaceRenderer: View {

    let snapshot: PlaceSnapshot

    var body: some View {
        Canvas(opaque: true, colorMode: .linear, rendersAsynchronously: false) { context, size in
            let palette = Tokens.palette(daylight: snapshot.daylight)
            draw(in: &context, size: size, palette: palette)
        }
        .background(Tokens.palette(daylight: snapshot.daylight).skyHigh.color())
    }

    private func draw(in context: inout GraphicsContext, size: CGSize, palette: PlacePalette) {
        let horizon = size.height * Tokens.Layout.horizon
        var rng = SeededRandom(UInt64(bitPattern: Int64(snapshot.cut)) &* 0xD6E8_FEB8_6659_FD93 &+ 0x77)

        drawSky(in: &context, size: size, horizon: horizon, palette: palette)
        drawCrossingLight(in: &context, size: size, horizon: horizon, palette: palette)
        drawShutter(in: &context, size: size, horizon: horizon, palette: palette)
        StructurePainter.draw(snapshot.structure, in: &context, size: size, palette: palette, cut: snapshot.cut)
        drawLamps(in: &context, size: size, horizon: horizon, palette: palette)
        drawFloor(in: &context, size: size, horizon: horizon, palette: palette)
        drawLampReflections(in: &context, size: size, horizon: horizon, palette: palette)
        drawPaper(in: &context, size: size, horizon: horizon, palette: palette)

        for body in snapshot.bodies {
            TimeBodyPainter.draw(
                body,
                in: &context,
                size: size,
                palette: palette,
                contrast: snapshot.contrast,
                cut: snapshot.cut
            )
        }

        drawGrain(in: &context, size: size, palette: palette, rng: &rng)
        drawVignette(in: &context, size: size)
    }

    // MARK: - 空と遠く

    private func drawSky(in context: inout GraphicsContext, size: CGSize, horizon: CGFloat, palette: PlacePalette) {
        let sky = Path(CGRect(x: 0, y: 0, width: size.width, height: horizon + 1))
        context.fill(
            sky,
            with: .linearGradient(
                Gradient(colors: [palette.skyHigh.color(), palette.skyLow.color()]),
                startPoint: .zero,
                endPoint: CGPoint(x: 0, y: horizon)
            )
        )

        // 遠くの靄。眺めている気配のぶんだけ、わずかに明るい。
        let haze = Path(CGRect(x: 0, y: horizon - size.height * 0.14, width: size.width, height: size.height * 0.14))
        context.fill(
            haze,
            with: .linearGradient(
                Gradient(colors: [
                    palette.skyLow.color(0),
                    palette.lampGlow.color(0.06 + 0.10 * snapshot.brightness)
                ]),
                startPoint: CGPoint(x: 0, y: horizon - size.height * 0.14),
                endPoint: CGPoint(x: 0, y: horizon)
            )
        )
    }

    /// 遠くを横切る光。出ない一枚のほうが多い。動かさない。
    private func drawCrossingLight(in context: inout GraphicsContext, size: CGSize, horizon: CGFloat, palette: PlacePalette) {
        guard let position = snapshot.crossingLight else { return }
        let y = horizon - size.height * CGFloat(0.02 + position * 0.16)
        var streak = Path()
        let x0 = size.width * CGFloat(0.08 + position * 0.3)
        streak.move(to: CGPoint(x: x0, y: y))
        streak.addLine(to: CGPoint(x: x0 + size.width * 0.34, y: y - size.height * 0.004))

        context.drawLayer { layer in
            layer.addFilter(.blur(radius: 3.4))
            layer.stroke(
                streak,
                with: .color(palette.lamp.color(0.16 * (1 - snapshot.daylight * 0.7))),
                lineWidth: 1.4
            )
        }
    }

    /// 閉まった何か。開くことはない。
    private func drawShutter(in context: inout GraphicsContext, size: CGSize, horizon: CGFloat, palette: PlacePalette) {
        let rect = CGRect(
            x: -size.width * 0.04,
            y: horizon - size.height * 0.17,
            width: size.width * 0.36,
            height: size.height * 0.23
        )
        context.fill(Path(rect), with: .color(palette.shutter.color(0.95)))

        var slats = Path()
        var y = rect.minY + 4
        while y < rect.maxY {
            slats.move(to: CGPoint(x: rect.minX, y: y))
            slats.addLine(to: CGPoint(x: rect.maxX, y: y))
            y += 5
        }
        context.stroke(slats, with: .color(palette.ink.color(0.035)), lineWidth: 0.7)
    }

    private func lampPositions(size: CGSize, horizon: CGFloat) -> [CGPoint] {
        [
            CGPoint(x: size.width * 0.42, y: horizon - size.height * 0.115),
            CGPoint(x: size.width * 0.87, y: horizon - size.height * 0.085),
            CGPoint(x: size.width * 0.20, y: horizon - size.height * 0.055)
        ]
    }

    /// 遠い街灯。ナトリウム。昼は弱い。
    private func drawLamps(in context: inout GraphicsContext, size: CGSize, horizon: CGFloat, palette: PlacePalette) {
        let strength = (1 - snapshot.daylight * 0.82)
        for (index, lamp) in lampPositions(size: size, horizon: horizon).enumerated() {
            let radius = size.width * (index == 0 ? 0.16 : 0.11)
            let glow = Path(ellipseIn: CGRect(
                x: lamp.x - radius, y: lamp.y - radius,
                width: radius * 2, height: radius * 2
            ))
            context.fill(
                glow,
                with: .radialGradient(
                    Gradient(colors: [
                        palette.lamp.color(0.30 * strength),
                        palette.lampGlow.color(0.10 * strength),
                        palette.lampGlow.color(0)
                    ]),
                    center: lamp,
                    startRadius: 0,
                    endRadius: radius
                )
            )
            let core = Path(ellipseIn: CGRect(x: lamp.x - 1.6, y: lamp.y - 1.6, width: 3.2, height: 3.2))
            context.fill(core, with: .color(palette.lamp.color(0.55 * strength + 0.10)))
        }
    }

    // MARK: - 濡れた床

    private func drawFloor(in context: inout GraphicsContext, size: CGSize, horizon: CGFloat, palette: PlacePalette) {
        let floor = Path(CGRect(x: 0, y: horizon, width: size.width, height: size.height - horizon))
        context.fill(
            floor,
            with: .linearGradient(
                Gradient(colors: [palette.floorFar.color(), palette.floor.color()]),
                startPoint: CGPoint(x: 0, y: horizon),
                endPoint: CGPoint(x: 0, y: size.height)
            )
        )

        // 水膜。帯を数本だけ。
        for i in 0..<4 {
            let t = Double(i) / 4
            let y = horizon + (size.height - horizon) * CGFloat(0.12 + t * 0.7)
            let band = Path(CGRect(x: 0, y: y, width: size.width, height: size.height * 0.012))
            context.fill(band, with: .color(palette.sheen.color(0.05 - 0.008 * Double(i))))
        }
    }

    private func drawLampReflections(in context: inout GraphicsContext, size: CGSize, horizon: CGFloat, palette: PlacePalette) {
        let strength = (1 - snapshot.daylight * 0.85)
        for lamp in lampPositions(size: size, horizon: horizon) {
            let width = size.width * 0.02
            let height = (size.height - horizon) * 0.62
            let rect = CGRect(x: lamp.x - width / 2, y: horizon, width: width, height: height)
            context.drawLayer { layer in
                layer.addFilter(.blur(radius: size.width * 0.014))
                layer.fill(
                    Path(rect),
                    with: .linearGradient(
                        Gradient(colors: [
                            palette.lamp.color(0.22 * strength),
                            palette.lamp.color(0)
                        ]),
                        startPoint: CGPoint(x: 0, y: rect.minY),
                        endPoint: CGPoint(x: 0, y: rect.maxY)
                    )
                )
            }
        }
    }

    /// 風で止まった紙。一枚ごとにわずかに位置が違うだけ。飛ばさない。
    private func drawPaper(in context: inout GraphicsContext, size: CGSize, horizon: CGFloat, palette: PlacePalette) {
        let cx = size.width * (0.30 + CGFloat(snapshot.paperOffset.x))
        let cy = horizon + (size.height - horizon) * (0.52 + CGFloat(snapshot.paperOffset.y))
        let w = size.width * 0.045
        let h = size.height * 0.012

        var paper = Path()
        paper.move(to: CGPoint(x: cx - w / 2, y: cy))
        paper.addLine(to: CGPoint(x: cx + w * 0.35, y: cy - h))
        paper.addLine(to: CGPoint(x: cx + w / 2, y: cy + h * 0.4))
        paper.addLine(to: CGPoint(x: cx - w * 0.25, y: cy + h))
        paper.closeSubpath()
        context.fill(paper, with: .color(palette.paper.color(0.30)))

        context.drawLayer { layer in
            layer.addFilter(.blur(radius: 2))
            layer.translateBy(x: 0, y: (cy + h) * 2)
            layer.scaleBy(x: 1, y: -0.4)
            layer.fill(paper, with: .color(palette.paper.color(0.10)))
        }
    }

    // MARK: - 粒子と縁

    private func drawGrain(in context: inout GraphicsContext, size: CGSize, palette: PlacePalette, rng: inout SeededRandom) {
        let count = 170
        for _ in 0..<count {
            let x = CGFloat(rng.double(0...Double(size.width)))
            let y = CGFloat(rng.double(0...Double(size.height)))
            let s = CGFloat(rng.double(0.6...1.6))
            let a = rng.double(0.010...0.038)
            context.fill(Path(CGRect(x: x, y: y, width: s, height: s)), with: .color(palette.ink.color(a)))
        }
    }

    private func drawVignette(in context: inout GraphicsContext, size: CGSize) {
        let rect = CGRect(origin: .zero, size: size)
        context.fill(
            Path(rect),
            with: .radialGradient(
                Gradient(colors: [Color.black.opacity(0), Color.black.opacity(0.45)]),
                center: CGPoint(x: size.width / 2, y: size.height * 0.46),
                startRadius: min(size.width, size.height) * 0.32,
                endRadius: max(size.width, size.height) * 0.78
            )
        )
    }
}
