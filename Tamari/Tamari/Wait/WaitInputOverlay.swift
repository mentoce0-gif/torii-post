import SwiftUI

/// 何を／どれだけ、の短い重ね。場は後ろに残る。
/// 送信ボタンを置かない。時間を選んだ時点で置かれる。
/// 目盛は 5 / 10 / 20 / 40 分 / 1時間 に対応するが、数字を書かない（確定後も場に数字を残さない）。
struct WaitInputOverlay: View {

    var onSeat: (WaitSeed) -> Void
    var onDismiss: () -> Void

    @State private var subject: WaitSubject?
    @State private var word: String = ""
    @FocusState private var wordFocused: Bool

    private let durations: [TimeInterval] = [5 * 60, 10 * 60, 20 * 60, 40 * 60, 60 * 60]
    private let ink = Color(.sRGB, red: 0.796, green: 0.827, blue: 0.796, opacity: 1)

    var body: some View {
        ZStack {
            Color.black.opacity(0.34)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { dismiss() }

            VStack(spacing: 34) {
                Text(Tokens.Copy.what)
                    .font(Tokens.Layout.overlayFont)
                    .foregroundStyle(ink.opacity(0.5))

                VStack(spacing: 16) {
                    HStack(spacing: 26) {
                        ForEach(Array(WaitSubject.fixed.prefix(3)), id: \.self) { candidate in
                            wordButton(candidate)
                        }
                    }
                    HStack(spacing: 26) {
                        ForEach(Array(WaitSubject.fixed.suffix(2)), id: \.self) { candidate in
                            wordButton(candidate)
                        }
                    }
                }

                TextField("", text: $word)
                    .focused($wordFocused)
                    .font(Tokens.Layout.wordFont)
                    .foregroundStyle(ink.opacity(0.72))
                    .multilineTextAlignment(.center)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .frame(width: 132)
                    .padding(.bottom, 4)
                    .overlay(alignment: .bottom) {
                        Rectangle()
                            .fill(ink.opacity(0.14))
                            .frame(height: 0.5)
                    }
                    .onChange(of: word) { _, newValue in
                        // ごく短い語だけ。上限 8 字（書記素）。
                        if newValue.count > 8 {
                            word = String(newValue.prefix(8))
                        }
                    }

                marks
                    .padding(.top, 6)
            }
            .padding(.horizontal, 28)
        }
        .gesture(
            DragGesture(minimumDistance: 30)
                .onEnded { value in
                    if value.translation.height > 40 { dismiss() }
                }
        )
    }

    private func wordButton(_ candidate: WaitSubject) -> some View {
        let chosen = subject == candidate
        return Text(candidate.word)
            .font(Tokens.Layout.wordFont)
            .foregroundStyle(ink.opacity(chosen ? 0.88 : 0.38))
            .padding(.vertical, 8)
            .padding(.horizontal, 4)
            .contentShape(Rectangle())
            .onTapGesture {
                wordFocused = false
                subject = chosen ? nil : candidate
            }
    }

    /// 時間。ホイールでも数字でもなく、重さの目盛。
    private var marks: some View {
        HStack(alignment: .bottom, spacing: 22) {
            ForEach(Array(durations.enumerated()), id: \.offset) { index, duration in
                Rectangle()
                    .fill(ink.opacity(ready ? 0.42 : 0.12))
                    .frame(width: 2, height: 7 + CGFloat(index) * 6)
                    .padding(.vertical, 14)
                    .padding(.horizontal, 6)
                    .contentShape(Rectangle())
                    .onTapGesture { seat(duration) }
            }
        }
    }

    private var ready: Bool {
        subject != nil || !word.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private func seat(_ duration: TimeInterval) {
        let trimmed = word.trimmingCharacters(in: .whitespaces)
        let chosen: WaitSubject?
        if !trimmed.isEmpty {
            chosen = .custom(trimmed)
        } else {
            chosen = subject
        }
        guard let chosen else { return }
        wordFocused = false
        onSeat(WaitSeed(subject: chosen, duration: duration))
    }

    private func dismiss() {
        wordFocused = false
        onDismiss()
    }
}
