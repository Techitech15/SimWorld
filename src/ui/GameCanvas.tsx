import { useEffect, useRef, useState } from 'react';
import { GameRenderer } from '../render/renderer';

/**
 * Mounts the PixiJS renderer. React owns the DOM node; PixiJS owns everything
 * inside it and never triggers a React render (section 3).
 */
export function GameCanvas(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new GameRenderer();
    renderer.init(host).catch((cause: unknown) => {
      // A blank map with a working UI is the worst possible failure mode: it
      // looks like the game is broken with no way to tell why. Say what broke.
      console.error('renderer failed to start', cause);
      setError(cause instanceof Error ? cause.message : String(cause));
    });
    // GameRenderer.destroy tolerates being called while init is still pending,
    // which is what StrictMode's double mount does in development.
    return () => renderer.destroy();
  }, []);

  return (
    <div className="game-canvas" ref={hostRef}>
      {error ? (
        <div className="game-canvas__error" role="alert">
          <strong>The map could not be drawn.</strong>
          <p>{error}</p>
          <p className="muted small">
            This usually means WebGL is unavailable in this browser or embedding context. The
            simulation itself is still running — try opening the page directly instead of in a
            frame.
          </p>
        </div>
      ) : null}
    </div>
  );
}
