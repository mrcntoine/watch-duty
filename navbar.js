/* ═══════════════════════════════════════════════
   WATCH DUTY NAVBAR
   Exclusive-mode architecture. Mobile and desktop
   CANNOT run simultaneously. Mode arbitration is
   driven by matchMedia("(max-width: 991px)"), the
   same breakpoint as Webflow's data-collapse="medium".
   ═══════════════════════════════════════════════ */

/* ───────────────────────────────────────────────
   SHARED: viewport detection + mode arbitration
   ─────────────────────────────────────────────── */
(() => {
  "use strict";
  if (window.__wdNavShared) {
    window.__wdNavShared.destroyAll?.();
  }

  const mobileQuery = window.matchMedia("(max-width: 991px)");

  const shared = {
    mobileQuery,
    isMobile: () => mobileQuery.matches,
    isDesktop: () => !mobileQuery.matches,
    desktopInit: null,
    desktopDestroy: null,
    mobileInit: null,
    mobileDestroy: null,
    activeMode: null,

    activate() {
      const target = this.isMobile() ? "mobile" : "desktop";
      if (this.activeMode === target) return;

      if (this.activeMode === "desktop") this.desktopDestroy?.();
      if (this.activeMode === "mobile") this.mobileDestroy?.();
      this.activeMode = null;

      if (target === "mobile" && this.mobileInit) {
        this.mobileInit();
        this.activeMode = "mobile";
      } else if (target === "desktop" && this.desktopInit) {
        this.desktopInit();
        this.activeMode = "desktop";
      }
    },

    destroyAll() {
      if (this.activeMode === "desktop") this.desktopDestroy?.();
      if (this.activeMode === "mobile") this.mobileDestroy?.();
      this.activeMode = null;
    },
  };

  mobileQuery.addEventListener?.("change", () => shared.activate());

  window.__wdNavShared = shared;

  // Activate after mode IIFEs have registered
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => shared.activate(), { once: true });
  } else {
    queueMicrotask(() => shared.activate());
  }
})();


/* ═══════════════════════════════════════════════
   DESKTOP NAV (≥992px)
   ═══════════════════════════════════════════════ */
