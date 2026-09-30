/* Clip-keyed forensic cues. Follow-up dumps call RELIC_FORENSIC.ingestClips(array).
   Back Base is the first complete cabin, parsed from Joe's trainer document.
   Key is the Drive file id, which is videoArchive clip.id. */
(function () {
  var lib = window.RELIC_FORENSIC;
  if (!lib || typeof lib.ingestClips !== "function") return;
  lib.ingestClips([
  {
    "id": "1eeI8Xg5cnLFyW24UGYM-HEk-q_YtCPSF",
    "cabin": "Back",
    "phase": "Base",
    "title": "Spine Circles",
    "metrics": "Sets: 3 | Reps: 6–8 / way | Hold: 1 sec | Rest: 20 sec",
    "leadRule": "3-second circle each way. Hands under shoulders. Knees under hips.",
    "doThis": "Quadruped. Draw a slow circle with the whole spine — tailbone, ribs, then chest.\nReverse the circle. Keep the neck long.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Collapsing into the lumbar spine.\nRushing the circle into a bounce."
  },
  {
    "id": "19NojjFZ4WJigtiQUcsrfJ5xhzUV8FjtZ",
    "cabin": "Back",
    "phase": "Base",
    "title": "Supine Windshield Wipers",
    "metrics": "Sets: 3 | Reps: 8–10 each | Hold: 1 sec | Rest: 45 sec",
    "leadRule": "Left-Lead on sided sweeps. 3-second lower of the legs. Head stays heavy.",
    "doThis": "Run the clip order: prone opposite-limb reach — switch side — then supine 90° windshield wipers.\nHands under the head on the floor series. Legs move. Torso stays quiet.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Letting the opposite shoulder peel off the floor.\nKicking the legs to fake range."
  },
  {
    "id": "1vrZ5_aNFNxSJwloXhA3WZ-78M2kD4XNt",
    "cabin": "Back",
    "phase": "Base",
    "title": "Prone Superman Hold",
    "metrics": "Sets: 3 | Reps: 1 | Hold: 20–30 sec | Rest: 20 sec",
    "leadRule": "3-second lift. 3-second lower. Nose stays off the floor.",
    "doThis": "Prone. Arms long. Lift the chest, arms and thighs together.\nSqueeze mid-back and glutes. Lower 3 seconds.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Craning the neck to look forward.\nDumping into a lumbar hinge."
  },
  {
    "id": "1uIvViqPctj6RWdw2omosxCmPUHl5f_9N",
    "cabin": "Back",
    "phase": "Base",
    "title": "Arm Swatter",
    "metrics": "Sets: 3 | Reps: 8–10 / reach | Hold: 1 sec | Rest: 20 sec",
    "leadRule": "Left-Lead around the clock. 3-second reach. Chest stays on the floor.",
    "doThis": "Prone. Markers or balls in a wide arc. Reach one hand to each point.\nThumb up. Shoulder blade glides. Finish the left arc before the right.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Rolling the torso to cheat the far reach.\nShrugging the working trap into the ear."
  },
  {
    "id": "1U-pYwFRTZAyzK8C2JejhJYTRbaZfCJMO",
    "cabin": "Back",
    "phase": "Base",
    "title": "Shoulder Mobility Routine",
    "metrics": "Sets: 3 | Reps: 8–10 each | Hold: 1 sec | Rest: 45 sec",
    "leadRule": "3-second ease into each seated position. Ribs stay down.",
    "doThis": "Sit tall. Run the four positions in clip order: arms overhead — arms open behind — hands behind the head — hands on the upper back.\nSqueeze the blades on the open positions. Soften the neck.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Flaring the ribs to fake height.\nYanking the neck with the hands."
  },
  {
    "id": "1bpV6em7o3Rhe_5Lo8FTeNfBDMEnjqglF",
    "cabin": "Back",
    "phase": "Base",
    "title": "Wall Thoracic Stretch (Elevated Puppy)",
    "metrics": "Sets: 3 | Reps: 1 | Hold: 30 sec | Rest: 20 sec",
    "leadRule": "3-second sink of the chest toward the wall on every exhale.",
    "doThis": "Sit or kneel at the wall. Arms long up the wall. Chest reaches forward.\nShoulders down off the ears. Breathe into the mid-back.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Craning the neck toward the ceiling.\nBending the elbows to fake range."
  },
  {
    "id": "18HWRChxrwF-vgBWa0JykYwSBZxVhVQIa",
    "cabin": "Back",
    "phase": "Base",
    "title": "Band Side Bend",
    "metrics": "Sets: 3 | Reps: 1 / side | Hold: 30 sec | Rest: 15 sec",
    "leadRule": "Left-Lead. 3-second side-bend on the exhale. Both feet planted.",
    "doThis": "Stand tall with the stick or band overhead, arms long.\nBend left. Ribs stacked. Return 3 seconds. Then right.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Folding forward at the waist.\nBouncing the lean."
  },
  {
    "id": "1282HTuKr98C67lFqT9PLQ9lo4YFb9Ihr",
    "cabin": "Back",
    "phase": "Base",
    "title": "Scapular Push-Ups",
    "metrics": "Sets: 3 | Reps: 10–12 | Hold: 1 sec | Rest: 45 sec",
    "leadRule": "3-second protract. 3-second retract. Elbows stay locked.",
    "doThis": "High plank or knees down. Arms long. Sink the chest between the blades.\nPush the floor away until the upper back rounds. Only the scapulae move.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Bending the elbows into a press-up.\nPiking the hips."
  },
  {
    "id": "1nWxkfUXHMu1oz76kYZvJEv-9C44PPiPu",
    "cabin": "Back",
    "phase": "Base",
    "title": "Serratus Punch",
    "metrics": "Sets: 3 | Reps: 10–12 | Hold: 1 sec | Rest: 45 sec",
    "leadRule": "3-second punch. 3-second return. Shoulder stays off the ear.",
    "doThis": "Lie or stand. Arm reaches long. Punch the fist farther so the scapula wraps the ribcage.\nReturn without dumping the blade into the floor.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Shrugging the trap to fake length.\nBending the elbow mid-punch."
  },
  {
    "id": "1YK8KaDhHk-6UKvBstMaDOYlAoKlvZ3AW",
    "cabin": "Back",
    "phase": "Base",
    "title": "Band Pull-Apart",
    "metrics": "Sets: 3 | Reps: 10–12 | Hold: 1 sec | Rest: 45 sec",
    "leadRule": "3-second open. Pinkies lead. Ribs down.",
    "doThis": "Band at chest height. Arms long. Pull the hands apart until the blades pinch.\nHold. Return 3 seconds without the shoulders rolling forward.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Bending the elbows into a face pull.\nFlaring the ribs."
  },
  {
    "id": "1CtuqGRhJbEYRUYKFFE1AGM4KxBSNi2lr",
    "cabin": "Back",
    "phase": "Base",
    "title": "Seated Scapular Retraction W-Raise",
    "metrics": "Sets: 3 | Reps: 10–12 | Hold: 2 sec | Rest: 45 sec",
    "leadRule": "3-second squeeze into the W. Elbows stay below the shoulders.",
    "doThis": "Sit tall. Hands start by the ribs. Draw the elbows back into a W.\nPinch mid-trap and rear delt. Lower 3 seconds.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Shrugging the elbows toward the ears.\nLeaning the torso back to cheat height."
  },
  {
    "id": "1R2yD8g49kOsVaQPA23TICEwT0qO20dsf",
    "cabin": "Back",
    "phase": "Base",
    "title": "Band Face Pull",
    "metrics": "Sets: 3 | Reps: 10–12 | Hold: 1 sec | Rest: 45 sec",
    "leadRule": "3-second return. Elbows high. Hands finish by the ears.",
    "doThis": "High anchor. Pull the band to the face. Elbows out and up.\nExternal-rotate at the end so the rear delt owns the last inch.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Turning it into a straight-arm pulldown.\nFlaring the ribs or yanking the neck forward."
  },
  {
    "id": "1tTu98eTVcMGNYmRlzhZyi1xo6gJt6_7u",
    "cabin": "Back",
    "phase": "Base",
    "title": "Band Face Pull 2",
    "metrics": "Sets: 3 | Reps: 10–12 | Hold: 1 sec | Rest: 45 sec",
    "leadRule": "3-second return. Path matches clip 2 — same high-elbow finish, quieter torso.",
    "doThis": "High or mid anchor as the clip shows. Pull to the face. Pause.\nHands stay outside the ears. Lower 3 seconds on the same line.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Dropping the elbows to the ribs.\nUsing a hip hinge to start the pull."
  },
  {
    "id": "1GKLnnvIsLb1mf_aP1rsfaoZdOE_H5CtJ",
    "cabin": "Back",
    "phase": "Base",
    "title": "Seated Cable External Rotation",
    "metrics": "Sets: 3 | Reps: 10–12 | Hold: 1 sec | Rest: 45 sec",
    "leadRule": "Left-Lead. 3-second return. Elbow pinned to the side.",
    "doThis": "Sit. Elbow at 90° against the ribs. Forearm rotates out against the cable.\nOnly the rotator cuff turns the arm. Then switch.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Letting the elbow drift off the ribcage.\nRotating the torso to fake range."
  },
  {
    "id": "1LNsbXz0jbvcSHzVNwEmAy_0z7g9jgvKu",
    "cabin": "Back",
    "phase": "Base",
    "title": "Lat Pulldown",
    "metrics": "Sets: 3 | Reps: 8–12 | Hold: 1 sec | Rest: 60 sec",
    "leadRule": "3-second lower. Bar to the upper chest. Elbows drive into the back pockets.",
    "doThis": "Sit tall. Slight lean. Pull the bar to the collarbone.\nSqueeze lats at the bottom. Let the bar rise 3 seconds to a full stretch.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Behind-the-neck pulldown.\nYanking with the arms before the lats set."
  },
  {
    "id": "19vA0TkEPac6ikUHkXjAUYK0JsBSrCadi",
    "cabin": "Back",
    "phase": "Base",
    "title": "Prone Pull-Up Floor Sequence",
    "metrics": "Sets: 3 | Reps: 8–10 each | Hold: 1 sec | Rest: 45 sec",
    "leadRule": "3-second lower on every floor pattern. Nose stays off the mat.",
    "doThis": "Prone. Run the clip order: prone pull-up — hands slide toward the hips as the chest lifts — then back-widow W — then long-arm back extension.\nSqueeze mid-back at the top of each pattern.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Craning the neck.\nUsing a lumbar snap instead of the lats and mid-back."
  },
  {
    "id": "1adpkIDaSR_nw1BYczyl1MfjtJOEn8h_R",
    "cabin": "Back",
    "phase": "Base",
    "title": "Chest-Supported Dumbbell Row",
    "metrics": "Sets: 3 | Reps: 8–12 | Hold: 1 sec | Rest: 60 sec",
    "leadRule": "Left-Lead if alternating. 3-second lower. Chest stays on the pad.",
    "doThis": "Incline bench. Bells hang. Row to the hip.\nElbows close. Squeeze the lat. Lower to a long arm.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Lifting the chest off the pad.\nTurning it into a shrug."
  },
  {
    "id": "1yvw94eatfeILY3rz1kw6hRLCMsTUkv7R",
    "cabin": "Back",
    "phase": "Base",
    "title": "Standing Band Bent-Over Row",
    "metrics": "Sets: 3 | Reps: 8–12 | Hold: 1 sec | Rest: 60 sec",
    "leadRule": "3-second lower. Hinge stays fixed. Neck long.",
    "doThis": "Band under the feet. Hinge to parallel. Row the hands to the hips.\nSqueeze. Lower 3 seconds without standing up.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Using the lumbar to yank the band.\nShrugging the traps into the ears."
  },
  {
    "id": "1sJssUL454mcjfmWLFeWhyRet6M30WsB5",
    "cabin": "Back",
    "phase": "Base",
    "title": "Door-Anchor Band Row 1",
    "metrics": "Sets: 3 | Reps: 8–12 | Hold: 1 sec | Rest: 60 sec",
    "leadRule": "3-second return. Tall torso. Elbows brush the ribs.",
    "doThis": "Mid door-anchor. Stand square. Row the handles to the waist.\nPinch mid-back. Let the arms reach long on the way out.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Leaning back to cheat the row.\nFlaring the elbows into a face pull."
  },
  {
    "id": "1zv4wAwmktgDfSNl4R5DasZdqnfbLO1n4",
    "cabin": "Back",
    "phase": "Base",
    "title": "Door-Anchor Band Row 2",
    "metrics": "Sets: 3 | Reps: 8–12 | Hold: 1 sec | Rest: 60 sec",
    "leadRule": "3-second return. Path matches clip 2 — sit the hips a fraction and keep the line to the waist.",
    "doThis": "Same door-anchor. Row on the line the clip shows.\nPause at the hip. Reach long. Do not copy clip 1’s stance if clip 2 is staggered.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Turning it into a standing curl.\nLetting the shoulders roll forward at the stretch."
  },
  {
    "id": "1R8wEvnmGqi_11nY-FJlXT6KlpeOCsaxQ",
    "cabin": "Back",
    "phase": "Base",
    "title": "Band Back Trio (Row Pull-Apart Seated Row)",
    "metrics": "Sets: 3 | Reps: 8–10 each | Hold: 1 sec | Rest: 45 sec",
    "leadRule": "3-second lower on every move. Finish one pattern before the next.",
    "doThis": "Run clip order: standing bent-over band row — band pull-apart — seated or half-kneeling band row.\nTorso still on each. Squeeze at the end of the pull.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Rushing the switch.\nStanding up out of the hinge on the row."
  },
  {
    "id": "1VNiatN5jxGxXQozg6gcRT_7dpPUNJa_4",
    "cabin": "Back",
    "phase": "Base",
    "title": "Band Back Quartet (Pulldown Fly Row)",
    "metrics": "Sets: 3 | Reps: 8–10 each | Hold: 1 sec | Rest: 45 sec",
    "leadRule": "3-second lower on every pattern. Kneeling stays tall until the bent-over row.",
    "doThis": "Run clip order: kneeling band pulldown — kneeling reverse fly — kneeling-to-lunge seated row — standing bent-over band row.\nLats on the pulldown. Rear delt on the fly. Mid-back on the rows.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Turning the fly into a pulldown.\nYanking the band with the arms only."
  },
  {
    "id": "1W_UjrjZ6QWUCxRUeZr6LdSOfwGTNLeIy",
    "cabin": "Back",
    "phase": "Base",
    "title": "Band Door Back Quartet (Pulldown FacePull Row)",
    "metrics": "Sets: 3 | Reps: 8–10 each | Hold: 1 sec | Rest: 45 sec",
    "leadRule": "3-second return on every door-anchor pattern. Finish one before the next.",
    "doThis": "High door-anchor. Run clip order: kneeling lat pulldown — standing face pull — seated or squat-stance row.\nElbows high on the face pull. Elbows in on the row.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Mixing the elbow paths.\nLetting the door-anchor slip mid-set."
  },
  {
    "id": "1ZDjG0l254zNCe9JqirHUwB9WcWr9D05v",
    "cabin": "Back",
    "phase": "Base",
    "title": "Prone T Raise",
    "metrics": "Sets: 3 | Reps: 10–12 | Hold: 2 sec | Rest: 45 sec",
    "leadRule": "3-second lower. Pinkies up. Nose off the floor.",
    "doThis": "Prone. Arms out to a T. Lift the hands and the chest a fraction.\nSqueeze mid-trap. Lower 3 seconds.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Bending the elbows into a W.\nUsing the lumbar to hoist the chest."
  },
  {
    "id": "1ixh9oxrsAjaVNXohOlLvEWzBFOgzogxJ",
    "cabin": "Back",
    "phase": "Base",
    "title": "Prone Y-Raise 1",
    "metrics": "Sets: 3 | Reps: 10–12 | Hold: 2 sec | Rest: 45 sec",
    "leadRule": "3-second lower. Thumbs up. Arms on the Y line.",
    "doThis": "Prone. Arms long on a Y. Lift the hands without shrugging.\nLower-trap owns the lift. Lower 3 seconds.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Turning the Y into a front raise.\nCraning the neck."
  },
  {
    "id": "1EaWTnXElf3wkXwGubz5s7CUmd84xUvhm",
    "cabin": "Back",
    "phase": "Base",
    "title": "Prone Y-Raise 2",
    "metrics": "Sets: 3 | Reps: 10–12 | Hold: 2 sec | Rest: 45 sec",
    "leadRule": "3-second lower. Same Y line as clip 2 — quieter hips than clip 1.",
    "doThis": "Prone. Y-raise on the line the second clip shows.\nHold the top. Lower 3 seconds. Do not copy clip 1’s tempo if clip 2 is slower.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Swinging the arms off the floor.\nPinching upper trap into the neck."
  },
  {
    "id": "1Wkz4OXxfzVQ3xNdZgv6ktFT43uLJwvae",
    "cabin": "Back",
    "phase": "Base",
    "title": "Prone Banded Y-Raise",
    "metrics": "Sets: 3 | Reps: 10–12 | Hold: 2 sec | Rest: 45 sec",
    "leadRule": "3-second lower. Light band tension the whole way.",
    "doThis": "Prone. Band in the hands. Raise on a Y against the band.\nShoulders down. Lower 3 seconds into the stretch of the band.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Snapping the band at the top.\nBending the elbows."
  },
  {
    "id": "1-0MLqJ2IMVfempbNam-Iiatcr5xOOGLr",
    "cabin": "Back",
    "phase": "Base",
    "title": "Prone Floor Pulldown Y-to-W",
    "metrics": "Sets: 3 | Reps: 8–10 each | Hold: 1 sec | Rest: 45 sec",
    "leadRule": "3-second pull. 3-second reach. Chest stays close to the floor.",
    "doThis": "Prone. Arms long in a Y. Pull the elbows to a W as if a pulldown.\nThen hands behind the head. Reach long again. Repeat the cycle.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Lifting the whole torso into a cobra.\nFlaring the elbows above the ears."
  },
  {
    "id": "1UCIqebKF0FmjrEos7Kf4PD9u-s3G8ofI",
    "cabin": "Back",
    "phase": "Base",
    "title": "Prone W-Raise and Reverse Plank",
    "metrics": "Sets: 3 | Reps: 8–10 each | Hold: 1 sec | Rest: 45 sec",
    "leadRule": "3-second lower on the raises. 3-second settle into the reverse plank.",
    "doThis": "Run clip order: prone W-raise — prone Superman lift — reverse plank, hips high, chest open.\nSqueeze mid-back on the floor work. Glutes on in the plank.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Dumping the hips in the reverse plank.\nCraning the neck on the W-raise."
  },
  {
    "id": "1R2segjgHQe6_FvTAgSt2bQ38X6VdEIHu",
    "cabin": "Back",
    "phase": "Base",
    "title": "Banded Good Morning",
    "metrics": "Sets: 3 | Reps: 10–12 | Hold: 1 sec | Rest: 45 sec",
    "leadRule": "3-second hinge. 3-second stand. Soft knees.",
    "doThis": "Band across the upper back or under the feet to the shoulders as the clip shows.\nHinge until the hamstrings take the load. Spine long. Stand 3 seconds.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Rounding the lumbar spine.\nBending the knees into a squat."
  },
  {
    "id": "1Ep8jJbQ_JXzZWddZsrtWLEs12i4I4AfD",
    "cabin": "Back",
    "phase": "Base",
    "title": "Jefferson Curls",
    "metrics": "Sets: 3 | Reps: 10–12 | Hold: 1 sec | Rest: 45 sec",
    "leadRule": "3-second segmental lower. 3-second stack back up. Soft knees.",
    "doThis": "Light load. Tuck the chin. Roll down one vertebra at a time.\nHang. Stack back up from the tailbone. This is a controlled spinal wave, not a stiff hinge.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Dropping the load through the lumbar spine.\nHolding the breath."
  },
  {
    "id": "1GJnqRl2auqOlUPDFpIZsbu7hDL6LrWsn",
    "cabin": "Back",
    "phase": "Base",
    "title": "Resistance Band Shrugs",
    "metrics": "Sets: 3 | Reps: 10–12 | Hold: 1 sec | Rest: 45 sec",
    "leadRule": "3-second lower. Slight forward hinge so the line matches the upper-trap fibres.",
    "doThis": "Stand on the band. Hands at the sides. Shrug up and a little back.\nSqueeze. Lower to a full stretch.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Rolling the shoulders in a circle.\nStanding bolt-upright and shrugging into the ears."
  },
  {
    "id": "1hMJSIntA0NXssfibPKP7T6Z-7TsHAy_m",
    "cabin": "Back",
    "phase": "Base",
    "title": "Upper Trap Shrugs Demo",
    "metrics": "Sets: 3 | Reps: 10–12 | Hold: 1 sec | Rest: 45 sec",
    "leadRule": "3-second lower. Path matches the demo clip — up and back, not forward.",
    "doThis": "Stand. Shrug on the line the demo shows.\nPause at the top. Lower 3 seconds. This is the only shrug pattern in this block.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Forward-rolling the shoulders.\nTurning it into an upright row."
  },
  {
    "id": "1rPQksWdy-muOVjF-jeS9CRhdiuWqLm1t",
    "cabin": "Back",
    "phase": "Base",
    "title": "Dead Hang into Cobra Stretch",
    "metrics": "Sets: 3 | Reps: 1 | Hold: 30 sec | Rest: 20 sec",
    "leadRule": "3-second settle in the hang. 3-second ease into the cobra.",
    "doThis": "Hang from the bar first. Soft posterior tilt. Breathe into the lats.\nThen floor cobra — hands under the shoulders, hips heavy, chest long.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Dumping the lumbar in either position.\nCraning the neck in the cobra."
  },
  {
    "id": "1AWd9IwZqDU2BUxR8KYDEE10GGGT2vEu8",
    "cabin": "Back",
    "phase": "Base",
    "title": "Doorway Lat Upper-Back Stretch",
    "metrics": "Sets: 3 | Reps: 1 | Hold: 30 sec | Rest: 20 sec",
    "leadRule": "Both sides together. 3-second sit-back into the frame.",
    "doThis": "Hands on the door edge at head height or as the clip shows.\nHips sit back. Arms long. Lats and mid-back open. Neck soft.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Turning it into a pec doorway stretch.\nHanging off a bent elbow."
  },
  {
    "id": "1ko1MKvmG7fLxsyEUfm1gSZd4WYzt5L8t",
    "cabin": "Back",
    "phase": "Base",
    "title": "Lower-Back Stretch",
    "metrics": "Sets: 3 | Reps: 1 | Hold: 30 sec | Rest: 20 sec",
    "leadRule": "3-second ease into the seated open position on the exhale.",
    "doThis": "Sit as the clip shows — one leg folded, the other long.\nTurn toward the folded side. Hands on the floor. Low back softens.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Yanking the spine into a twist.\nHolding the breath."
  },
  {
    "id": "1EE-pYGOQ5abzVUTiQjKT0Jv0Q-tSGdh3",
    "cabin": "Back",
    "phase": "Base",
    "title": "Scorpion Stretch and Seated Spinal Twist",
    "metrics": "Sets: 3 | Reps: 1 / side | Hold: 30 sec | Rest: 15 sec",
    "leadRule": "Left-Lead. 3-second sweep on the scorpion. 3-second sit into the twist.",
    "doThis": "Prone. Sweep the bent leg across toward the opposite hand. Chest stays down.\nThen sit. Twist over the folded leg. Finish left before right.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Ripping the lumbar to chase the foot.\nLifting the opposite shoulder off the floor on the scorpion."
  },
  {
    "id": "1pUVXSOE48OF9RGfUSfco9zTnInONPzU_",
    "cabin": "Back",
    "phase": "Base",
    "title": "Seated Forward Fold",
    "metrics": "Sets: 3 | Reps: 1 | Hold: 30 sec | Rest: 20 sec",
    "leadRule": "3-second hinge. Spine stays long. Neck soft.",
    "doThis": "Sit. Legs long. Hinge from the hips until the erectors lengthen.\nHands on the shins or feet. Do not collapse the chest.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Rounding the upper back to reach the feet.\nYanking the toes and dumping the neck."
  },
  {
    "id": "1t9WEEC6PMxX_39khnccK7Zlgh-JzOFDj",
    "cabin": "Back",
    "phase": "Base",
    "title": "Door-Post Rear Delt and Lat Sit-Back",
    "metrics": "Sets: 3 | Reps: 1 | Hold: 30 sec | Rest: 20 sec",
    "leadRule": "Both sides together. 3-second ease from the bent-elbow rear-delt position into the long-arm sit-back.",
    "doThis": "Hands on the post at chest height first. Elbows bent. Rear delt takes the load.\nThen arms long. Sit the hips back until the lats and mid-back open. Neck soft.\nUse a strict 3-Second Negative on every lowering / return phase.",
    "avoidThis": "Turning it into a pec doorway stretch.\nBending the elbows on the long-arm sit-back."
  }
]);
})();
