import { Tooltip } from "@gryt/ui";

import { useSettings } from "@/settings";

import { CallControlButton } from "./CallControlButton";

interface NoiseReductionControlProps {
  iconSize?: number;
  side?: "top" | "right";
}

/** Both call bars use the same persisted setting as Settings → Audio. */
export function NoiseReductionControl({ iconSize = 16, side = "top" }: NoiseReductionControlProps) {
  const { rnnoiseEnabled, setRnnoiseEnabled } = useSettings();

  return (
    <Tooltip title={rnnoiseEnabled ? "Disable noise reduction" : "Enable noise reduction"} side={side}>
      <CallControlButton
        state={rnnoiseEnabled ? "idle" : "off"}
        data-call-control="noise-reduction"
        aria-label={rnnoiseEnabled ? "Disable noise reduction" : "Enable noise reduction"}
        aria-pressed={rnnoiseEnabled}
        onClick={() => setRnnoiseEnabled(!rnnoiseEnabled)}
      >
        {/* A shield filtering a voice waveform, drawn on the icons' rounded stroke grid. */}
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M12 2.5 20 5.5v5.6c0 4.7-3.2 8-8 10.4-4.8-2.4-8-5.7-8-10.4V5.5Z" />
          {rnnoiseEnabled ? (
            <path d="M8.5 10v3m3.5-5.5v8m3.5-5.5v3" />
          ) : (
            <path d="m3 3 18 18" />
          )}
        </svg>
      </CallControlButton>
    </Tooltip>
  );
}
