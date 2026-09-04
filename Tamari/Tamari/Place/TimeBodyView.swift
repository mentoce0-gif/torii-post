import SwiftUI

/// 時間身体の描画。人型禁止。顔・服・色選択・エモートを持たない。
/// remaining / initial だけが、大きさ・輪郭の曖昧さ・透明度・重さ・揺れを決める。
/// 一枚の絵として `PlaceRenderer` の Canvas から呼ばれる（個別の View にして毎フレーム動かさない）。
enum TimeBodyPainter {

    static func draw(
        _ body: TimeBody,
        in context: inout GraphicsContext,
        size: CGSize,
        palette: PlacePalette,
        contrast: Double,
        cut: Int
    ) {
        let life = body.life
        guard life > 0 else { return }

        var place = SeededRandom(body.visualSeed)
        // 立ち位置。自分は少し手前。他人は場に散る。
        let nx: Double
        let ny: Double
        if body.isLocalUser {
            nx = 0.5 + place.double(-0.06...0.06)
            ny = 0.80 + place.double(-0.02...0.02)
        } else {
            nx = place.double(0.12...0.88)
            ny = place.double(0.60...0.78)
        }

        // 揺れ。毎フレームではなく、一枚ごとに違う。
        var wobble = SeededRandom(body.visualSeed ^ UInt64(bitPattern: Int64(cut)))
        let sway = CGSize(
            width: wobble.double(-0.006...0.006) * size.width,
            height: wobble.double(-0.004...0.004) * size.height
        )

        let base = min(size.width, size.height) * (body.isLocalUser ? 0.17 : 0.13)
        // 幅は先に痩せ、高さは遅れて痩せる。塊 → 輪郭 → 細い形 → 線 → 点。
        let width = base * (pow(life, 1.5) * 0.95 + 0.01)
        let height = base * (pow(life, 0.55) * 0.9 + 0.012)

        let center = CGPoint(
            x: CGFloat(nx) * size.width + sway.width,
            y: CGFloat(ny) * size.height + sway.height
        )

        let emphasis = body.isLocalUser ? 1.12 : 1.0
        let fillAlpha = contrast * emphasis * (0.06 + 0.42 * smoothstep((life - 0.22) / 0.55))
        let edgeAlpha = contrast * emphasis * 0.34 * bump(life, center: 0.30, width: 0.45)
        let blur = CGFloat(base * 0.16 * (0.35 + 0.75 * (1 - life)))

        let path = blobPath(
            center: center,
            width: width,
            height: height,
            seed: body.visualSeed,
            cut: cut
        )

        // にじみ（重さ）。濡れた床にわずかに落ちる。
        context.drawLayer { layer in
            layer.addFilter(.blur(radius: blur * 2.2))
            layer.translateBy(x: 0, y: center.y * 2 + height * 0.35)
            layer.scaleBy(x: 1, y: -0.55)
            layer.fill(path, with: .color(palette.body.color(fillAlpha * 0.30)))
        }

        context.drawLayer { layer in
            layer.addFilter(.blur(radius: blur))
            layer.fill(path, with: .color(palette.body.color(fillAlpha)))
            if edgeAlpha > 0.004 {
                layer.stroke(
                    path,
                    with: .color(palette.body.color(edgeAlpha)),
                    lineWidth: max(0.6, base * 0.012)
                )
            }
        }
    }

    // MARK: - 形

    private static func blobPath(center: CGPoint, width: CGFloat, height: CGFloat, seed: UInt64, cut: Int) -> Path {
        var rng = SeededRandom(seed &+ 0x1234_5678)
        var drift = SeededRandom(seed ^ (UInt64(bitPattern: Int64(cut)) &* 0x7F4A_7C15))
        let steps = 22
        var radii: [Double] = []
        for _ in 0..<steps {
            radii.append(rng.double(0.78...1.15) + drift.double(-0.05...0.05))
        }

        var path = Path()
        for i in 0...steps {
            let index = i % steps
            let angle = Double(i) / Double(steps) * 2 * .pi
            let r = radii[index]
            let point = CGPoint(
                x: center.x + CGFloat(cos(angle) * r) * width * 0.5,
                y: center.y + CGFloat(sin(angle) * r) * height * 0.5
            )
            if i == 0 {
                path.move(to: point)
            } else {
                path.addLine(to: point)
            }
        }
        path.closeSubpath()
        return path
    }

    private static func smoothstep(_ x: Double) -> Double {
        let t = min(max(x, 0), 1)
        return t * t * (3 - 2 * t)
    }

    private static func bump(_ x: Double, center: Double, width: Double) -> Double {
        let d = (x - center) / width
        return max(0, 1 - d * d)
    }
}
