import { test } from "node:test";
import assert from "node:assert/strict";
import { createFaceSignalTracker } from "../src/proctoring-signals.js";
test("brief missing face observations are ignored", () => {
  const detect = createFaceSignalTracker();
  assert.equal(detect(0, 0), null);
  assert.equal(detect(0, 2000), null);
  assert.equal(detect(1, 2500), null);
  assert.equal(detect(1, 6000), null);
});
test("persistent absence and multiple faces flag separately with cooldown and recovery", () => {
  const detect = createFaceSignalTracker(),
    events = [];
  for (let time = 0; time <= 45000; time += 500) {
    const count = time < 34000 ? 0 : time < 38000 ? 2 : 1;
    const signal = detect(count, time);
    if (signal) events.push([time, signal]);
  }
  assert.deepEqual(events, [
    [3000, "FACE_ABSENT"],
    [33000, "FACE_ABSENT"],
    [37000, "MULTIPLE_FACES"],
    [41000, "FACE_RESTORED"],
  ]);
});
test("background pauses do not count as continuous face absence", () => {
  const detect = createFaceSignalTracker();
  detect(0, 0);
  assert.equal(detect(0, 10000), null);
  assert.equal(detect(0, 11000), null);
  assert.equal(detect(0, 12000), null);
  assert.equal(detect(0, 13000), "FACE_ABSENT");
});
