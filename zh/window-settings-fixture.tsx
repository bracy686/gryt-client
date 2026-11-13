import "../src/style.css";

import { GrytProvider } from "@gryt/ui";
import { createRoot } from "react-dom/client";

import { registrations } from "../src/packages/common/src/hooks/singletonHook";
import { DisplaySettings } from "../src/packages/settings/src/components/theme/displaySettings";
import { BAR_BUTTON_STYLE, BAR_SOLO_CLASS } from "../src/packages/webRTC/src/components/CallControlButton";
import { NoiseReductionControl } from "../src/packages/webRTC/src/components/NoiseReductionControl";

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
      <div data-gryt="noise-controls-fixture" className="mt-4 flex items-center gap-2">
        <NoiseReductionControl size="medium" style={BAR_BUTTON_STYLE} idleClassName={BAR_SOLO_CLASS} iconSize={24} />
        <NoiseReductionControl iconSize={12} side="right" />
      </div>
    </main>
  </GrytProvider>,
);
