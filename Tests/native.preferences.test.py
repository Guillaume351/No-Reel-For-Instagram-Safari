"""Execute the real Swift completion body with Foundation-only API stubs.

This checks the error/success branches without calling Safari, opening settings,
quitting an app, or claiming a physical WebKit/Safari integration test.
"""
import json
import pathlib
import subprocess
import tempfile

repo = pathlib.Path(__file__).resolve().parents[1]
source = (repo / 'Shared (App)/ViewController.swift').read_text()
marker = 'SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in'
start = source.index(marker) + len(marker)
depth = 1
end = start
while depth:
    char = source[end]
    if char == '{':
        depth += 1
    elif char == '}':
        depth -= 1
    end += 1
body = source[start:end - 1]

program = '''import Foundation
final class MockWebView {
    var scripts: [String] = []
    func evaluateJavaScript(_ script: String) { precondition(Thread.isMainThread); scripts.append(script) }
}
final class MockApplication {
    var terminations = 0
    func terminate(_ sender: Any?) { precondition(Thread.isMainThread); terminations += 1 }
}
let NSApp = MockApplication()
final class Controller {
    let webView = MockWebView()
    func result(_ error: Error?) {
''' + body + '''
    }
}
let failure = Controller()
DispatchQueue.global().async {
    failure.result(NSError(domain: "SensitiveTechnicalDetailsMustNeverReachHTML", code: 42))
}
RunLoop.main.run(until: Date().addingTimeInterval(0.2))
precondition(failure.webView.scripts == ["showPreferencesError()"])
precondition(NSApp.terminations == 0)
let success = Controller()
DispatchQueue.global().async { success.result(nil) }
RunLoop.main.run(until: Date().addingTimeInterval(0.2))
precondition(success.webView.scripts.isEmpty)
precondition(NSApp.terminations == 1)
print("PASS error: background completion routes generic message to main thread, app stays open")
print("PASS success: background completion routes termination to main thread, no error message")
'''

with tempfile.TemporaryDirectory(prefix='no-reel-native-preferences-', dir='/private/tmp') as directory:
    swift = pathlib.Path(directory) / 'preferences.swift'
    swift.write_text(program)
    result = subprocess.run(['xcrun', 'swift', str(swift)], capture_output=True, text=True, timeout=120)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    print(result.stdout, end='')
print(json.dumps({'passed': 2, 'failed': 0, 'actualSwiftCompletionBodyExecuted': True,
                  'mainThreadDispatchVerified': True, 'safariAPICalled': False, 'physicalIntegrationPassed': False}))
