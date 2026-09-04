import SwiftUI

/// 一枚だけの画面。窓の向こうに場所がある。
/// タブもナビもホームも無い。常設ボタンをセーフエリアに置かない。
struct PlaceView: View {

    @State private var session = SessionStore()
    @State private var snapshot = LocalPlaceStore.initialSnapshot()
    @State private var invitation = InvitationDirector()

    private let place = LocalPlaceStore()

    var body: some View {
        ZStack {
            PlaceRenderer(snapshot: snapshot)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                // 他人の形をヒットテストしない。選択操作を持たない。
                .onLongPressGesture(minimumDuration: 0.9) {
                    if session.phase == .gaze {
                        invitation.dismiss()
                        session.openWaitInput()
                    }
                }

            if invitation.isVisible && session.phase == .gaze {
                Text(Tokens.Copy.invitation)
                    .font(Tokens.Layout.overlayFont)
                    .foregroundStyle(
                        Tokens.palette(daylight: snapshot.daylight).ink.color(0.52)
                    )
                    .padding(24)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        invitation.dismiss()
                        session.openWaitInput()
                    }
                    .offset(y: 120)
                    .transition(.opacity)
            }

            if session.phase == .waitInput {
                WaitInputOverlay(
                    onSeat: { seed in
                        session.seat(seed, now: Date())
                        refresh(at: Date())
                    },
                    onDismiss: { session.closeWaitInput() }
                )
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 1.4), value: invitation.isVisible)
        .animation(.easeInOut(duration: 0.45), value: session.phase)
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
        .task {
            refresh(at: Date())
            while !Task.isCancelled {
                let interval: Duration = session.phase == .seated ? .milliseconds(200) : .milliseconds(500)
                try? await Task.sleep(for: interval)
                refresh(at: Date())
            }
        }
    }

    /// 一枚を描き直す。減衰と消滅はここでだけ進む。
    private func refresh(at now: Date) {
        session.update(now: now)
        snapshot = place.snapshot(at: now, localBody: session.localBody(at: now))
        invitation.update(now: now, phase: session.phase, quiet: snapshot.isQuiet)
    }
}

/// 「待ってる？」を出すかどうか。
/// gaze が 3 秒以上、かつ場が暇なときだけ、低い確率で。出せない日を許容する。
struct InvitationDirector {

    private(set) var isVisible = false
    private var nextRoll: Date?
    private var hideAt: Date?

    mutating func update(now: Date, phase: Phase, quiet: Bool) {
        guard phase == .gaze else {
            isVisible = false
            nextRoll = nil
            hideAt = nil
            return
        }

        if let hideAt, now >= hideAt {
            isVisible = false
            self.hideAt = nil
            // 一度引っ込んだら、しばらく出ない。
            nextRoll = now.addingTimeInterval(45)
            return
        }

        guard !isVisible else { return }

        guard let roll = nextRoll else {
            // 眺めはじめてから 3 秒。
            nextRoll = now.addingTimeInterval(3)
            return
        }

        guard now >= roll else { return }

        if quiet, Double.random(in: 0...1) < 0.22 {
            isVisible = true
            hideAt = now.addingTimeInterval(11)
        } else {
            nextRoll = now.addingTimeInterval(4)
        }
    }

    mutating func dismiss() {
        isVisible = false
        hideAt = nil
        nextRoll = nil
    }
}

#Preview {
    PlaceView()
}
