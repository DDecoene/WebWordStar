// This file is part of WebWordStar, an independent reimplementation of the
// WordStar keyboard interface. Copyright (C) 2026 Dennis Decoene.
// SPDX-License-Identifier: AGPL-3.0-only (see LICENSE)

/**
 * Feature-showcase demo document, served fresh (a private copy per visitor) by
 * `GET /demo`. Exercises every shipped WebWordStar feature: the diamond/^Q
 * movement (via prose inviting the reader to try it), ^K blocks, every ^P print
 * style, a ^OC-centered heading, .lm/.rm/.ls margin changes, .he/.fo header and
 * footer, and .pa/.cp page breaks.
 *
 * Centering math (see isCenteredLine in src/shared/export.ts): leading spaces =
 * left + floor((66 - len) / 2) with left=0, right=65.
 */

// "WELCOME TO WEBWORDSTAR" is 22 chars -> floor((66-22)/2) = 22 leading spaces.
const TITLE = " ".repeat(22) + "WELCOME TO WEBWORDSTAR";

export const DEMO_DOCUMENT = [
  ".he WebWordStar Demo - page #",
  ".fo Typed in the spirit of 1978, rendered for today",
  TITLE,
  "",
  "Good day, word processor operator. This document was typed",
  "for you to explore. WordStar never used a mouse, and neither",
  "do you: every command lives on the keyboard, in reach of home",
  "row.",
  "",
  "Move the cursor with the diamond: ^E up, ^X down, ^S left, ^D",
  "right. Try ^A and ^F to hop a word at a time. For longer",
  "jumps, press ^Q first: ^QS/^QD fly to the start or end of a",
  "line, ^QE/^QX to the top or bottom of the screen, and ^QR/^QC",
  "to the very top or bottom of the document.",
  "",
  "Blocks are marked with ^KB to begin and ^KK to end; then ^KC",
  "copies the block, ^KY deletes it, and ^KV moves it to wherever",
  "the cursor sits. ^KH toggles the highlight so you can see what",
  "you have marked.",
  "",
  "Print styles are typed inline and toggle on, then off, at the",
  "matching character. Behold: \x02bold\x02, \x13underline\x13,",
  "\x19italic\x19, \x04double-strike\x04, \x18strikeout\x18,",
  "\x14super\x14script, and \x16sub\x16script. Mix them freely,",
  "as in \x02\x19both bold and italic\x19\x02 at once.",
  "",
  ".lm 10",
  ".rm 55",
  // Margins govern where NEW typing wraps; existing text stays put. So this
  // paragraph is authored indented to columns 10-55 to show the layout.
  "         This paragraph lives inside narrower",
  "         margins, set with .lm 10 and .rm 55 --",
  "         a dot command changes the layout from",
  "         that line down, as on a WordStar ruler.",
  ".lm 1",
  ".rm 65",
  "",
  "Line spacing can change too. The next line is double-spaced:",
  ".ls 2",
  "Double-spaced for emphasis, then back to single below.",
  ".ls 1",
  "",
  ".cp 5",
  "A .cp 5 just above this line means: if fewer than five lines",
  "remain on the page, break to a new one first rather than",
  "orphaning this paragraph at the bottom.",
  "",
  "Turn the page with ^OC centered text and a forced break --",
  "the .pa command below sends the rest of this document to a",
  "fresh sheet, numbered by the header you saw at the top.",
  ".pa",
  "You have reached page two. Everything here paginates for real:",
  "on screen, in print, and in every exported format. Undo with",
  "^U, redo with ^QU, and reflow a paragraph with ^B after you",
  "edit its margins. Enjoy the machine.",
  "",
  "-- The WebWordStar Team",
].join("\n");
