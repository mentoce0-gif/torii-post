import CoreGraphics
import Foundation
import simd

/// 状態は3つだけ。
enum Phase {
    case gaze
    case waitInput
    case seated
}

enum WaitSubject: Hashable {
    case train
    case bath
    case laundry
    case someone
    case untilDone
    case custom(String)

    /// waitInput の中でだけ見える固定語。場には残さない。
    var word: String {
        switch self {
        case .train: return "電車"
        case .bath: return "湯"
        case .laundry: return "洗濯"
        case .someone: return "誰か"
        case .untilDone: return "終わるまで"
        case .custom(let s): return s
        }
    }

    static let fixed: [WaitSubject] = [.train, .bath, .laundry, .someone, .untilDone]
}

struct WaitSeed {
    var subject: WaitSubject
    /// 現実の待ち。UI に常時数字を出さない。
    var duration: TimeInterval
}

struct TimeBody: Identifiable {
    /// 内部用。画面に出さない。
    var id: UUID
    var remaining: TimeInterval
    var initial: TimeInterval
    var isLocalUser: Bool

    /// 0...1。1 = 置かれたばかり、0 = 消滅。
    var life: Double {
        guard initial > 0 else { return 0 }
        return min(max(remaining / initial, 0), 1)
    }

    /// 形と位置のための安定した種。id から作る（乱数を状態に持たない）。
    var visualSeed: UInt64 {
        let u = id.uuid
        let bytes: [UInt8] = [u.0, u.1, u.2, u.3, u.4, u.5, u.6, u.7]
        return bytes.reduce(UInt64(0xCBF2_9CE4_8422_2325)) { acc, b in
            (acc ^ UInt64(b)) &* 0x0000_0100_0000_01B3
        }
    }
}

struct Utterance: Identifiable {
    var id = UUID()
    /// 短い。
    var text: String
    var appearedAt: Date
    var lifetime: TimeInterval
    /// 場の正規化座標。発言者 ID を持たない。
    var anchor: SIMD2<Float>
}

struct Structure {
    /// 0...1 崩れ。
    var integrity: Double
}

struct PlaceSnapshot {
    var generatedAt: Date
    /// 0 night ... 1 day（端末時刻から）
    var daylight: Double
    /// 眺めている気配の抽象。人数として画面に出さない。
    var brightness: Double
    var bodies: [TimeBody]
    var utterances: [Utterance]
    var structure: Structure
    /// 静止画系列用の微小差。
    var paperOffset: CGPoint
    /// この一枚の番号。変わったら別の一枚。
    var cut: Int
    /// この一枚にだけ遠くを光が横切る。
    var crossingLight: Double?

    /// 場が暇か。人数ラベルは作らない。
    var isQuiet: Bool { bodies.filter { !$0.isLocalUser }.count <= 1 }

    /// 希薄化。身体が増えるほど個々の形のコントラストを下げる。
    var contrast: Double { 1.0 / (1.0 + 0.38 * Double(max(bodies.count - 1, 0))) }
}

/// 種から作る決定的な乱数。場は毎フレーム揺れない。
struct SeededRandom: RandomNumberGenerator {
    private var state: UInt64

    init(_ seed: UInt64) {
        state = seed == 0 ? 0x9E37_79B9_7F4A_7C15 : seed
    }

    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }

    /// 0...1 の一様乱数から範囲へ写す（`&self` を渡す形を避ける）。
    mutating func unit() -> Double {
        Double(next() >> 11) * (1.0 / 9_007_199_254_740_992.0)
    }

    mutating func double(_ range: ClosedRange<Double>) -> Double {
        range.lowerBound + unit() * (range.upperBound - range.lowerBound)
    }
}
