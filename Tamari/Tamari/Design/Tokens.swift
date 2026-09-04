import SwiftUI

/// 低彩度のみ。黒緑、湿った灰、遠いナトリウム灯。
/// 色は場のためだけにある。UI に色を割り当てない。
struct RGB {
    var r: Double
    var g: Double
    var b: Double

    func lerp(to other: RGB, _ t: Double) -> RGB {
        let t = min(max(t, 0), 1)
        return RGB(r: r + (other.r - r) * t,
                   g: g + (other.g - g) * t,
                   b: b + (other.b - b) * t)
    }

    func color(_ opacity: Double = 1) -> Color {
        Color(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}

struct PlacePalette {
    var skyHigh: RGB
    var skyLow: RGB
    var floor: RGB
    var floorFar: RGB
    var sheen: RGB
    var lamp: RGB
    var lampGlow: RGB
    var structure: RGB
    var shutter: RGB
    var paper: RGB
    var body: RGB
    var ink: RGB
}

enum Tokens {

    private static let night = PlacePalette(
        skyHigh: RGB(r: 0.020, g: 0.031, b: 0.035),
        skyLow: RGB(r: 0.047, g: 0.078, b: 0.075),
        floor: RGB(r: 0.027, g: 0.039, b: 0.039),
        floorFar: RGB(r: 0.055, g: 0.082, b: 0.078),
        sheen: RGB(r: 0.145, g: 0.196, b: 0.180),
        lamp: RGB(r: 0.839, g: 0.631, b: 0.353),
        lampGlow: RGB(r: 0.541, g: 0.384, b: 0.204),
        structure: RGB(r: 0.075, g: 0.098, b: 0.094),
        shutter: RGB(r: 0.043, g: 0.055, b: 0.055),
        paper: RGB(r: 0.420, g: 0.435, b: 0.400),
        body: RGB(r: 0.678, g: 0.717, b: 0.678),
        ink: RGB(r: 0.729, g: 0.760, b: 0.729)
    )

    private static let day = PlacePalette(
        skyHigh: RGB(r: 0.600, g: 0.627, b: 0.616),
        skyLow: RGB(r: 0.686, g: 0.706, b: 0.690),
        floor: RGB(r: 0.361, g: 0.384, b: 0.373),
        floorFar: RGB(r: 0.478, g: 0.498, b: 0.486),
        sheen: RGB(r: 0.612, g: 0.639, b: 0.627),
        lamp: RGB(r: 0.545, g: 0.518, b: 0.451),
        lampGlow: RGB(r: 0.478, g: 0.475, b: 0.443),
        structure: RGB(r: 0.278, g: 0.298, b: 0.290),
        shutter: RGB(r: 0.231, g: 0.247, b: 0.243),
        paper: RGB(r: 0.792, g: 0.796, b: 0.769),
        body: RGB(r: 0.290, g: 0.318, b: 0.302),
        ink: RGB(r: 0.192, g: 0.216, b: 0.204)
    )

    /// daylight: 0 = 夜 ... 1 = 昼
    static func palette(daylight d: Double) -> PlacePalette {
        let t = min(max(d, 0), 1)
        return PlacePalette(
            skyHigh: night.skyHigh.lerp(to: day.skyHigh, t),
            skyLow: night.skyLow.lerp(to: day.skyLow, t),
            floor: night.floor.lerp(to: day.floor, t),
            floorFar: night.floorFar.lerp(to: day.floorFar, t),
            sheen: night.sheen.lerp(to: day.sheen, t),
            lamp: night.lamp.lerp(to: day.lamp, t),
            lampGlow: night.lampGlow.lerp(to: day.lampGlow, t),
            structure: night.structure.lerp(to: day.structure, t),
            shutter: night.shutter.lerp(to: day.shutter, t),
            paper: night.paper.lerp(to: day.paper, t),
            body: night.body.lerp(to: day.body, t),
            ink: night.ink.lerp(to: day.ink, t)
        )
    }

    /// 場に出してよい語だけ。ここに無い文言を画面に足さない。
    enum Copy {
        static let invitation = "待ってる？"
        static let what = "何を？"
    }

    enum Layout {
        /// 水平線。ここから下が濡れた床。
        static let horizon: CGFloat = 0.52
        static let overlayFont = Font.system(size: 17, weight: .light, design: .default)
        static let wordFont = Font.system(size: 19, weight: .light, design: .default)
    }
}
