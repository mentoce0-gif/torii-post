import SwiftUI

/// 不明な構造物。用途を説明しない。何かが閉まっている、その隣に立っている。
/// integrity が低いほど輪郭が欠ける。数値もゲージも画面に出さない。
enum StructurePainter {

    static func draw(
        _ structure: Structure,
        in context: inout GraphicsContext,
        size: CGSize,
        palette: PlacePalette,
        cut: Int
    ) {
        let horizon = size.height * Tokens.Layout.horizon
        let baseY = horizon + size.height * 0.06
        let top = horizon - size.height * 0.20 - CGFloat(structure.integrity) * size.height * 0.05
        let cx = size.width * 0.685
        let halfWidth = size.width * 0.085

        var rng = SeededRandom(0xA51E &+ UInt64(bitPattern: Int64(cut)))

        var body = Path()
        body.move(to: CGPoint(x: cx - halfWidth, y: baseY))
        body.addLine(to: CGPoint(x: cx - halfWidth * 0.82, y: top + size.height * 0.02))
        body.addLine(to: CGPoint(x: cx + halfWidth * 0.35, y: top))
        body.addLine(to: CGPoint(x: cx + halfWidth, y: top + size.height * 0.045))
        body.addLine(to: CGPoint(x: cx + halfWidth * 0.9, y: baseY))
        body.closeSubpath()

        context.fill(body, with: .color(palette.structure.color(0.92)))
        context.stroke(body, with: .color(palette.ink.color(0.05 + 0.05 * structure.integrity)), lineWidth: 0.8)

        // 崩れ。低い integrity ほど欠けが増える。
        let gaps = Int((1 - structure.integrity) * 7) + 1
        for _ in 0..<gaps {
            let y = rng.double(Double(top)...Double(baseY - size.height * 0.02))
            let h = rng.double(1.5...4.0)
            let inset = rng.double(0...Double(halfWidth))
            var gap = Path()
            gap.addRect(
                CGRect(
                    x: cx - halfWidth + CGFloat(inset) * 0.5,
                    y: CGFloat(y),
                    width: halfWidth * CGFloat(rng.double(0.5...1.6)),
                    height: CGFloat(h)
                )
            )
            context.fill(gap, with: .color(palette.skyLow.color(0.5)))
        }

        // 濡れた床への映り込み。
        context.drawLayer { layer in
            layer.addFilter(.blur(radius: size.width * 0.012))
            layer.translateBy(x: 0, y: baseY * 2)
            layer.scaleBy(x: 1, y: -0.42)
            layer.fill(body, with: .color(palette.structure.color(0.42)))
        }
    }
}