(() => {
  "use strict";
  const SHARED = window.__wdNavShared;

  const CONFIG = {
    scrollThreshold: 48,
    maxWidth: "84rem",
    ease: "cubic-bezier(0.86, 0, 0.07, 1)",
    openMs: 850,
    closeMs: 550,
    switchMs: 450,
    overlayOpacity: 0.72,
    overlayBlurPx: 14,
    navbarBlur: { top: "0px", scrolled: "12px", open: "16px" },
    closeDelayMs: 120,
    appToggleBg: "var(--_primitives---colors--accent-primary)",
    appToggleText: "#1a1a1a",
    toggleRadiusPx: 12,
    closeFallbackBuffer: 150,
    colors: {
      top: {
        navbarBg: "rgba(255, 255, 255, 0.95)",
        textColor: "#1a1a1a",
        elementBg: "rgba(0, 0, 0, 0.05)",
      },
      scrolled: {
        navbarBg: "rgba(0, 0, 0, 0.92)",
        textColor: "#ffffff",
        elementBg: "rgba(255, 255, 255, 0.1)",
      },
    },
  };

  const BASE = {
    openMs: CONFIG.openMs,
    closeMs: CONFIG.closeMs,
    switchMs: CONFIG.switchMs,
    overlayBlurPx: CONFIG.overlayBlurPx,
    navbarBlur: { ...CONFIG.navbarBlur },
  };

  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  function applyMotion() {
    if (motionQuery?.matches) {
      CONFIG.openMs = CONFIG.closeMs = CONFIG.switchMs = 0;
      CONFIG.overlayBlurPx = 0;
      CONFIG.navbarBlur = { top: "0px", scrolled: "0px", open: "0px" };
    } else {
      CONFIG.openMs = BASE.openMs;
      CONFIG.closeMs = BASE.closeMs;
      CONFIG.switchMs = BASE.switchMs;
      CONFIG.overlayBlurPx = BASE.overlayBlurPx;
      CONFIG.navbarBlur = { ...BASE.navbarBlur };
    }
  }
  applyMotion();

  let navbarContainer, dropdownPortal, pageOverlay, measureContainer;
  let menuDropdowns = [];
  let allTextElements = [];
  let allToggles = [];
  let allDropdownLists = [];
  let isScrolled = false;
  let isOpen = false;
  let currentDropdown = null;
  let currentList = null;
  let closeTimer = null;
  let switchTimeout = null;
  let closeFallbackTimeout = null;
  let smoothScrollInstance = null;
  let smoothScrollUnsub = null;
  let originalPaddingBottom = null;
  let originalMarginBottom = null;
  let originalNavbarHeight = null;
  let boundListeners = [];
  let styleElement = null;
  let dropdownListMap = new Map();
  let dropdownHeightCache = new WeakMap();
  let morphCache = new WeakMap();
  let lastScrollY = 0;
  let scrollTicking = false;

  const MORPH_SELECTORS = [
    ".dropdown-grid-left",
    ".dropdown-grid-right",
    ".dropdown-grid-app",
    ".dropdown-content-wrapper",
  ];

  function addL(el, event, handler, options) {
    if (!el) return;
    el.addEventListener(event, handler, options);
    boundListeners.push({ el, event, handler, options });
  }

  function getListFor(dd) { return dropdownListMap.get(dd); }

  function getMorphable(list) {
    let cached = morphCache.get(list);
    if (cached) return cached;
    cached = {};
    for (const sel of MORPH_SELECTORS) {
      const el = list.querySelector(sel);
      if (el) cached[sel] = el;
    }
    morphCache.set(list, cached);
    return cached;
  }

  function setExpandedSpace(px, ms) {
    if (!navbarContainer) return;
    const dur = typeof ms === "number" ? ms : CONFIG.closeMs;
    const ease = CONFIG.ease;
    navbarContainer.style.transition =
      `background-color ${dur}ms ${ease}, ` +
      `backdrop-filter ${dur}ms ${ease}, ` +
      `-webkit-backdrop-filter ${dur}ms ${ease}, ` +
      `padding-bottom ${dur}ms ${ease}, ` +
      `margin-bottom ${dur}ms ${ease}`;
    if (px > 0) {
      navbarContainer.style.paddingBottom = `calc(${originalPaddingBottom} + ${px}px)`;
      navbarContainer.style.marginBottom = `calc(${originalMarginBottom} - ${px}px)`;
    } else {
      navbarContainer.style.paddingBottom = originalPaddingBottom;
      navbarContainer.style.marginBottom = originalMarginBottom;
    }
  }

  function getLenisLike() {
    if (window.lenis?.on) return window.lenis;
    const loco = window.locomotiveScroll || window.LocomotiveScrollInstance || window.locoScroll;
    if (loco) {
      if (loco.lenis?.on) return loco.lenis;
      if (loco._lenis?.on) return loco._lenis;
      if (loco.scroll?.on) return loco.scroll;
    }
    return null;
  }

  function getScrollTop() {
    const l = smoothScrollInstance || getLenisLike();
    return (l?.scroll ?? window.scrollY ?? window.pageYOffset ?? 0);
  }

  function getTheme() {
    return isOpen || isScrolled ? CONFIG.colors.scrolled : CONFIG.colors.top;
  }

  function applyTheme() {
    if (!navbarContainer) return;
    const theme = getTheme();
    const blur = isOpen ? CONFIG.navbarBlur.open : isScrolled ? CONFIG.navbarBlur.scrolled : CONFIG.navbarBlur.top;
    const cs = navbarContainer.style;
    cs.maxWidth = CONFIG.maxWidth;
    cs.backgroundColor = theme.navbarBg;
    cs.backdropFilter = `blur(${blur})`;
    cs.webkitBackdropFilter = `blur(${blur})`;

    for (const el of allTextElements) el.style.color = theme.textColor;

    for (const dd of menuDropdowns) {
      const t = dd.querySelector(".navbar_dropdwn-toggle");
      if (!t) continue;
      if (t.classList.contains("is-app")) {
        t.style.backgroundColor = CONFIG.appToggleBg;
        t.style.color = CONFIG.appToggleText;
        continue;
      }
      t.style.backgroundColor = isOpen && dd === currentDropdown ? theme.elementBg : "transparent";
    }
  }

  function applyTransitions(ms) {
    if (!navbarContainer) return;
    const dur = `${ms}ms`;
    const ease = CONFIG.ease;
    navbarContainer.style.transition =
      `background-color ${dur} ${ease}, ` +
      `backdrop-filter ${dur} ${ease}, ` +
      `-webkit-backdrop-filter ${dur} ${ease}, ` +
      `padding-bottom ${dur} ${ease}, ` +
      `margin-bottom ${dur} ${ease}`;
    for (const el of allTextElements) el.style.transition = `color ${dur} ${ease}`;
    for (const t of allToggles) t.style.transition = `color ${dur} ${ease}, background-color ${dur} ${ease}`;
    if (pageOverlay) {
      pageOverlay.style.transition =
        `opacity ${dur} ${ease}, backdrop-filter ${dur} ${ease}, -webkit-backdrop-filter ${dur} ${ease}`;
    }
  }

  function injectStyles() {
    const existing = document.getElementById("wd-navbar-desktop-styles");
    if (existing) existing.remove();

    const css = `
.navbar_container{
  position: relative !important;
  overflow: hidden !important;
  z-index: 901 !important;
  max-width: ${CONFIG.maxWidth} !important;
  will-change: background-color, backdrop-filter, padding-bottom, margin-bottom;
}
.navbar_logo-link, .navbar_menu, .navbar_button-wrapper{ position: relative; z-index: 10; }
.navbar-dropdown-portal{
  position: absolute; left: 0; right: 0; z-index: 1;
  pointer-events: none; overflow: hidden;
}
.navbar-dropdown-portal.is-open{ pointer-events: auto; }
.navbar-measure-container{
  position: absolute !important; left: -9999px !important; top: -9999px !important;
  width: 100% !important; visibility: hidden !important; pointer-events: none !important;
  z-index: -1 !important;
}
.navbar_menu{ position: relative !important; }
.navbar_menu-dropdown{ position: static !important; }
.navbar_dropdown-list{
  display: block !important; position: absolute !important;
  left: 0 !important; right: 0 !important; top: 0 !important;
  width: 100% !important; box-sizing: border-box !important;
  z-index: 2; background: transparent !important; border-radius: 0 !important;
  overflow: hidden; opacity: 0; visibility: hidden; pointer-events: none;
  will-change: opacity;
}
.nav-page-overlay{
  position: fixed; inset: 0; z-index: 900; pointer-events: none;
  background: rgba(15, 15, 15, ${CONFIG.overlayOpacity});
  opacity: 0;
  backdrop-filter: blur(0px); -webkit-backdrop-filter: blur(0px);
  will-change: opacity, backdrop-filter;
}
.nav-page-overlay.is-visible{
  opacity: 1; pointer-events: auto;
  backdrop-filter: blur(${CONFIG.overlayBlurPx}px);
  -webkit-backdrop-filter: blur(${CONFIG.overlayBlurPx}px);
}
.navbar_dropdwn-toggle{
  border-radius: ${CONFIG.toggleRadiusPx}px !important;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.navbar_dropdwn-toggle.is-app{
  background-color: ${CONFIG.appToggleBg} !important;
  color: ${CONFIG.appToggleText} !important;
}
.dropdown-grid-right, .dropdown-grid-app, .dropdown-left-content-icon-wrapper{
  background-color: #202020 !important;
}
.navbar_dropdown-list, .navbar_dropdown-list *{ color: #ffffff !important; }
    `.trim();

    styleElement = document.createElement("style");
    styleElement.id = "wd-navbar-desktop-styles";
    styleElement.textContent = css;
    document.head.appendChild(styleElement);
  }

  function createOverlay() {
    pageOverlay = document.querySelector(".nav-page-overlay");
    if (!pageOverlay) {
      pageOverlay = document.createElement("div");
      pageOverlay.className = "nav-page-overlay";
      document.body.appendChild(pageOverlay);
    }
    addL(pageOverlay, "click", () => { if (isOpen) closeMenu(); });
  }

  function createPortal() {
    dropdownPortal = navbarContainer.querySelector(".navbar-dropdown-portal");
    if (!dropdownPortal) {
      dropdownPortal = document.createElement("div");
      dropdownPortal.className = "navbar-dropdown-portal";
      navbarContainer.appendChild(dropdownPortal);
    }
    dropdownPortal.style.top = `${originalNavbarHeight}px`;
    for (const dd of menuDropdowns) {
      const list = dd.querySelector(".navbar_dropdown-list");
      if (list) {
        dropdownListMap.set(dd, list);
        dropdownPortal.appendChild(list);
      }
    }
  }

  function createMeasureContainer() {
    measureContainer = document.createElement("div");
    measureContainer.className = "navbar-measure-container";
    navbarContainer.appendChild(measureContainer);
  }

  function prepareDropdowns() {
    for (const dd of menuDropdowns) {
      const ch = dd.querySelector(".dropdown-chevron");
      if (ch) ch.style.transition = `transform ${CONFIG.openMs}ms ${CONFIG.ease}`;
    }
  }

  function disableWebflowBehavior() {
    for (const dd of menuDropdowns) {
      dd.removeAttribute("data-hover");
      dd.removeAttribute("data-delay");
    }
  }

  function enhanceToggleA11y() {
    for (const t of allToggles) {
      if (!t.hasAttribute("aria-haspopup")) t.setAttribute("aria-haspopup", "true");
      if (!t.hasAttribute("aria-expanded")) t.setAttribute("aria-expanded", "false");
      if (t.tagName !== "BUTTON" && !t.hasAttribute("role")) {
        t.setAttribute("role", "button");
        if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "0");
      }
    }
  }

  function bindEvents() {
    addL(navbarContainer, "pointerleave", (e) => {
      if (e.pointerType === "touch") return;
      const into = e.relatedTarget;
      if (!into || !navbarContainer.contains(into)) requestClose();
    });
    addL(navbarContainer, "pointerenter", (e) => {
      if (e.pointerType === "touch") return;
      if (isOpen) cancelClose();
    });
    addL(navbarContainer, "pointercancel", () => cancelClose());

    for (const dd of menuDropdowns) {
      const toggle = dd.querySelector(".navbar_dropdwn-toggle");
      const list = getListFor(dd);
      if (!toggle || !list) continue;

      addL(toggle, "pointerenter", (e) => {
        if (e.pointerType === "touch") return;
        cancelClose();
        if (!isOpen || currentDropdown !== dd) openOrSwitch(dd);
      });
      addL(toggle, "click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isOpen && currentDropdown === dd) closeMenu();
        else openOrSwitch(dd);
      });
      addL(toggle, "keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (isOpen && currentDropdown === dd) closeMenu();
          else openOrSwitch(dd);
        }
        if (e.key === "Escape" && isOpen) { closeMenu(); toggle.focus(); }
      });
    }

    addL(document, "keydown", (e) => {
      if (e.key === "Escape" && isOpen) closeMenu();
    });
    addL(document, "pointerdown", (e) => {
      if (!isOpen) return;
      if (!navbarContainer.contains(e.target) && !pageOverlay.contains(e.target)) closeMenu();
    }, { passive: true });
  }

  function bindScrollListener() {
    const update = (y) => {
      const scrolled = (y || 0) > CONFIG.scrollThreshold;
      if (scrolled !== isScrolled) {
        isScrolled = scrolled;
        if (!isOpen) { applyTransitions(CONFIG.closeMs); applyTheme(); }
      }
    };

    smoothScrollInstance = getLenisLike();
    if (smoothScrollInstance?.on) {
      const handler = (e) => update(typeof e?.scroll === "number" ? e.scroll : getScrollTop());
      smoothScrollInstance.on("scroll", handler);
      smoothScrollUnsub = () => smoothScrollInstance.off?.("scroll", handler);
      update(getScrollTop());
    } else {
      const onScroll = () => {
        lastScrollY = getScrollTop();
        if (!scrollTicking) {
          requestAnimationFrame(() => { update(lastScrollY); scrollTicking = false; });
          scrollTicking = true;
        }
      };
      addL(window, "scroll", onScroll, { passive: true });
      update(getScrollTop());
    }
  }

  function cancelClose() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  }
  function requestClose() {
    cancelClose();
    closeTimer = setTimeout(closeMenu, CONFIG.closeDelayMs);
  }
  function cancelPending() {
    if (switchTimeout) { clearTimeout(switchTimeout); switchTimeout = null; }
    if (closeFallbackTimeout) { clearTimeout(closeFallbackTimeout); closeFallbackTimeout = null; }
  }

  function measureList(list) {
    const cached = dropdownHeightCache.get(list);
    if (cached !== undefined) return cached;
    const clone = list.cloneNode(true);
    clone.style.cssText =
      "position:relative!important;top:auto!important;opacity:1!important;" +
      "visibility:visible!important;display:block!important;pointer-events:none!important;width:100%!important;";
    measureContainer.appendChild(clone);
    const h = clone.offsetHeight;
    measureContainer.removeChild(clone);
    dropdownHeightCache.set(list, h);
    return h;
  }

  function fullyResetListStyles(list) {
    if (!list) return;
    list.style.transition = "none";
    list.style.opacity = "0";
    list.style.visibility = "hidden";
    list.style.pointerEvents = "none";
    for (const sel of MORPH_SELECTORS) {
      const el = list.querySelector(sel);
      if (el) { el.style.transition = "none"; el.style.opacity = "1"; }
    }
  }

  function resetAllLists(except = null) {
    for (const list of allDropdownLists) {
      if (list && list !== except) fullyResetListStyles(list);
    }
    for (const dd of menuDropdowns) {
      if (dd !== currentDropdown) {
        const ch = dd.querySelector(".dropdown-chevron");
        if (ch) ch.style.transform = "rotate(0deg)";
        const t = dd.querySelector(".navbar_dropdwn-toggle");
        if (t) t.setAttribute("aria-expanded", "false");
      }
    }
  }

  function openOrSwitch(dd) {
    if (currentDropdown === dd) return;
    cancelPending();
    if (isOpen && currentDropdown) switchMenu(dd);
    else openMenu(dd);
  }

  function openMenu(dd) {
    const list = getListFor(dd);
    if (!list) return;
    cancelClose();
    cancelPending();
    resetAllLists(list);

    currentDropdown = dd;
    currentList = list;
    isOpen = true;

    const h = measureList(list);
    list.style.transition = "none";
    list.style.opacity = "0";
    list.style.visibility = "visible";
    list.style.pointerEvents = "auto";

    dropdownPortal.style.height = `${h}px`;
    dropdownPortal.classList.add("is-open");

    void navbarContainer.offsetHeight;

    applyTransitions(CONFIG.openMs);
    applyTheme();

    const ch = dd.querySelector(".dropdown-chevron");
    if (ch) ch.style.transform = "rotate(180deg)";
    dd.querySelector(".navbar_dropdwn-toggle")?.setAttribute("aria-expanded", "true");

    pageOverlay.classList.add("is-visible");
    setExpandedSpace(h, CONFIG.openMs);

    list.style.transition = `opacity ${CONFIG.openMs}ms ${CONFIG.ease}`;
    list.style.opacity = "1";
  }

  function switchMenu(next) {
    const prev = currentDropdown;
    const prevList = currentList;
    const nextList = getListFor(next);
    if (!nextList || next === prev) return;

    cancelClose();
    cancelPending();

    currentDropdown = next;
    currentList = nextList;

    const h = measureList(nextList);
    const dur = `${CONFIG.switchMs}ms`;
    const ease = CONFIG.ease;
    const prevEls = prevList ? getMorphable(prevList) : {};
    const nextEls = getMorphable(nextList);

    if (prevList) prevList.style.pointerEvents = "none";

    nextList.style.transition = "none";
    nextList.style.opacity = "1";
    nextList.style.visibility = "visible";
    nextList.style.pointerEvents = "auto";

    for (const sel in nextEls) {
      nextEls[sel].style.transition = "none";
      nextEls[sel].style.opacity = "0";
    }
    void nextList.offsetHeight;
    for (const sel in prevEls) {
      prevEls[sel].style.transition = `opacity ${dur} ${ease}`;
      prevEls[sel].style.opacity = "0";
    }
    for (const sel in nextEls) {
      nextEls[sel].style.transition = `opacity ${dur} ${ease}`;
      nextEls[sel].style.opacity = "1";
    }

    if (prevList && Object.keys(prevEls).length === 0) {
      prevList.style.transition = `opacity ${dur} ${ease}`;
      prevList.style.opacity = "0";
    }

    if (prev) {
      const pc = prev.querySelector(".dropdown-chevron");
      if (pc) { pc.style.transition = `transform ${dur} ${ease}`; pc.style.transform = "rotate(0deg)"; }
      prev.querySelector(".navbar_dropdwn-toggle")?.setAttribute("aria-expanded", "false");
    }

    const nc = next.querySelector(".dropdown-chevron");
    if (nc) { nc.style.transition = `transform ${dur} ${ease}`; nc.style.transform = "rotate(180deg)"; }

    for (const t of allToggles) {
      t.style.transition = `background-color ${dur} ${ease}, color ${dur} ${ease}`;
    }
    applyTheme();

    dropdownPortal.style.transition = `height ${dur} ${ease}`;
    dropdownPortal.style.height = `${h}px`;
    setExpandedSpace(h, CONFIG.switchMs);

    next.querySelector(".navbar_dropdwn-toggle")?.setAttribute("aria-expanded", "true");

    const toClean = prevList;
    const prevElsToReset = { ...prevEls };
    switchTimeout = setTimeout(() => {
      if (toClean && currentList !== toClean) {
        toClean.style.transition = "none";
        toClean.style.opacity = "0";
        toClean.style.visibility = "hidden";
        toClean.style.pointerEvents = "none";
        for (const sel in prevElsToReset) {
          const el = prevElsToReset[sel];
          if (el) { el.style.transition = "none"; el.style.opacity = "1"; }
        }
      }
      dropdownPortal.style.transition = "none";
      switchTimeout = null;
    }, CONFIG.switchMs + 50);
  }

  function closeMenu() {
    if (!isOpen) return;
    cancelClose();
    cancelPending();

    const dd = currentDropdown;
    const list = currentList;
    currentDropdown = null;
    currentList = null;
    isOpen = false;

    const dur = `${CONFIG.closeMs}ms`;
    const ease = CONFIG.ease;

    if (list) {
      list.style.transition = `opacity ${dur} ${ease}`;
      list.style.opacity = "0";
      list.style.pointerEvents = "none";
    }

    applyTransitions(CONFIG.closeMs);
    applyTheme();
    pageOverlay.classList.remove("is-visible");

    if (dd) {
      const ch = dd.querySelector(".dropdown-chevron");
      if (ch) ch.style.transform = "rotate(0deg)";
      dd.querySelector(".navbar_dropdwn-toggle")?.setAttribute("aria-expanded", "false");
    }

    setExpandedSpace(0, CONFIG.closeMs);

    closeFallbackTimeout = setTimeout(() => {
      closeFallbackTimeout = null;
      if (!isOpen) {
        dropdownPortal.classList.remove("is-open");
        dropdownPortal.style.height = "0";
        resetAllLists();
        applyTransitions(CONFIG.closeMs);
        applyTheme();
      }
    }, CONFIG.closeMs + CONFIG.closeFallbackBuffer);
  }

  function init() {
    navbarContainer = document.querySelector(".navbar_container");
    if (!navbarContainer) return;

    requestAnimationFrame(() => {
      if (!navbarContainer) return;
      const style = getComputedStyle(navbarContainer);
      originalPaddingBottom = style.paddingBottom || "0px";
      originalMarginBottom = style.marginBottom || "0px";
      originalNavbarHeight = navbarContainer.offsetHeight;

      menuDropdowns = Array.from(document.querySelectorAll(".navbar_menu-dropdown"));
      allTextElements = Array.from(document.querySelectorAll(".navbar_logo, .navbar_link, .navbar_dropdwn-toggle"));
      allToggles = Array.from(document.querySelectorAll(".navbar_menu-dropdown .navbar_dropdwn-toggle"));

      injectStyles();
      createOverlay();
      createPortal();
      createMeasureContainer();
      prepareDropdowns();
      disableWebflowBehavior();
      enhanceToggleA11y();
      bindEvents();
      bindScrollListener();

      allDropdownLists = Array.from(dropdownPortal.querySelectorAll(".navbar_dropdown-list"));

      requestAnimationFrame(() => {
        applyTransitions(0);
        applyTheme();
        requestAnimationFrame(() => applyTransitions(CONFIG.closeMs));
      });
    });

    motionQuery?.addEventListener?.("change", applyMotion);
  }

  function destroy() {
    cancelClose();
    cancelPending();
    motionQuery?.removeEventListener?.("change", applyMotion);

    // Return dropdown lists to their original parents
    dropdownListMap.forEach((list, dd) => {
      if (list && dd && list.parentNode === dropdownPortal) dd.appendChild(list);
    });
    dropdownListMap.clear();
    morphCache = new WeakMap();

    for (const { el, event, handler, options } of boundListeners) {
      el.removeEventListener(event, handler, options);
    }
    boundListeners = [];

    if (smoothScrollUnsub) { smoothScrollUnsub(); smoothScrollUnsub = null; }

    styleElement?.parentNode?.removeChild(styleElement);
    styleElement = null;
    pageOverlay?.parentNode?.removeChild(pageOverlay);
    dropdownPortal?.parentNode?.removeChild(dropdownPortal);
    measureContainer?.parentNode?.removeChild(measureContainer);

    // CRITICAL: Strip every inline style we applied so mobile starts clean
    if (navbarContainer) {
      navbarContainer.style.transition = "";
      navbarContainer.style.backgroundColor = "";
      navbarContainer.style.backdropFilter = "";
      navbarContainer.style.webkitBackdropFilter = "";
      navbarContainer.style.paddingBottom = "";
      navbarContainer.style.marginBottom = "";
      navbarContainer.style.maxWidth = "";
    }
    for (const el of allTextElements) {
      el.style.color = "";
      el.style.transition = "";
    }
    for (const t of allToggles) {
      t.style.backgroundColor = "";
      t.style.color = "";
      t.style.transition = "";
    }
    for (const dd of menuDropdowns) {
      const ch = dd.querySelector(".dropdown-chevron");
      if (ch) { ch.style.transform = ""; ch.style.transition = ""; }
      const t = dd.querySelector(".navbar_dropdwn-toggle");
      if (t) t.setAttribute("aria-expanded", "false");
    }

    navbarContainer = null;
    dropdownPortal = null;
    pageOverlay = null;
    measureContainer = null;
    menuDropdowns = [];
    allTextElements = [];
    allToggles = [];
    allDropdownLists = [];
    isScrolled = false;
    isOpen = false;
    currentDropdown = null;
    currentList = null;
    smoothScrollInstance = null;
    dropdownHeightCache = new WeakMap();
    originalPaddingBottom = null;
    originalMarginBottom = null;
    originalNavbarHeight = null;
  }

  SHARED.desktopInit = init;
  SHARED.desktopDestroy = destroy;
})();


