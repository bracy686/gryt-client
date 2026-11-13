import "../src/style.css";

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { TermsPrompt } from "../src/components/termsPrompt";
import { termsGate } from "../src/lib/termsGate";
import { ChatSealedVideo } from "../src/packages/socket/src/components/ChatMediaPlayer";
import { ImageLightbox } from "../src/packages/socket/src/components/ImageLightbox";

export function Fixture() {
  const [src, setSrc] = useState<string | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  useEffect(() => { termsGate.postAfterAgreeing(() => undefined); }, []);
  return <>
    <TermsPrompt />
    <button type="button" onClick={() => setImageOpen(true)}>测试图片浏览</button>
    {imageOpen && <ImageLightbox
      src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22120%22%3E%3Crect width=%22200%22 height=%22120%22 fill=%22coral%22/%3E%3C/svg%3E"
      alt="图片浏览测试" onClose={() => setImageOpen(false)}
    />}
    <div style={{ width: 400, height: 240 }}>
      <ChatSealedVideo
        video={{ src, phase: "idle", start: () => setSrc("data:video/mp4;base64,AAAA"), file: async () => new Blob() }}
        width={400} height={240} volume={100} onVolumeChange={() => undefined}
      />
    </div>
  </>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<Fixture />);
