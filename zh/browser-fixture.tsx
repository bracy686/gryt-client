import "../src/style.css";

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { TermsPrompt } from "../src/components/termsPrompt";
import { termsGate } from "../src/lib/termsGate";
import { ChatSealedVideo } from "../src/packages/socket/src/components/ChatMediaPlayer";

export function Fixture() {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { termsGate.postAfterAgreeing(() => undefined); }, []);
  return <>
    <TermsPrompt />
    <div style={{ width: 400, height: 240 }}>
      <ChatSealedVideo
        video={{ src, phase: "idle", start: () => setSrc("data:video/mp4;base64,AAAA"), file: async () => new Blob() }}
        width={400} height={240} volume={100} onVolumeChange={() => undefined}
      />
    </div>
  </>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
