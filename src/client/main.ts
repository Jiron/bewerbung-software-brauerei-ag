import "./styles/main.css";
import { App } from "./app.ts";
import { followVisualViewport, requireElement } from "./lib/browser.ts";
import { Screen } from "./terminal/screen.ts";

const frame = requireElement<HTMLElement>("frame");
const screenArea = requireElement<HTMLElement>("screen");
const screen = new Screen(requireElement("output"), screenArea, requireElement("announcer"));

const app = new App(screen, {
  frame,
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

// When the phone keyboard opens, keep the input line in view.
followVisualViewport(frame, () => screen.follow());

void app.start();
