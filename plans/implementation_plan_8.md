# UI Enhancements: Model Switching & Auto-scroll Popout

This plan addresses your two frontend requests regarding the model switcher and the "Response generating" button.

## Proposed Changes

### `src/app/page.js`

1. **Disable Model Switching During Generation:**
   - I will update the model selector button to be disabled when `isTyping` is true.
   - I will prevent the dropdown from opening if `isTyping` is true.
   - I will add visual styling or a tooltip so it's clear the button is disabled while a response is generating.

2. **Fix "Response Generating" Popout Visibility & Design:**
   - Instead of a hardcoded pixel threshold, I will calculate visibility dynamically using the viewport height. The button will only appear if the user scrolls up by more than `clientHeight * 0.5` (half the height of the chat area). This ensures it only pops up when the active response is actually scrolling out of view.
   - I will remove the extra textual `↓` arrow from the button label, so it only displays the SVG arrow icon, fixing the double-arrow appearance.
