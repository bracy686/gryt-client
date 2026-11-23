import "../src/style.css";

import { GrytProvider } from "@gryt/ui";
import { createRoot } from "react-dom/client";

import { registrations } from "../src/packages/common/src/hooks/singletonHook";
import { DisplaySettings } from "../src/packages/settings/src/components/theme/displaySettings";

// Run the real settings body without starting network-dependent singleton hooks.
const settingsHost = registrations.find((entry) => entry.useBody.name === "useSettingsHook");
if (!settingsHost) throw new Error("Missing settings hook registration");

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(
  <GrytProvider>
    {settingsHost.render()}
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24, minHeight: "100vh" }}>
      <DisplaySettings />
    </main>
  </GrytProvider>,
);
