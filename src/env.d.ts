declare module '*.css' {
  const css: string;
  export default css;
}

/** package.json version, injected at build time */
declare const __VERSION__: string;
/** dev server origin (only defined in the dev build) */
declare const __DEV_ORIGIN__: string;
/** TURN relays from turn.json ([] = none), injected at build time */
declare const __TURN_SERVERS__: RTCIceServer[];
