/** Landing: entrada suave e topo sólido ao rolar. */
import { reveal } from "./ui.js";
reveal();
const onScroll = () => document.body.classList.toggle("scrolled", scrollY > 40);
addEventListener("scroll", onScroll, { passive: true }); onScroll();
