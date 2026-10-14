# Accessibility

earshelf is meant to work for people who use a screen reader, a keyboard only, large text, high contrast, reduced motion, or a switch. This lists what is built in, how it is checked, and what you should still try by hand.

## Built in
- Every control has a name a screen reader can say. Icons never stand alone where the meaning is unclear.
- Everything works from the keyboard. The player uses Space (play and pause), J and L (back and forward), arrow keys (paragraphs), [ and ] (speed). Dialogs trap focus, close with Escape and give focus back.
- A "Skip to content" link is the first thing a keyboard user reaches. Moving between screens moves focus to the new screen.
- Strong visible focus outline, minimum 44 pixel touch targets, body text at least 16 pixels, sentence-case labels.
- Light, dark and match-my-device themes. Animations switch off when the device asks for reduced motion.
- The current sentence is highlighted and the reader follows playback, and can be turned off by scrolling.
- Errors say what happened and how to recover. Status changes (syncing, offline, errors) are announced as live regions.
- The Accessibility reading mode uses longer pauses and reads captions. Equations can be read in words.
- Color is never the only signal (the grade buttons in Review also carry words and times).

## How it is checked
- `apps/earshelf/e2e/accessibility.spec.ts` runs the axe engine against the main screens on every test run (WCAG 2.1 A and AA rules) and checks the skip link. Automatic tools find roughly a third to a half of real problems.

## Please check by hand before launch (about 30 minutes)
1. **Keyboard only.** Unplug the mouse. Import a document, open it, play it, add a note, open the player, change speed, and delete a note. Nothing should be unreachable, and you should always see where focus is.
2. **Screen reader.** Windows: turn on Narrator (Windows key + Ctrl + Enter). iPhone: VoiceOver. Android: TalkBack. Walk through Home, the reader and the player. Listen for unnamed buttons and for state ("playing", "bookmarked").
3. **Zoom to 200 percent** in the browser and on a phone with large text. Nothing should be cut off or overlap.
4. **Dark theme and high contrast.** Read the reader screen and the review screen.
5. **Reduced motion.** Turn it on in your device settings. Nothing should slide or fade.

Report anything you find to the person maintaining the app with the screen, what you did, and what you expected.
