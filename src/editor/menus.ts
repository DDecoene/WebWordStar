/** Static command tables shown by the self-revealing menus (see render.ts). */
export type MenuKey = "quick" | "block" | "onscreen" | "print" | "help";

export interface Menu {
  title: string;
  entries: [string, string][];
}

export const MENUS: Record<MenuKey, Menu> = {
  quick: {
    title: "^Q QUICK",
    entries: [
      ["S", "start of line"],
      ["D", "end of line"],
      ["E", "top of screen"],
      ["X", "bottom of screen"],
      ["R", "start of document"],
      ["C", "end of document"],
      ["U", "redo"],
    ],
  },
  block: {
    title: "^K BLOCK & DOCUMENT",
    entries: [
      ["B", "begin block"],
      ["K", "end block"],
      ["C", "copy block"],
      ["V", "move block"],
      ["Y", "delete block"],
      ["H", "hide/show block"],
      ["N", "name document"],
    ],
  },
  onscreen: {
    title: "^O ONSCREEN FORMAT",
    entries: [
      ["L", "left margin"],
      ["R", "right margin"],
      ["C", "center line"],
      ["S", "line spacing"],
      ["J", "justify"],
      ["W", "word wrap"],
      ["T", "ruler"],
      ["D", "control display"],
      ["I", "set tab"],
      ["N", "clear tab"],
      ["X", "margin release"],
      ["G", "paragraph indent"],
    ],
  },
  print: {
    title: "^P PRINT CONTROLS",
    entries: [
      ["B", "bold"],
      ["S", "underline"],
      ["Y", "italic"],
      ["D", "double-strike"],
      ["X", "strikeout"],
      ["T", "superscript"],
      ["V", "subscript"],
      ["O", "non-break space"],
    ],
  },
  help: {
    title: "^J HELP",
    entries: [["H", "set help level"]],
  },
};
