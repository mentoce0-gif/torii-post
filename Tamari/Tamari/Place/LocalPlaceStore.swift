import CoreGraphics
import Foundation

/// 同期スタブ。ネットワークを持たない。
/// 後で実サーバーに差し替える境目はここだけ。`snapshot(at:localBody:)` の中身を置き換える。
struct LocalPlaceStore {

    /// 一枚が保たれる長さ。ループ動画にしないための刻み。
    static let cutLength: TimeInterval = 5

    /// 擬似的な他人が生まれ変わる区切り。
    private static let slot: TimeInterval = 150
    private static let slotLookback = 4

    func snapshot(at now: Date, localBody: TimeBody?) -> PlaceSnapshot {
        let t = now.timeIntervalSinceReferenceDate
        let cut = Int(floor(t / Self.cutLength))
        var rng = SeededRandom(UInt64(bitPattern: Int64(cut)) &* 0x2545_F491_4F6C_DD1D)

        // 風で止まった紙。一枚ごとにわずかに違う場所にある。
        let paperOffset = CGPoint(x: rng.double(-0.035...0.035), y: rng.double(-0.012...0.012))

        // 遠くを横切る光。常時アニメにしない。出ない一枚のほうが多い。
        let crossingLight: Double? = rng.double(0...1) < 0.22 ? rng.double(0.18...0.44) : nil

        var bodies = ambientBodies(at: now)
        if let localBody {
            bodies.append(localBody)
        }

        let dayFraction = t.truncatingRemainder(dividingBy: 86_400) / 86_400
        let integrity = 0.34 + 0.22 * (0.5 + 0.5 * sin(dayFraction * 2 * .pi))

        // 眺めている気配。数として画面に出さない。
        let brightness = 0.28 + 0.16 * (0.5 + 0.5 * sin(t / 640)) + rng.double(-0.02...0.02)

        return PlaceSnapshot(
            generatedAt: now,
            daylight: Daylight.value(at: now),
            brightness: min(max(brightness, 0), 1),
            bodies: bodies,
            utterances: [],
            structure: Structure(integrity: min(max(integrity, 0), 1)),
            paperOffset: paperOffset,
            cut: cut,
            crossingLight: crossingLight
        )
    }

    /// 場に先にいる時間身体。ローカル擬似更新であって、人数ではない。
    private func ambientBodies(at now: Date) -> [TimeBody] {
        let t = now.timeIntervalSinceReferenceDate
        let currentSlot = Int(floor(t / Self.slot))
        var result: [TimeBody] = []

        for back in 0...Self.slotLookback {
            let slotIndex = currentSlot - back
            var rng = SeededRandom(UInt64(bitPattern: Int64(slotIndex)) &* 0x9E37_79B9_7F4A_7C15 &+ 0x51)
            guard rng.double(0...1) < 0.4 else { continue }

            let slotStart = Double(slotIndex) * Self.slot
            let birth = slotStart + rng.double(0...Self.slot)
            guard birth <= t else { continue }

            let initial = rng.double(150...600)
            let remaining = initial - (t - birth)
            guard remaining > 0 else { continue }

            result.append(
                TimeBody(
                    id: Self.stableID(slotIndex),
                    remaining: remaining,
                    initial: initial,
                    isLocalUser: false
                )
            )
        }
        return result
    }

    private static func stableID(_ seed: Int) -> UUID {
        var rng = SeededRandom(UInt64(bitPattern: Int64(seed)) &* 0xD1B5_4A32_D192_ED03 &+ 0x9E37)
        var bytes = [UInt8]()
        for _ in 0..<2 {
            let word = rng.next()
            for shift in stride(from: 56, through: 0, by: -8) {
                bytes.append(UInt8((word >> UInt64(shift)) & 0xFF))
            }
        }
        return UUID(uuid: (bytes[0], bytes[1], bytes[2], bytes[3],
                           bytes[4], bytes[5], bytes[6], bytes[7],
                           bytes[8], bytes[9], bytes[10], bytes[11],
                           bytes[12], bytes[13], bytes[14], bytes[15]))
    }

    static func initialSnapshot() -> PlaceSnapshot {
        LocalPlaceStore().snapshot(at: Date(), localBody: nil)
    }
}
