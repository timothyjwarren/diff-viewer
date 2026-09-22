import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./App.css";
import { App } from "./App";
import { FileViewPage } from "./components/FileViewPage";
import { parseFileViewParams } from "./lib/route";

const page = window.location.pathname === "/view-file"
  ? <FileViewPage {...parseFileViewParams(window.location.search)} />
  : <App />;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {page}
  </StrictMode>,
);
