# Local face detection assets

`blaze_face_short_range.tflite` is Google's MediaPipe BlazeFace short-range face detector, float16 version 1, downloaded from:

https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite

The WASM runtime is copied from the pinned `@mediapipe/tasks-vision` npm package during `npm run prepare:proctoring` (automatically before dev/build). Its generated `wasm/` directory is ignored by Git. The package includes its licensing information. See https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector for model information and https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE for MediaPipe's Apache 2.0 license.

Inference runs locally in the student's browser. Neither frames nor audio are sent to AssessmentDesk or Google. Only event types and server receipt timestamps are persisted. Detection does not establish identity, gaze, intent, or misconduct.
