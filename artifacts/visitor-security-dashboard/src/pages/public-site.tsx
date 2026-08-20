import { useEffect, useRef, useState } from "react";
import { useRecordVisit } from "@workspace/api-client-react";

function getVisitorId() {
  const key = "sentinel-visitor-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const next = `visitor-${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
  window.localStorage.setItem(key, next);
  return next;
}

export function PublicSite() {
  const recordVisit = useRecordVisit();
  const recorded = useRef(false);
  const scareStarted = useRef(false);
  const scareRoot = useRef<HTMLElement>(null);
  const scream = useRef<HTMLAudioElement>(null);
  const screamTwo = useRef<HTMLAudioElement>(null);
  const title = "HULI KA GAGO TARANTADO";
  const [typedTitle, setTypedTitle] = useState("");
  const [scareActive, setScareActive] = useState(false);
  const [scareIndex, setScareIndex] = useState(0);
  const scareImages = [
    "/scares/scare-1.png",
    "/scares/scare-2.png",
    "/scares/scare-3.png",
    "/scares/scare-4.png",
  ];
  const [status, setStatus] = useState<"recording" | "recorded" | "quiet">(
    "recording",
  );
  const [visit, setVisit] = useState<{
    ipAddress?: string;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    latitude?: string | null;
    longitude?: string | null;
  } | null>(null);

  useEffect(() => {
    if (scareActive) return;

    let cursor = 0;
    let deleting = false;
    let pause = 0;
    const timer = window.setInterval(() => {
      if (pause > 0) {
        pause -= 1;
        return;
      }

      cursor += deleting ? -1 : 1;
      setTypedTitle(title.slice(0, cursor));
      if (!deleting && cursor >= title.length) {
        if (!scareStarted.current) {
          scareStarted.current = true;
          void activateScare();
        }
        deleting = true;
        pause = 9;
      } else if (deleting && cursor <= 0) {
        deleting = false;
        pause = 3;
      }
    }, 115);

    return () => window.clearInterval(timer);
  }, [scareActive]);

  useEffect(() => {
    if (!scareActive) return;
    const timer = window.setInterval(() => {
      setScareIndex((current) => (current + 1) % scareImages.length);
    }, 2200);
    const finishTimer = window.setTimeout(() => {
      window.clearInterval(timer);
      setScareActive(false);
      setScareIndex(0);
      setTypedTitle("");
      scareStarted.current = false;
      scream.current?.pause();
      scream.current?.load();
      screamTwo.current?.pause();
      screamTwo.current?.load();
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
    }, scareImages.length * 2200);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(finishTimer);
    };
  }, [scareActive, scareImages.length]);

  async function activateScare() {
    setScareActive(true);
    const audio = scream.current;
    if (audio) {
      audio.loop = true;
      audio.currentTime = 0;
      await audio.play().catch(() => undefined);
    }
    const secondAudio = screamTwo.current;
    if (secondAudio) {
      secondAudio.loop = true;
      secondAudio.currentTime = 0;
      await secondAudio.play().catch(() => undefined);
    }
    if (!document.fullscreenElement) {
      await scareRoot.current?.requestFullscreen().catch(() => undefined);
    }
  }

  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;

    recordVisit.mutate(
      {
        data: {
          visitorId: getVisitorId(),
          path: window.location.pathname,
          referrer: document.referrer || null,
          userAgent: navigator.userAgent || null,
          screenSize: `${window.innerWidth}×${window.innerHeight}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
          language: navigator.language || null,
        },
      },
      {
        onSuccess: (response) => {
          setVisit(response);
          setStatus("recorded");
        },
        onError: () => setStatus("quiet"),
      },
    );
  }, [recordVisit]);

  return (
    <main ref={scareRoot} className={`hello-page${scareActive ? " is-scaring" : ""}`}>
      <audio ref={scream} src="/scares/scream.mp3" preload="auto" loop />
      <audio ref={screamTwo} src="/scares/scream-2.mp3" preload="auto" loop />
      {scareActive && (
        <div className="scare-screen" aria-label="Full screen scare mode">
          <img src={scareImages[scareIndex]} alt="" />
          <strong className="scare-foreground-text">{title}</strong>
        </div>
      )}
      <div className="hello-orb hello-orb-left" aria-hidden="true" />
      <div className="hello-orb hello-orb-right" aria-hidden="true" />

      <section className="hello-card" aria-live="polite">
        <h1>
          {typedTitle}
          <span className="hello-cursor" aria-hidden="true" />
        </h1>
        {status === "recording" && <p>Checking your visit…</p>}
        {status === "quiet" && <p>Welcome. Your visit could not be recorded.</p>}
        {status === "recorded" && (
          <div className="hello-details">
            <p className="hello-welcome">Welcome. Ingat-ingat ka.</p>
            <div className="hello-location">
              <span className="hello-label">Location</span>
              <strong>
                {[visit?.city, visit?.region, visit?.country]
                  .filter(Boolean)
                  .join(", ") || "Network-level estimate"}
              </strong>
            </div>
            <div className="hello-location">
              <span className="hello-label">Coordinates</span>
              <strong className="hello-value">
                {visit?.latitude && visit?.longitude
                  ? `${visit.latitude}, ${visit.longitude}`
                  : "Unavailable"}
              </strong>
            </div>
            <div className="hello-location">
              <span className="hello-label">Your observed IP</span>
              <strong className="hello-value">
                {visit?.ipAddress || "Unavailable"}
              </strong>
            </div>
            <small className="hello-note">
              UMAYOS AYOS KANA DI MO KILALA BINABANGGA MO!!!!.
            </small>
          </div>
        )}
      </section>
    </main>
  );
}
