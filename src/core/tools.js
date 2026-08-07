/**
 * Which tools each view offers.
 *
 * 2D drafting and 3D modelling genuinely want different palettes. Trim, fillet
 * and dimension are plan-view operations — offering them while you are
 * orbiting implies they will work when they will not. Push/pull is the
 * converse: meaningless in a flat plan.
 *
 * Lives in core rather than the UI so the store can consult it when the view
 * changes, without the store having to know about icons.
 */

/** Grouped for display; groups are separated by a rule in the rail. */
export const PLAN_TOOL_GROUPS = [
  [['select', 'Select'], ['move', 'Move']],
  [
    ['line', 'Line'],
    ['rectangle', 'Rectangle'],
    ['polygon', 'Polygon'],
    ['circle', 'Circle'],
    ['arc', 'Arc'],
  ],
  [
    ['trim', 'Trim'],
    ['extend', 'Extend'],
    ['fillet', 'Fillet'],
    ['chamfer', 'Chamfer'],
  ],
  [['dimension', 'Dimension'], ['note', 'Note']],
  [['block', 'Block'], ['component', 'Component']],
]

export const MODEL_TOOL_GROUPS = [
  [['select', 'Select'], ['move', 'Move']],
  [['pushpull', 'Push / Pull']],
  [['line', 'Line'], ['rectangle', 'Rectangle']],
  [['note', 'Note']],
]

export function toolGroupsForView(view) {
  return view === 'plan' ? PLAN_TOOL_GROUPS : MODEL_TOOL_GROUPS
}

/** Every tool the given view offers. */
export function toolsForView(view) {
  return new Set(toolGroupsForView(view).flat().map(([id]) => id))
}

/**
 * The tool to be holding after a view change.
 *
 * Keeping the current one when the new view offers it means switching to check
 * something in 3D and coming back does not cost you your place. Falling back
 * to Select — rather than silently keeping an unavailable tool — means a click
 * never does nothing for a reason the rail does not show.
 */
export function toolAfterViewChange(currentTool, view) {
  return toolsForView(view).has(currentTool) ? currentTool : 'select'
}
