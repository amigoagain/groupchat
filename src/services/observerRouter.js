/**
 * observerRouter.js — compatibility re-export
 * ─────────────────────────────────────────────
 * The Observer routing layer has been renamed to Weaver throughout the codebase.
 * This file re-exports from weaverRouter.js to avoid breaking any old imports.
 *
 * New code should import directly from ./weaverRouter.js
 */
export { routeMessage, formatRoutingNotice } from './weaverRouter.js'