/* ═══════════════════════════════════════════════
   MOBILE NAV (≤991px)
   Pure class-based. No JS style thrashing.
   ═══════════════════════════════════════════════ */
(() => {
  "use strict";
  const SHARED = window.__wdNavShared;

  const OPEN_MS = 280;
  const CLOSE_MS = 220;
  const DD_OPEN_MS = 240;
  const DD_CLOSE_MS = 200;
  const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
  const SCROLL_THRESHOLD = 48;
  const TOUCH_DEDUPE_MS = 600;

  const STATE = { CLOSED: 0, OPEN: 1 };
  let state = STATE.CLOSED;
  let isScrolled = false;

  let body, navButton, navbarComponent, navbarContainer, navbarMenu, navOverlay;
  let observers = [];
  let listeners = [];
  let dropdownResets = [];
  let styleEl = null;
  let lastTouchAt = 0;
  let scrollYOnOpen = 0;
  let scrollTicking = false;

  function addL(el, event, handler, options) {
    if (!el) return;
    el.addEventListener(event, handler, options);
    listeners.push({ el, event, handler, options });
  }

  function trackObs(o) { observers.push(o); return o; }

  function injectStyles() {
    const existing = document.getElementById("wd-navbar-mobile-styles");
    if (existing) existing.remove();

    styleEl = document.createElement("style");
    styleEl.id = "wd-navbar-mobile-styles";
    styleEl.textContent = `
@media (max-width: 991px) {
  /* Override any desktop inline styles that might leak through */
  .navbar_container {
    padding-bottom: 0 !important;
    margin-bottom: 0 !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    overflow: visible !important;
    max-width: 100% !important;
    background-color: transparent !important;
    transition: background-color ${CLOSE_MS}ms ${EASE} !important;
    will-change: background-color;
  }

  /* Full-viewport menu breakout */
  .w-nav-overlay {
    overflow: visible !important;
    display: block !important;
    height: auto !important;
  }
  .navbar_menu {
    width: 100vw !important;
    max-width: none !important;
    margin-left: calc(-50vw + 50%) !important;
    box-sizing: border-box !important;
    transform: translate3d(0, 0, 0) !important;
    -webkit-transform: translate3d(0, 0, 0) !important;
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
    opacity: 0;
    pointer-events: none;
    transition: opacity ${CLOSE_MS}ms ${EASE};
    will-change: opacity, transform;
  }

  /* OPEN state */
  .navbar_component.is-m-open .navbar_menu {
    opacity: 1;
    pointer-events: auto;
    transition: opacity ${OPEN_MS}ms ${EASE};
  }

  .navbar_component {
    border: none !important;
    border-bottom: none !important;
    box-shadow: none !important;
    outline: none !important;
    background-color: transparent;
    transition: background-color ${CLOSE_MS}ms ${EASE};
    transform: translateZ(0);
    -webkit-transform: translateZ(0);
    will-change: background-color;
  }

  .navbar_component.is-m-open,
  .navbar_component.is-m-open .navbar_container {
    transition: background-color ${OPEN_MS}ms ${EASE} !important;
  }

  /* DARK state */
  .navbar_component.is-m-open,
  .navbar_container.is-m-dark {
    background-color: #000 !important;
  }

  /* All text/icon transitions share timing with component */
  .navbar_logo,
  .navbar_link,
  .navbar_dropdwn-toggle,
  .navbar_container .button.is-mobile,
  .menu-icon,
  .menu-icon_line-top,
  .menu-icon_line-middle,
  .menu-icon_line-bottom {
    transition:
      background-color ${CLOSE_MS}ms ${EASE},
      color ${CLOSE_MS}ms ${EASE},
      border-color ${CLOSE_MS}ms ${EASE} !important;
  }
  .navbar_component.is-m-open .navbar_logo,
  .navbar_component.is-m-open .navbar_link,
  .navbar_component.is-m-open .navbar_dropdwn-toggle,
  .navbar_component.is-m-open .button.is-mobile,
  .navbar_component.is-m-open .menu-icon,
  .navbar_component.is-m-open .menu-icon_line-top,
  .navbar_component.is-m-open .menu-icon_line-middle,
  .navbar_component.is-m-open .menu-icon_line-bottom {
    transition:
      background-color ${OPEN_MS}ms ${EASE},
      color ${OPEN_MS}ms ${EASE},
      border-color ${OPEN_MS}ms ${EASE} !important;
  }

  /* Strip any inline color set by desktop JS */
  .navbar_container .navbar_logo,
  .navbar_container .navbar_link,
  .navbar_container .navbar_dropdwn-toggle {
    color: inherit !important;
  }

  .navbar_container.is-m-dark .navbar_logo,
  .navbar_container.is-m-dark .navbar_link,
  .navbar_container.is-m-dark .navbar_dropdwn-toggle {
    color: #ffffff !important;
  }
  .navbar_container.is-m-dark .button.is-mobile {
    color: #fff !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
  }
  .navbar_container.is-m-dark .menu-icon {
    background-color: #202020 !important;
  }
  .navbar_container.is-m-dark .menu-icon_line-top,
  .navbar_container.is-m-dark .menu-icon_line-middle,
  .navbar_container.is-m-dark .menu-icon_line-bottom {
    background-color: #fff !important;
  }

  /* Dropdowns */
  .navbar_menu .navbar_dropdown-list {
    display: block !important;
    max-height: 0;
    overflow: hidden !important;
    transition: max-height ${DD_CLOSE_MS}ms ${EASE};
    will-change: max-height;
  }
  .navbar_menu .navbar_dropdown-list.is-dd-open {
    transition: max-height ${DD_OPEN_MS}ms ${EASE};
  }
  .navbar_menu .dropdown-chevron {
    transition: transform ${DD_CLOSE_MS}ms ${EASE};
    will-change: transform;
  }
  .navbar_menu .navbar_menu-dropdown.is-dd-open .dropdown-chevron {
    transform: rotate(180deg);
    transition: transform ${DD_OPEN_MS}ms ${EASE};
  }

  .navbar_menu .navbar_dropdwn-toggle,
  .navbar_menu .navbar_dropdwn-toggle *,
  .navbar_menu .navbar_dropdown-list,
  .navbar_menu .navbar_dropdown-list * {
    color: inherit !important;
    background-color: inherit !important;
  }

  .w-nav-button,
  .navbar_dropdwn-toggle,
  .navbar_link {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  body.is-m-nav-open {
    overflow: hidden !important;
    position: fixed !important;
    width: 100% !important;
    top: var(--m-nav-scroll-y, 0) !important;
  }

  /* Hide desktop-only DOM */
  .navbar-dropdown-portal,
  .navbar-measure-container,
  .nav-page-overlay {
    display: none !important;
  }
}
    `.trim();
    document.head.appendChild(styleEl);
  }

  function applyState() {
    if (!SHARED.isMobile()) return;
    const menuOpen = state === STATE.OPEN;
    const dark = menuOpen || isScrolled;
    navbarComponent?.classList.toggle("is-m-open", menuOpen);
    navbarContainer?.classList.toggle("is-m-dark", dark);
  }

  function lockBodyScroll() {
    scrollYOnOpen = window.scrollY;
    document.documentElement.style.setProperty("--m-nav-scroll-y", `-${scrollYOnOpen}px`);
    body.classList.add("is-m-nav-open");
  }

  function unlockBodyScroll() {
    body.classList.remove("is-m-nav-open");
    document.documentElement.style.removeProperty("--m-nav-scroll-y");
    window.scrollTo(0, scrollYOnOpen);
  }

  function openMenu() {
    if (state === STATE.OPEN) return;
    state = STATE.OPEN;
    lockBodyScroll();
    resetAllDropdowns();
    applyState();
  }

  function closeMenu() {
    if (state === STATE.CLOSED) return;
    state = STATE.CLOSED;
    unlockBodyScroll();
    resetAllDropdowns();
    applyState();
  }

  function toggleMenu() {
    if (state === STATE.OPEN) closeMenu();
    else openMenu();
  }

  function resetAllDropdowns() {
    for (const fn of dropdownResets) fn();
  }

  function bindNavButton() {
    addL(navButton, "touchstart", (e) => {
      if (!SHARED.isMobile()) return;
      if (e.touches && e.touches.length !== 1) return;
      lastTouchAt = Date.now();
      toggleMenu();
      e.preventDefault();
      e.stopPropagation();
    }, { capture: true, passive: false });

    addL(navButton, "pointerdown", (e) => {
      if (!SHARED.isMobile()) return;
      if (e.pointerType !== "pen") return;
      if (e.button !== undefined && e.button !== 0) return;
      lastTouchAt = Date.now();
      toggleMenu();
      e.preventDefault();
      e.stopPropagation();
    }, { capture: true, passive: false });

    addL(navButton, "click", (e) => {
      if (!SHARED.isMobile()) return;
      if (Date.now() - lastTouchAt < TOUCH_DEDUPE_MS) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      toggleMenu();
    }, { capture: true });

    addL(navButton, "mousedown", (e) => {
      if (!SHARED.isMobile()) return;
      if (Date.now() - lastTouchAt < TOUCH_DEDUPE_MS) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, { capture: true });
  }

  function bindOverlayAndMenu() {
    if (navOverlay) {
      addL(navOverlay, "pointerdown", (e) => {
        if (!SHARED.isMobile()) return;
        if (state !== STATE.OPEN) return;
        if (e.target === navOverlay) closeMenu();
      }, { capture: true });
    }

    if (navbarMenu) {
      addL(navbarMenu, "click", (e) => {
        if (!SHARED.isMobile()) return;
        if (state !== STATE.OPEN) return;
        if (e.target.closest("a[href]")) {
          setTimeout(closeMenu, 0);
        }
      }, true);
    }
  }

  function bindScroll() {
    addL(window, "scroll", () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        const was = isScrolled;
        isScrolled = window.scrollY > SCROLL_THRESHOLD;
        if (was !== isScrolled) applyState();
        scrollTicking = false;
      });
    }, { passive: true });
  }

  function bindWebflowSync() {
    trackObs(new MutationObserver(() => {
      if (!SHARED.isMobile()) return;
      if (Date.now() - lastTouchAt < TOUCH_DEDUPE_MS) return;
      const wfOpen = navButton.classList.contains("w--open");
      if (wfOpen && state === STATE.CLOSED) openMenu();
      else if (!wfOpen && state === STATE.OPEN) closeMenu();
    })).observe(navButton, { attributes: true, attributeFilter: ["class"] });
  }

  function bindDropdowns() {
    if (!navbarMenu) return;
    const allDropdowns = navbarMenu.querySelectorAll(".navbar_menu-dropdown");

    allDropdowns.forEach((dd) => {
      const list = dd.querySelector(".navbar_dropdown-list");
      if (!list) return;

      let ddOpen = false;
      let ddTimeout = null;

      function resetDropdown() {
        clearTimeout(ddTimeout);
        ddOpen = false;
        list.classList.remove("is-dd-open");
        dd.classList.remove("is-dd-open");
        list.style.removeProperty("max-height");
      }
      dropdownResets.push(resetDropdown);

      trackObs(new MutationObserver(() => {
        if (!SHARED.isMobile() || state !== STATE.OPEN) return;
        const nowOpen = list.classList.contains("w--open");
        if (nowOpen === ddOpen) return;
        ddOpen = nowOpen;
        clearTimeout(ddTimeout);

        if (ddOpen) {
          const h = list.scrollHeight;
          list.classList.add("is-dd-open");
          dd.classList.add("is-dd-open");
          list.style.maxHeight = h + "px";
          ddTimeout = setTimeout(() => {
            list.style.maxHeight = "none";
          }, DD_OPEN_MS + 20);
        } else {
          const h = list.scrollHeight;
          list.style.maxHeight = h + "px";
          void list.offsetHeight;
          list.classList.remove("is-dd-open");
          dd.classList.remove("is-dd-open");
          list.style.maxHeight = "0";
        }
      })).observe(list, { attributes: true, attributeFilter: ["class"] });
    });
  }

  function primeFirstTap() {
    if (navbarMenu) {
      navbarMenu.style.transform = "translate3d(0, 0, 0)";
      void navbarMenu.offsetHeight;
    }
    if (navbarComponent) {
      navbarComponent.style.transform = "translate3d(0, 0, 0)";
      void navbarComponent.offsetHeight;
    }
    try {
      const _ = navButton.classList.contains("w--open");
      const __ = navbarComponent?.classList.contains("is-m-open");
      const ___ = window.scrollY;
      void _; void __; void ___;
    } catch (e) { /* noop */ }
    if (navbarMenu) {
      getComputedStyle(navbarMenu).opacity;
      getComputedStyle(navbarMenu).transition;
    }
  }

  function init() {
    body = document.body;
    navButton = document.querySelector(".w-nav-button");
    navbarComponent = document.querySelector(".navbar_component");
    navbarContainer = document.querySelector(".navbar_container");
    navbarMenu = document.querySelector(".navbar_menu");
    navOverlay = document.querySelector(".w-nav-overlay");

    if (!navButton || !navbarContainer) return;

    injectStyles();
    bindNavButton();
    bindOverlayAndMenu();
    bindScroll();
    bindWebflowSync();
    bindDropdowns();

    isScrolled = window.scrollY > SCROLL_THRESHOLD;
    applyState();

    if (document.readyState === "complete") {
      requestAnimationFrame(primeFirstTap);
    } else {
      addL(window, "load", () => requestAnimationFrame(primeFirstTap), { once: true });
    }
  }

  function destroy() {
    for (const o of observers) o.disconnect();
    observers = [];
    for (const { el, event, handler, options } of listeners) {
      el.removeEventListener(event, handler, options);
    }
    listeners = [];

    resetAllDropdowns();
    dropdownResets = [];

    if (state === STATE.OPEN) unlockBodyScroll();
    state = STATE.CLOSED;

    styleEl?.parentNode?.removeChild(styleEl);
    styleEl = null;

    navbarComponent?.classList.remove("is-m-open");
    navbarContainer?.classList.remove("is-m-dark");

    if (navbarMenu) navbarMenu.style.transform = "";
    if (navbarComponent) navbarComponent.style.transform = "";

    body = navButton = navbarComponent = navbarContainer = navbarMenu = navOverlay = null;
  }

  SHARED.mobileInit = init;
  SHARED.mobileDestroy = destroy;
})();


