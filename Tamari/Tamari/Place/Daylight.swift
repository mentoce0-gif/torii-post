import Foundation

/// 端末時刻だけで昼/夜を決める。位置情報も天気も取らない。
enum Daylight {

    /// 0 = 夜 ... 1 = 昼
    static func value(at date: Date, calendar: Calendar = .current) -> Double {
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        let hour = Double(parts.hour ?? 0) + Double(parts.minute ?? 0) / 60.0
        return value(hour: hour)
    }

    static func value(hour: Double) -> Double {
        switch hour {
        case ..<4.5:
            return 0
        case ..<8.0:
            return smoothstep((hour - 4.5) / 3.5)
        case ..<16.0:
            return 1
        case ..<20.0:
            return 1 - smoothstep((hour - 16.0) / 4.0)
        default:
            return 0
        }
    }

    private static func smoothstep(_ x: Double) -> Double {
        let t = min(max(x, 0), 1)
        return t * t * (3 - 2 * t)
    }
}
