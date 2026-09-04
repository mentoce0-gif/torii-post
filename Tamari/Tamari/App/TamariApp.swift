import SwiftUI

@main
struct TamariApp: App {
    var body: some Scene {
        WindowGroup {
            // ホーム画面を持たない。起動 = ただちに gaze の場。
            PlaceView()
        }
    }
}