/* ═══════════════════════════════════════════════
   MOBILE CTA — Platform-aware href (always on)
   ═══════════════════════════════════════════════ */
(() => {
  "use strict";

  const IOS_URL = "https://apps.apple.com/us/app/watch-duty-wildfire/id1574452924";
  const ANDROID_URL = "https://play.google.com/store/apps/details?id=org.watchduty.app";
  const WEB_URL = "https://app.watchduty.org/";

  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const platformUrl = isIOS ? IOS_URL : isAndroid ? ANDROID_URL : WEB_URL;

  function applyHref(btn) {
    if (!btn) return;
    if (btn.dataset.platformHref === platformUrl) return;
    btn.href = platformUrl;
    btn.dataset.platformHref = platformUrl;
  }

  function findAndApply() {
    const btn = document.querySelector(".navbar_container .button.is-mobile");
    applyHref(btn);
  }

  findAndApply();

  if (window.__ctaHrefObserver) window.__ctaHrefObserver.disconnect();

  window.__ctaHrefObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (
          node.matches?.(".navbar_container .button.is-mobile") ||
          node.querySelector?.(".navbar_container .button.is-mobile")
        ) {
          findAndApply();
          return;
        }
      }
    }
  });

  window.__ctaHrefObserver.observe(document.body, { childList: true, subtree: true });
})();
