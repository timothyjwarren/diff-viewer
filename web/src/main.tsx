import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./App.css";
import { App } from "./App";
import { BrowserPage } from "./components/BrowserPage";
import { parseBrowseParams } from "./lib/route";

const page = window.location.pathname === "/view-file"
  ? <BrowserPage {...parseBrowseParams(window.location.search)} />
  : <App />;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {page}
  </StrictMode>,
);
