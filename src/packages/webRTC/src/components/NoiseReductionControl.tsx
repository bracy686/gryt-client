import { Tooltip } from "@gryt/ui";
import { useId } from "react";

import { useSettings } from "@/settings";

import { CallControlButton } from "./CallControlButton";

interface NoiseReductionControlProps {
  iconSize?: number;
  side?: "top" | "right";
}

/** Both call bars use the same persisted setting as Settings → Audio. */
export function NoiseReductionControl({ iconSize = 16, side = "top" }: NoiseReductionControlProps) {
  const { rnnoiseEnabled, setRnnoiseEnabled } = useSettings();
  const maskId = `noise-reduction-${useId().replace(/:/g, "")}`;

  return (
    <Tooltip title={rnnoiseEnabled ? "Disable noise reduction" : "Enable noise reduction"} side={side}>
      <CallControlButton
        state={rnnoiseEnabled ? "idle" : "off"}
        data-call-control="noise-reduction"
        aria-label={rnnoiseEnabled ? "Disable noise reduction" : "Enable noise reduction"}
        aria-pressed={rnnoiseEnabled}
        onClick={() => setRnnoiseEnabled(!rnnoiseEnabled)}
      >
        {/* Solid shield with transparent cutouts, matching the surrounding filled icons. */}
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <mask id={maskId} x="0" y="0" width="24" height="24" maskUnits="userSpaceOnUse">
              <rect width="24" height="24" fill="white" />
              {rnnoiseEnabled ? (
                <path
                  d="M8.3 10v2.5m3.7-5.2v8m3.7-5.3v2.5"
                  fill="none"
                  stroke="black"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              ) : (
                <path d="m2 2 20 20" fill="none" stroke="black" strokeWidth={5} />
              )}
            </mask>
          </defs>
          <g mask={`url(#${maskId})`}>
            <path d="M12 2.1a1.5 1.5 0 0 1 .53.1l7.9 2.96c.63.24 1.04.83 1.04 1.5v4.42c0 4.95-3.16 8.65-8.77 11.32a1.6 1.6 0 0 1-1.4 0C5.7 19.73 2.53 16.03 2.53 11.08V6.66c0-.67.41-1.26 1.04-1.5l7.9-2.96a1.5 1.5 0 0 1 .53-.1Z" />
          </g>
          {!rnnoiseEnabled && (
            <path d="m3 3 18 18" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
          )}
        </svg>
      </CallControlButton>
    </Tooltip>
  );
}
