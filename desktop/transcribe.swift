import Foundation
import Speech

guard CommandLine.arguments.count == 3 else { fputs("Invalid arguments.\n", stderr); exit(2) }
let file = URL(fileURLWithPath: CommandLine.arguments[1])
let locale = Locale(identifier: CommandLine.arguments[2])
let semaphore = DispatchSemaphore(value: 0)
var permission = SFSpeechRecognizerAuthorizationStatus.notDetermined
SFSpeechRecognizer.requestAuthorization { status in permission = status; semaphore.signal() }
_ = semaphore.wait(timeout: .now() + 30)
guard permission == .authorized else { fputs("Speech recognition permission was not granted.\n", stderr); exit(3) }
guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable, recognizer.supportsOnDeviceRecognition else { fputs("An on-device recognizer is unavailable for this language.\n", stderr); exit(4) }
let request = SFSpeechURLRecognitionRequest(url: file)
request.requiresOnDeviceRecognition = true
request.shouldReportPartialResults = false
var resultText: String? = nil
var failure: Error? = nil
let complete = DispatchSemaphore(value: 0)
let task = recognizer.recognitionTask(with: request) { result, error in
  if let result = result, result.isFinal { resultText = result.bestTranscription.formattedString; complete.signal() }
  else if let error = error { failure = error; complete.signal() }
}
if complete.wait(timeout: .now() + 80) == .timedOut { task.cancel(); fputs("Transcription timed out.\n", stderr); exit(5) }
if let failure = failure { fputs("\(failure.localizedDescription)\n", stderr); exit(6) }
print(resultText ?? "")
