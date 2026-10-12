import "./styles/main.css";
import { App } from "./app.ts";
import { requireElement } from "./lib/browser.ts";
import { Screen } from "./terminal/screen.ts";

const screenArea = requireElement<HTMLElement>("screen");
const screen = new Screen(requireElement("output"), screenArea, requireElement("announcer"));

const app = new App(screen, {
  frame: requireElement("frame"),
  screenArea,
  suggestions: requireElement("suggestions"),
  skip: requireElement<HTMLButtonElement>("skip"),
  prompt: {
    form: requireElement<HTMLFormElement>("prompt"),
    text: requireElement<HTMLTextAreaElement>("command"),
    secret: requireElement<HTMLInputElement>("secret"),
    before: requireElement("cursor-before"),
    cursor: requireElement("cursor"),
    after: requireElement("cursor-after"),
  },
});

void app.start();
