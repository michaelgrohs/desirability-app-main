declare module 'diagram-js/lib/core/Overlays' {
    export default interface Overlays {
      add(elementId: string, overlayConfig: {
        position: { top?: number; bottom?: number; left?: number; right?: number };
        html: string;
      }): void;
      remove(elementId: string): void;
    }
  }