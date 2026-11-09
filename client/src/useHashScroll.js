import { useEffect } from "react";
// Pages rendered client-side miss the browser's initial jump to #anchor links,
// so scroll to the target once the page has mounted.
export default function useHashScroll() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
}
