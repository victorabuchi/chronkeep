// The scenes of the landing page film. Each one plays real screenshots of the app (see scripts/shots.js):
//   frames  [at ms, picture]    which screenshot is showing from that moment
//   beats   [at ms, target, press ms]   where the cursor rests (a target is a box in the screenshot; null hides it)
//   bursts  moments that throw confetti
// The scene is a pure function of its clock, so pausing, skipping to a tab and reduced motion are free.
window.CK_SCENES = [
  {
    id: 'plan', tab: 'Plan', title: 'Your whole week, in one place.', caption: 'Classes, deadlines and to-dos share one calendar. Switch views, open anything, change it in two taps.',
    url: 'chronkeep.app/app', dur: 11500, glow: '#3b5bdb',
    frames: [[0, 'week'], [1700, 'month'], [3900, 'week'], [5900, 'edit'], [7600, 'edit-reminders'], [10300, 'week']],
    beats: [[0, null], [500, 'monthBtn'], [1500, 'monthBtn', 300], [3000, 'weekBtn'], [3700, 'weekBtn', 300], [4900, 'roboticsChip'], [5700, 'roboticsChip', 300], [7300, 'remChips'], [9500, 'dlgCancel'], [10100, 'dlgCancel', 300], [10700, null]],
    bursts: [],
  },
  {
    id: 'type', tab: 'Type it', title: 'Say it like a sentence.', caption: 'Write “Machine Learning proposal due Friday 11pm” and ChronKeep reads the type, the day and the time, and adds the right reminders.',
    url: 'chronkeep.app/app', dur: 11000, glow: '#7c5cf0',
    frames: [[0, 'q0'], [2200, 'q1'], [2900, 'q2'], [3600, 'q3'], [4300, 'q4'], [7800, 'q-added']],
    beats: [[0, null], [600, 'qTitle'], [1400, 'qTitle', 250], [5600, 'qPrev'], [8600, null]],
    bursts: [7900],
  },
  {
    id: 'tick', tab: 'Tick off', title: 'Done feels good.', caption: 'Overdue things turn red and stay in front of you. Tick one off and it moves to History, with an Undo if you slipped.',
    url: 'chronkeep.app/app', dur: 8000, glow: '#16a36a',
    frames: [[0, 't0'], [2750, 't1'], [3300, 't2']],
    beats: [[0, null], [800, 'tickRow'], [2600, 'tickRow', 300], [6200, null]],
    bursts: [2800],
  },
  {
    id: 'remind', tab: 'Reminders', title: 'It keeps reminding you.', caption: 'Set a reminder once, or have ChronKeep repeat it every few minutes as the deadline gets close, until you tick it off.',
    url: 'chronkeep.app/app', dur: 10000, glow: '#f59e0b',
    frames: [[0, 'week'], [2000, 'bell'], [5600, 'edit-reminders']],
    beats: [[0, null], [700, 'bell'], [1700, 'bell', 300], [3600, 'bellPop'], [6600, 'nudges'], [9000, null]],
    bursts: [],
  },
  {
    id: 'history', tab: 'History', title: 'See what you finished.', caption: 'Every completed assignment and past event lands in History, with how often you hand things in on time.',
    url: 'chronkeep.app/app', dur: 8000, glow: '#0e8fb0',
    frames: [[0, 'week'], [2000, 'history']],
    beats: [[0, null], [600, 'railHistory'], [1500, 'railHistory', 300], [4200, 'histStats'], [7000, null]],
    bursts: [],
  },
  {
    id: 'customize', tab: 'Make it yours', title: 'Your colours, your courses, your rules.', caption: 'Pick the accent colour, name your courses, choose which reminders every new assignment gets.',
    url: 'chronkeep.app/app', dur: 8000, glow: '#d6457a',
    frames: [[0, 'week'], [2000, 'customize']],
    beats: [[0, null], [600, 'railSet'], [1500, 'railSet', 300], [7000, null]],
    bursts: [],
  },
];
