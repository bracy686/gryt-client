import "../src/style.css";

import { GrytProvider } from "@gryt/ui";
import { createRoot } from "react-dom/client";

import { DisplaySettings } from "../src/packages/settings/src/components/theme/displaySettings";

createRoot(document.getElementById("root")!).render(
  <GrytProvider>
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24, minHeight: "100vh" }}>
      <DisplaySettings />
    </main>
  </GrytProvider>,
);
