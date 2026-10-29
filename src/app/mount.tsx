// Creates a running Coop instance from a set of adapters. Used by the
// extension, the real-game dev loader and the playground alike.
import { render } from 'preact';
import type { Adapters } from '../adapters/types';
import { App, type ComponentName } from '../ui/App';
import { startOverlay, type Overlay } from '../ui/overlay/overlay';
import css from '../ui/styles.css';
import { createController, type Controller } from './controller';

export interface CoopApp {
  controller: Controller;
  overlay: Overlay | null;
  destroy(): void;
}

export interface MountOptions {
  /** element the UI is rendered into (default: a new div on <body>) */
  parent?: HTMLElement;
  /** render only one component (dev isolation) */
  only?: ComponentName | null;
  /** draw the canvas overlay (minimap, arrows, ...) */
  overlay?: boolean;
}

export async function mountCoop(ad: Adapters, opts: MountOptions = {}): Promise<CoopApp> {
  const controller = createController(ad);
  await controller.init();

  const style = document.createElement('style');
  style.dataset.slcoop = '';
  style.textContent = css;
  document.head.appendChild(style);

  const host = opts.parent ?? document.body;
  const root = document.createElement('div');
  root.dataset.slcoop = '';
  host.appendChild(root);
  render(<App c={controller} prefs={ad.prefs} only={opts.only ?? null} />, root);

  const overlay = opts.overlay === false ? null : startOverlay(controller, ad.game, host);

  return {
    controller,
    overlay,
    destroy() {
      overlay?.destroy();
      render(null, root);
      root.remove();
      style.remove();
      controller.destroy();
      ad.game.destroy();
    },
  };
}
