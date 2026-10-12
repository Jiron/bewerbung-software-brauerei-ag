import "./styles/main.css";

// Shows the requested path as the file the C64 could not find.
const name = decodeURIComponent(window.location.pathname.replace(/^\/+/, ""))
  .toUpperCase()
  .slice(0, 40);
const loadLine = document.getElementById("load-line");
const searchLine = document.getElementById("search-line");
if (name && loadLine && searchLine) {
  loadLine.textContent = `LOAD "${name}",8,1`;
  searchLine.textContent = `SEARCHING FOR ${name}`;
}
