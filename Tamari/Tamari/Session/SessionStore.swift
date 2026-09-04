import Foundation
import Observation
#if canImport(UIKit)
import UIKit
#endif

/// phase と自分の残り時間だけを持つ。履歴を持たない。
@Observable
final class SessionStore {

    private(set) var phase: Phase = .gaze
    private(set) var seed: WaitSeed?

    private var bodyID = UUID()
    private var startedAt: Date?
    private var initial: TimeInterval = 0

    /// 減衰の速さ。通常は 1。DEBUG のみ起動引数で早送りできる（画面には出さない）。
    let timeScale: Double

    init(timeScale: Double? = nil) {
        if let timeScale {
            self.timeScale = timeScale
        } else {
            #if DEBUG
            let requested = UserDefaults.standard.double(forKey: "TamariTimeScale")
            self.timeScale = requested > 0 ? min(max(requested, 1), 600) : 1
            #else
            self.timeScale = 1
            #endif
        }
    }

    // MARK: - 遷移

    func openWaitInput() {
        guard phase == .gaze else { return }
        phase = .waitInput
    }

    func closeWaitInput() {
        guard phase == .waitInput else { return }
        phase = .gaze
    }

    /// 待ちを置く。以後は現実時間で減る。
    func seat(_ seed: WaitSeed, now: Date = Date()) {
        guard seed.duration > 0 else { return }
        self.seed = seed
        self.initial = seed.duration
        self.startedAt = now
        self.bodyID = UUID()
        self.phase = .seated
        #if canImport(UIKit)
        // 在席開始だけ、一回コッ。消滅では振動しない。
        let tap = UIImpactFeedbackGenerator(style: .rigid)
        tap.prepare()
        tap.impactOccurred(intensity: 0.7)
        #endif
    }

    /// 0 でその身体は削除。コピーなし。gaze へ戻る。
    func update(now: Date) {
        guard phase == .seated else { return }
        if remaining(at: now) <= 0 {
            startedAt = nil
            seed = nil
            initial = 0
            phase = .gaze
        }
    }

    func remaining(at now: Date) -> TimeInterval {
        guard let startedAt else { return 0 }
        let elapsed = now.timeIntervalSince(startedAt) * timeScale
        return max(initial - elapsed, 0)
    }

    /// 自分の時間身体。gaze の間は身体を持たない。
    func localBody(at now: Date) -> TimeBody? {
        guard phase == .seated, initial > 0 else { return nil }
        let left = remaining(at: now)
        guard left > 0 else { return nil }
        return TimeBody(id: bodyID, remaining: left, initial: initial, isLocalUser: true)
    }
}
