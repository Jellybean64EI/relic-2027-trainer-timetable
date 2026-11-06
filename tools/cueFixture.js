/* Fixture only. Not loaded by index.html and not live cue content. */
window.NEXUS_CUE_FIXTURE = [
  {
    fixture: true,
    videoId: 900001,
    r2Key: "Fixture/not-live.mp4",
    title: "Fixture brace (not a live video)",
    leads: ["Set the ribs before you move.", "Lead with the left side.", "Ease the return for three seconds."],
    steps: ["Stack the ribs over the pelvis.", "Move only while the shape stays."],
    breathing: "Quiet nasal breath. No breath hold.",
    avoid: "Jerking the neck.",
    dose: { sets: "2", reps: "6", hold: "2s", rest: "45s" },
    fieldSource: { breathing: "coaching", avoid: "observed" },
    sources: ["Fixture, not footage-verified."],
    progressions: []
  },
  {
    fixture: true,
    videoId: 900002,
    r2Key: "Fixture/ref-only.mp4",
    title: "REF Fixture reference",
    reference: "REF",
    leads: [],
    steps: [],
    breathing: false,
    breathingReason: "Reference clip. No home breathing drill.",
    avoid: "",
    dose: { state: "na", reason: "Reference clip. No home dose." },
    sources: [],
    progressions: []
  }
];
