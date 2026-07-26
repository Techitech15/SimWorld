import { useEffect, useRef } from 'react';
import { GameRenderer } from '../render/renderer';

/**
 * Mounts the PixiJS renderer. React owns the DOM node; PixiJS owns everything
 * inside it and never triggers a React render (section 3).
 */
export function GameCanvas(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new GameRenderer();
    renderer.init(host).catch((error) => {
      console.error('renderer failed to start', error);
    });
    // GameRenderer.destroy tolerates being called while init is still pending,
    // which is what StrictMode's double mount does in development.
    return () => renderer.destroy();
  }, []);

  return <div className="game-canvas" ref={hostRef} />;
}
