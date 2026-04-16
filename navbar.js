/* ═══════════════════════════════════════════════
   WATCH DUTY NAVBAR
   Desktop portal dropdowns + mobile full-viewport menu
   ═══════════════════════════════════════════════ */

/* ───────────────────────────────────────────────
   SHARED CONSTANTS
   ─────────────────────────────────────────────── */
(() => {
  "use strict";
  if (window.__watchDutyNavShared) return;
  window.__watchDutyNavShared = {
    DESKTOP_MIN: 992,
    MOBILE_MAX: 991,
    SCROLL_THRESHOLD: 48,
    EASE: "cubic-bezier(0.86, 0, 0.07, 1)",
    OPEN_MS: 850,
    CLOSE_MS: 550,
  };
})();

/* ═══════════════════════════════════════════════
   DESKTOP NAV — ≥992px
   ═══════════════════════════════════════════════ */

(function () {
  "use strict";

  const SHARED = window.__watchDutyNavShared;

  // Prevent double initialization in Webflow
  if (window.__navbarAnimationInitialized) {
    if (window.__navbarAnimationDestroy) window.__navbarAnimationDestroy();
  }

  // =============================================
  // CONFIGURATION
  // =============================================
  const CONFIG = {
    scrollThreshold: SHARED.SCROLL_THRESHOLD,
    maxWidth: "84rem",

    borderRadius: "var(--_ui-styles---radius--xlarge)",
    borderRadiusPx: 20,

    ease: SHARED.EASE,
    openMs: SHARED.OPEN_MS,
    closeMs: SHARED.CLOSE_MS,
    switchMs: 450,

    overlayOpacity: 0.72,
    overlayBlurPx: 14,

    navbarBlur: {
      top: "0px",
      scrolled: "12px",
      open: "16px",
    },

    closeDelayMs: 120,

    appToggleBg: "var(--_primitives---colors--accent-primary)",
    appToggleText: "#1a1a1a",

    toggleRadiusPx: 12,

    touchBreakpoint: SHARED.MOBILE_MAX,

    closeFallbackBuffer: 150,

    colors: {
      top: {
        navbarBg: "rgba(255, 255, 255, 0.95)",
        textColor: "#1a1a1a",
        dropdownText: "#1a1a1a",
        elementBg: "rgba(0, 0, 0, 0.05)",
      },
      scrolled: {
        navbarBg: "rgba(0, 0, 0, 0.92)",
        textColor: "#ffffff",
        dropdownText: "#ffffff",
        elementBg: "rgba(255, 255, 255, 0.1)",
      },
    },
  };

  // Store baseline values so prefers-reduced-motion can toggle live
  const BASE_TIMINGS = {
    openMs: CONFIG.openMs,
    closeMs: CONFIG.closeMs,
    switchMs: CONFIG.switchMs,
    overlayBlurPx: CONFIG.overlayBlurPx,
    navbarBlur: { ...CONFIG.navbarBlur },
  };

  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  function applyMotionPreference() {
    if (motionQuery?.matches) {
      CONFIG.openMs = 0;
      CONFIG.closeMs = 0;
      CONFIG.switchMs = 0;
      CONFIG.overlayBlurPx = 0;
      CONFIG.navbarBlur = { top: "0px", scrolled: "0px", open: "0px" };
    } else {
      CONFIG.openMs = BASE_TIMINGS.openMs;
      CONFIG.closeMs = BASE_TIMINGS.closeMs;
      CONFIG.switchMs = BASE_TIMINGS.switchMs;
      CONFIG.overlayBlurPx = BASE_TIMINGS.overlayBlurPx;
      CONFIG.navbarBlur = { ...BASE_TIMINGS.navbarBlur };
    }
  }
  applyMotionPreference();

  // Re-apply on live OS-level toggle
  motionQuery?.addEventListener?.("change", () => {
    applyMotionPreference();
    if (window.__navbarAnimationInitialized) {
      // Refresh injected styles so overlay blur / radii pick up new values
      injectStyles?.();
    }
  });

  // =============================================
  // STATE
  // =============================================
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

  let smoothScrollInstance = null;
  let smoothScrollUnsub = null;

  let originalPaddingBottom = null;
  let originalMarginBottom = null;
  let originalNavbarHeight = null;

  let boundEventListeners = [];
  let styleElement = null;

  let dropdownListMap = new Map();

  let lastScrollY = 0;
  let scrollTicking = false;

  let dropdownHeightCache = new WeakMap();
  let resizeTimeout = null;

  let switchTimeout = null;
  let closeFallbackTimeout = null;

  let isTouchDevice = false;

  // =============================================
  // HELPERS
  // =============================================
  function getListForDropdown(dropdown) {
    return dropdownListMap.get(dropdown);
  }

  function addTrackedListener(el, event, handler, options) {
    if (!el) return;
    el.addEventListener(event, handler, options);
    boundEventListeners.push({ el, event, handler, options });
  }

  function detectTouch() {
    return (
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth <= CONFIG.touchBreakpoint
    );
  }

  function setExpandedSpace(px, msForTransition) {
    if (!navbarContainer) return;
    const dur =
      typeof msForTransition === "number" ? msForTransition : CONFIG.closeMs;
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

  // =============================================
  // INIT
  // =============================================
  function init() {
    navbarContainer = document.querySelector(".navbar_container");
    if (!navbarContainer) return;

    window.__navbarAnimationInitialized = true;

    isTouchDevice = detectTouch();

    // Defer computed-style read to after next frame so CSS has fully applied
    requestAnimationFrame(() => {
      if (!navbarContainer) return; // destroyed before rAF fired
      const style = getComputedStyle(navbarContainer);
      originalPaddingBottom = style.paddingBottom || "0px";
      originalMarginBottom = style.marginBottom || "0px";
      originalNavbarHeight = navbarContainer.offsetHeight;

      menuDropdowns = Array.from(
        document.querySelectorAll(".navbar_menu-dropdown")
      );
      allTextElements = Array.from(
        document.querySelectorAll(
          ".navbar_logo, .navbar_link, .navbar_dropdwn-toggle"
        )
      );
      allToggles = Array.from(
        document.querySelectorAll(".navbar_menu-dropdown .navbar_dropdwn-toggle")
      );

      injectStyles();
      createOverlay();
      createDropdownPortal();
      createMeasureContainer();
      prepareDropdowns();
      disableWebflowBehavior();
      enhanceToggleA11y();
      bindEvents();
      bindScrollListener();
      bindResizeListener();

      allDropdownLists = Array.from(
        dropdownPortal.querySelectorAll(".navbar_dropdown-list")
      );

      requestAnimationFrame(() => {
        applyTransitions(0);
        applyTheme();
        requestAnimationFrame(() => applyTransitions(CONFIG.closeMs));
      });
    });
  }

  function enhanceToggleA11y() {
    for (let i = 0; i < allToggles.length; i++) {
      const t = allToggles[i];
      if (!t.hasAttribute("aria-haspopup")) {
        t.setAttribute("aria-haspopup", "true");
      }
      if (!t.hasAttribute("aria-expanded")) {
        t.setAttribute("aria-expanded", "false");
      }
      // If not a native button, make it keyboard-focusable with button semantics
      if (t.tagName !== "BUTTON" && !t.hasAttribute("role")) {
        t.setAttribute("role", "button");
        if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "0");
      }
    }
  }

  // =============================================
  // SMOOTH SCROLL HELPERS
  // =============================================
  function getLenisLikeInstance() {
    if (window.lenis && typeof window.lenis.on === "function")
      return window.lenis;

    const loco =
      window.locomotiveScroll ||
      window.LocomotiveScrollInstance ||
      window.locoScroll;
    if (loco) {
      if (loco.lenis && typeof loco.lenis.on === "function") return loco.lenis;
      if (loco._lenis && typeof loco._lenis.on === "function")
        return loco._lenis;
      if (loco.scroll && typeof loco.scroll.on === "function")
        return loco.scroll;
    }
    return null;
  }

  function getScrollTop() {
    const l = smoothScrollInstance || getLenisLikeInstance();
    return (
      (l && typeof l.scroll === "number" ? l.scroll : null) ??
      window.scrollY ??
      window.pageYOffset ??
      0
    );
  }

  // =============================================
  // THEME
  // =============================================
  function getTheme() {
    return isOpen || isScrolled ? CONFIG.colors.scrolled : CONFIG.colors.top;
  }

  function applyTheme() {
    if (!navbarContainer) return;
    const theme = getTheme();
    const blur = isOpen
      ? CONFIG.navbarBlur.open
      : isScrolled
        ? CONFIG.navbarBlur.scrolled
        : CONFIG.navbarBlur.top;

    const cs = navbarContainer.style;
    cs.maxWidth = CONFIG.maxWidth;
    cs.backgroundColor = theme.navbarBg;
    cs.backdropFilter = `blur(${blur})`;
    cs.webkitBackdropFilter = `blur(${blur})`;

    const textColor = theme.textColor;
    for (let i = 0; i < allTextElements.length; i++) {
      allTextElements[i].style.color = textColor;
    }

    const elementBg = theme.elementBg;
    for (let i = 0; i < menuDropdowns.length; i++) {
      const dd = menuDropdowns[i];
      const toggle = dd.querySelector(".navbar_dropdwn-toggle");
      if (!toggle) continue;

      if (toggle.classList.contains("is-app")) {
        toggle.style.backgroundColor = CONFIG.appToggleBg;
        toggle.style.color = CONFIG.appToggleText;
        continue;
      }

      toggle.style.backgroundColor =
        isOpen && dd === currentDropdown ? elementBg : "transparent";
    }
  }

  // =============================================
  // TRANSITIONS
  // =============================================
  function applyTransitions(ms) {
    if (!navbarContainer) return;
    const dur = `${ms}ms`;
    const ease = CONFIG.ease;

    const transition =
      `background-color ${dur} ${ease}, ` +
      `backdrop-filter ${dur} ${ease}, ` +
      `-webkit-backdrop-filter ${dur} ${ease}, ` +
      `padding-bottom ${dur} ${ease}, ` +
      `margin-bottom ${dur} ${ease}`;

    const colorTransition = `color ${dur} ${ease}`;
    const toggleTransition = `color ${dur} ${ease}, background-color ${dur} ${ease}`;
    const overlayTransition =
      `opacity ${dur} ${ease}, ` +
      `backdrop-filter ${dur} ${ease}, ` +
      `-webkit-backdrop-filter ${dur} ${ease}`;

    navbarContainer.style.transition = transition;

    for (let i = 0; i < allTextElements.length; i++) {
      allTextElements[i].style.transition = colorTransition;
    }

    for (let i = 0; i < allToggles.length; i++) {
      allToggles[i].style.transition = toggleTransition;
    }

    if (pageOverlay) pageOverlay.style.transition = overlayTransition;
  }

  // =============================================
  // STYLES
  // =============================================
  function injectStyles() {
    const existingStyle = document.getElementById("navbar-animation-styles");
    if (existingStyle) existingStyle.remove();

    const css = `
.navbar_container{
  position: relative !important;
  overflow: hidden !important;
  z-index: 901 !important;
  max-width: ${CONFIG.maxWidth} !important;
  will-change: background-color, backdrop-filter, padding-bottom, margin-bottom;
}

.navbar_logo-link,
.navbar_menu,
.navbar_button-wrapper{
  position: relative;
  z-index: 10;
}

.navbar-dropdown-portal{
  position: absolute;
  left: 0;
  right: 0;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}
.navbar-dropdown-portal.is-open{
  pointer-events: auto;
}

.navbar-measure-container{
  position: absolute !important;
  left: -9999px !important;
  top: -9999px !important;
  width: 100% !important;
  visibility: hidden !important;
  pointer-events: none !important;
  z-index: -1 !important;
}

.navbar_menu{ position: relative !important; }
.navbar_menu-dropdown{ position: static !important; }

.navbar_dropdown-list{
  display: block !important;
  position: absolute !important;
  left: 0 !important;
  right: 0 !important;
  top: 0 !important;
  width: 100% !important;
  box-sizing: border-box !important;
  z-index: 2;
  background: transparent !important;
  border-radius: 0 !important;
  overflow: hidden;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  will-change: opacity;
}

.nav-page-overlay{
  position: fixed;
  inset: 0;
  z-index: 900;
  pointer-events: none;
  background: rgba(15, 15, 15, ${CONFIG.overlayOpacity});
  opacity: 0;
  backdrop-filter: blur(0px);
  -webkit-backdrop-filter: blur(0px);
  will-change: opacity, backdrop-filter;
}
.nav-page-overlay.is-visible{
  opacity: 1;
  pointer-events: auto;
  backdrop-filter: blur(${CONFIG.overlayBlurPx}px);
  -webkit-backdrop-filter: blur(${CONFIG.overlayBlurPx}px);
}

.navbar_dropdwn-toggle{
  border-radius: ${CONFIG.toggleRadiusPx}px !important;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.navbar_dropdwn-toggle.is-app{
  background-color: ${CONFIG.appToggleBg} !important;
  color: ${CONFIG.appToggleText} !important;
}

.dropdown-grid-right,
.dropdown-grid-app,
.dropdown-left-content-icon-wrapper{
  background-color: #202020 !important;
}
.navbar_dropdown-list,
.navbar_dropdown-list *{
  color: #ffffff !important;
}
    `.trim();

    styleElement = document.createElement("style");
    styleElement.id = "navbar-animation-styles";
    styleElement.textContent = css;
    document.head.appendChild(styleElement);
  }

  // =============================================
  // DOM SETUP
  // =============================================
  function createOverlay() {
    pageOverlay = document.querySelector(".nav-page-overlay");
    if (!pageOverlay) {
      pageOverlay = document.createElement("div");
      pageOverlay.className = "nav-page-overlay";
      document.body.appendChild(pageOverlay);
    }
    addTrackedListener(pageOverlay, "click", () => {
      if (isOpen) closeMenu();
    });
  }

  function createDropdownPortal() {
    dropdownPortal = navbarContainer.querySelector(".navbar-dropdown-portal");
    if (!dropdownPortal) {
      dropdownPortal = document.createElement("div");
      dropdownPortal.className = "navbar-dropdown-portal";
      navbarContainer.appendChild(dropdownPortal);
    }

    dropdownPortal.style.top = `${originalNavbarHeight}px`;

    for (let i = 0; i < menuDropdowns.length; i++) {
      const dropdown = menuDropdowns[i];
      const list = dropdown.querySelector(".navbar_dropdown-list");
      if (list) {
        dropdownListMap.set(dropdown, list);
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
    const chevronTransition = `transform ${CONFIG.openMs}ms ${CONFIG.ease}`;
    for (let i = 0; i < menuDropdowns.length; i++) {
      const chevron = menuDropdowns[i].querySelector(".dropdown-chevron");
      if (chevron) chevron.style.transition = chevronTransition;
    }
  }

  function disableWebflowBehavior() {
    for (let i = 0; i < menuDropdowns.length; i++) {
      menuDropdowns[i].removeAttribute("data-hover");
      menuDropdowns[i].removeAttribute("data-delay");
    }
  }

  // =============================================
  // EVENTS
  // =============================================
  function bindEvents() {
    addTrackedListener(navbarContainer, "pointerleave", (e) => {
      if (e.pointerType === "touch") return;
      // relatedTarget is null when leaving window/chrome — treat as leaving
      const into = e.relatedTarget;
      if (!into || !navbarContainer.contains(into)) {
        requestClose();
      }
    });

    addTrackedListener(navbarContainer, "pointerenter", (e) => {
      if (e.pointerType === "touch") return;
      if (isOpen) cancelClose();
    });

    // Cancel pending opens if the pointer input is canceled (browser takeover)
    addTrackedListener(navbarContainer, "pointercancel", () => {
      // If we're mid-open intent but not yet open, clear the intent
      cancelClose();
    });

    for (let i = 0; i < menuDropdowns.length; i++) {
      const dropdown = menuDropdowns[i];
      const toggle = dropdown.querySelector(".navbar_dropdwn-toggle");
      const list = getListForDropdown(dropdown);
      if (!toggle || !list) continue;

      addTrackedListener(toggle, "pointerenter", (e) => {
        if (e.pointerType === "touch") return;
        cancelClose();
        if (!isOpen || currentDropdown !== dropdown) openOrSwitch(dropdown);
      });

      addTrackedListener(toggle, "click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (isOpen && currentDropdown === dropdown) {
          closeMenu();
        } else {
          openOrSwitch(dropdown);
        }
      });

      addTrackedListener(toggle, "keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (isOpen && currentDropdown === dropdown) closeMenu();
          else openOrSwitch(dropdown);
        }
        if (e.key === "Escape" && isOpen) {
          closeMenu();
          toggle.focus();
        }
      });
    }

    addTrackedListener(document, "keydown", (e) => {
      if (e.key === "Escape" && isOpen) closeMenu();
    });

    addTrackedListener(
      document,
      "pointerdown",
      (e) => {
        if (!isOpen) return;
        if (
          !navbarContainer.contains(e.target) &&
          !pageOverlay.contains(e.target)
        ) {
          closeMenu();
        }
      },
      { passive: true }
    );
  }

  function bindScrollListener() {
    const updateScrolledState = (y) => {
      const scrolled = (y || 0) > CONFIG.scrollThreshold;
      if (scrolled !== isScrolled) {
        isScrolled = scrolled;
        if (!isOpen) {
          applyTransitions(CONFIG.closeMs);
          applyTheme();
        }
      }
    };

    smoothScrollInstance = getLenisLikeInstance();
    if (
      smoothScrollInstance &&
      typeof smoothScrollInstance.on === "function"
    ) {
      const handler = (e) => {
        const y =
          e && typeof e.scroll === "number" ? e.scroll : getScrollTop();
        updateScrolledState(y);
      };
      smoothScrollInstance.on("scroll", handler);
      smoothScrollUnsub = () => {
        if (typeof smoothScrollInstance.off === "function") {
          smoothScrollInstance.off("scroll", handler);
        }
      };
      updateScrolledState(getScrollTop());
    } else {
      const onScroll = () => {
        lastScrollY = getScrollTop();
        if (!scrollTicking) {
          requestAnimationFrame(() => {
            updateScrolledState(lastScrollY);
            scrollTicking = false;
          });
          scrollTicking = true;
        }
      };
      addTrackedListener(window, "scroll", onScroll, { passive: true });
      updateScrolledState(getScrollTop());
    }
  }

  // Single consolidated resize handler:
  // - invalidates height cache
  // - updates touch detection
  // - repositions portal
  // - lets top-level viewport handler decide init/destroy
  function bindResizeListener() {
    addTrackedListener(
      window,
      "resize",
      () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          dropdownHeightCache = new WeakMap();
          isTouchDevice = detectTouch();
          if (navbarContainer && dropdownPortal) {
            originalNavbarHeight = navbarContainer.offsetHeight;
            dropdownPortal.style.top = `${originalNavbarHeight}px`;
          }
        }, 200);
      },
      { passive: true }
    );
  }

  // =============================================
  // CLOSE TIMER
  // =============================================
  function cancelClose() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }

  function requestClose() {
    cancelClose();
    closeTimer = setTimeout(closeMenu, CONFIG.closeDelayMs);
  }

  function cancelPendingAnimations() {
    if (switchTimeout) {
      clearTimeout(switchTimeout);
      switchTimeout = null;
    }
    if (closeFallbackTimeout) {
      clearTimeout(closeFallbackTimeout);
      closeFallbackTimeout = null;
    }
  }

  // =============================================
  // MEASURE HEIGHT
  // =============================================
  function measureListHeight(list) {
    const cached = dropdownHeightCache.get(list);
    if (cached !== undefined) return cached;

    const clone = list.cloneNode(true);
    clone.style.cssText =
      "position:relative!important;top:auto!important;opacity:1!important;" +
      "visibility:visible!important;display:block!important;pointer-events:none!important;" +
      "width:100%!important;";

    measureContainer.appendChild(clone);
    const height = clone.offsetHeight;
    measureContainer.removeChild(clone);

    dropdownHeightCache.set(list, height);
    return height;
  }

  // Thoroughly reset list styles so stale inline values from killed
  // switch/close animations don't leak into the next open
  function fullyResetListStyles(list) {
    if (!list) return;
    list.style.transition = "none";
    list.style.opacity = "0";
    list.style.visibility = "hidden";
    list.style.pointerEvents = "none";

    // Reset morphable children too — switchMenu sets opacity:0 on these
    for (const selector of MORPH_SELECTORS) {
      const el = list.querySelector(selector);
      if (el) {
        el.style.transition = "none";
        el.style.opacity = "1";
      }
    }
  }

  function resetAllLists(exceptList = null) {
    for (let i = 0; i < allDropdownLists.length; i++) {
      const list = allDropdownLists[i];
      if (list && list !== exceptList) {
        fullyResetListStyles(list);
      }
    }

    for (let i = 0; i < menuDropdowns.length; i++) {
      if (menuDropdowns[i] !== currentDropdown) {
        const chevron = menuDropdowns[i].querySelector(".dropdown-chevron");
        if (chevron) chevron.style.transform = "rotate(0deg)";
        const toggle = menuDropdowns[i].querySelector(
          ".navbar_dropdwn-toggle"
        );
        if (toggle) toggle.setAttribute("aria-expanded", "false");
      }
    }
  }

  // =============================================
  // OPEN / SWITCH / CLOSE
  // =============================================
  const MORPH_SELECTORS = [
    ".dropdown-grid-left",
    ".dropdown-grid-right",
    ".dropdown-grid-app",
    ".dropdown-content-wrapper",
  ];

  // Cache morphable elements per list (low priority optimization from analysis)
  const morphCache = new WeakMap();
  function getMorphableElements(list) {
    let cached = morphCache.get(list);
    if (cached) return cached;
    cached = {};
    for (const selector of MORPH_SELECTORS) {
      const el = list.querySelector(selector);
      if (el) cached[selector] = el;
    }
    morphCache.set(list, cached);
    return cached;
  }

  function openOrSwitch(dropdown) {
    if (currentDropdown === dropdown) return;
    cancelPendingAnimations();
    if (isOpen && currentDropdown) switchMenu(dropdown);
    else openMenu(dropdown);
  }

  function openMenu(dropdown) {
    const list = getListForDropdown(dropdown);
    if (!list) return;

    cancelClose();
    cancelPendingAnimations();
    resetAllLists(list);

    currentDropdown = dropdown;
    currentList = list;
    isOpen = true;

    const dropdownHeight = measureListHeight(list);

    list.style.transition = "none";
    list.style.opacity = "0";
    list.style.visibility = "visible";
    list.style.pointerEvents = "auto";

    dropdownPortal.style.height = `${dropdownHeight}px`;
    dropdownPortal.classList.add("is-open");

    void navbarContainer.offsetHeight;

    applyTransitions(CONFIG.openMs);
    applyTheme();

    const chevron = dropdown.querySelector(".dropdown-chevron");
    if (chevron) chevron.style.transform = "rotate(180deg)";
    dropdown
      .querySelector(".navbar_dropdwn-toggle")
      ?.setAttribute("aria-expanded", "true");

    pageOverlay.classList.add("is-visible");

    setExpandedSpace(dropdownHeight, CONFIG.openMs);

    const dur = `${CONFIG.openMs}ms`;
    const ease = CONFIG.ease;
    list.style.transition = `opacity ${dur} ${ease}`;
    list.style.opacity = "1";
  }

  function switchMenu(nextDropdown) {
    const prevDropdown = currentDropdown;
    const prevList = currentList;
    const nextList = getListForDropdown(nextDropdown);
    if (!nextList) return;
    if (nextDropdown === prevDropdown) return;

    cancelClose();
    cancelPendingAnimations();

    currentDropdown = nextDropdown;
    currentList = nextList;

    const nextDropdownHeight = measureListHeight(nextList);
    const dur = `${CONFIG.switchMs}ms`;
    const ease = CONFIG.ease;

    const prevElements = prevList ? getMorphableElements(prevList) : {};
    const nextElements = getMorphableElements(nextList);

    if (prevList) {
      prevList.style.pointerEvents = "none";
    }

    nextList.style.transition = "none";
    nextList.style.opacity = "1";
    nextList.style.visibility = "visible";
    nextList.style.pointerEvents = "auto";

    for (const selector in nextElements) {
      const el = nextElements[selector];
      el.style.transition = "none";
      el.style.opacity = "0";
    }

    void nextList.offsetHeight;

    for (const selector in prevElements) {
      const prevEl = prevElements[selector];
      prevEl.style.transition = `opacity ${dur} ${ease}`;
      prevEl.style.opacity = "0";
    }

    for (const selector in nextElements) {
      const nextEl = nextElements[selector];
      nextEl.style.transition = `opacity ${dur} ${ease}`;
      nextEl.style.opacity = "1";
    }

    if (prevList && Object.keys(prevElements).length === 0) {
      prevList.style.transition = `opacity ${dur} ${ease}`;
      prevList.style.opacity = "0";
    }

    if (prevDropdown) {
      const prevChevron = prevDropdown.querySelector(".dropdown-chevron");
      if (prevChevron) {
        prevChevron.style.transition = `transform ${dur} ${ease}`;
        prevChevron.style.transform = "rotate(0deg)";
      }
      prevDropdown
        .querySelector(".navbar_dropdwn-toggle")
        ?.setAttribute("aria-expanded", "false");
    }

    const nextChevron = nextDropdown.querySelector(".dropdown-chevron");
    if (nextChevron) {
      nextChevron.style.transition = `transform ${dur} ${ease}`;
      nextChevron.style.transform = "rotate(180deg)";
    }

    const toggleTransition = `background-color ${dur} ${ease}, color ${dur} ${ease}`;
    for (let i = 0; i < allToggles.length; i++) {
      allToggles[i].style.transition = toggleTransition;
    }
    applyTheme();

    dropdownPortal.style.transition = `height ${dur} ${ease}`;
    dropdownPortal.style.height = `${nextDropdownHeight}px`;
    setExpandedSpace(nextDropdownHeight, CONFIG.switchMs);

    nextDropdown
      .querySelector(".navbar_dropdwn-toggle")
      ?.setAttribute("aria-expanded", "true");

    const listToClean = prevList;
    const prevElementsToReset = { ...prevElements };
    switchTimeout = setTimeout(() => {
      if (listToClean && currentList !== listToClean) {
        listToClean.style.transition = "none";
        listToClean.style.opacity = "0";
        listToClean.style.visibility = "hidden";
        listToClean.style.pointerEvents = "none";

        for (const selector in prevElementsToReset) {
          const el = prevElementsToReset[selector];
          if (el) {
            el.style.transition = "none";
            el.style.opacity = "1";
          }
        }
      }

      dropdownPortal.style.transition = "none";
      switchTimeout = null;
    }, CONFIG.switchMs + 50);
  }

  function closeMenu() {
    if (!isOpen) return;

    cancelClose();
    cancelPendingAnimations();

    const dropdown = currentDropdown;
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

    if (dropdown) {
      const chevron = dropdown.querySelector(".dropdown-chevron");
      if (chevron) chevron.style.transform = "rotate(0deg)";
      dropdown
        .querySelector(".navbar_dropdwn-toggle")
        ?.setAttribute("aria-expanded", "false");
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

  // =============================================
  // DESTROY
  // =============================================
  function destroy() {
    cancelClose();
    cancelPendingAnimations();
    clearTimeout(resizeTimeout);

    dropdownListMap.forEach((list, dropdown) => {
      if (list && dropdown && list.parentNode === dropdownPortal) {
        dropdown.appendChild(list);
      }
    });
    dropdownListMap.clear();

    for (let i = 0; i < boundEventListeners.length; i++) {
      const { el, event, handler, options } = boundEventListeners[i];
      el.removeEventListener(event, handler, options);
    }
    boundEventListeners = [];

    if (smoothScrollUnsub) {
      smoothScrollUnsub();
      smoothScrollUnsub = null;
    }

    if (styleElement && styleElement.parentNode) {
      styleElement.parentNode.removeChild(styleElement);
      styleElement = null;
    }

    if (pageOverlay && pageOverlay.parentNode) {
      pageOverlay.parentNode.removeChild(pageOverlay);
    }

    if (dropdownPortal && dropdownPortal.parentNode) {
      dropdownPortal.parentNode.removeChild(dropdownPortal);
    }

    if (measureContainer && measureContainer.parentNode) {
      measureContainer.parentNode.removeChild(measureContainer);
    }

    if (navbarContainer) {
      navbarContainer.style.paddingBottom = originalPaddingBottom;
      navbarContainer.style.marginBottom = originalMarginBottom;
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

    window.__navbarAnimationInitialized = false;
  }

  window.__navbarAnimationDestroy = destroy;

  // =============================================
  // START — Desktop only (992px+)
  // =============================================
  const DESKTOP_MIN = SHARED.DESKTOP_MIN;

  function handleViewport() {
    if (window.innerWidth >= DESKTOP_MIN) {
      if (!window.__navbarAnimationInitialized) init();
    } else {
      if (
        window.__navbarAnimationInitialized &&
        window.__navbarAnimationDestroy
      ) {
        window.__navbarAnimationDestroy();
      }
    }
  }

  function onReady() {
    handleViewport();
    window.addEventListener("resize", () => {
      clearTimeout(window.__navbarViewportTimeout);
      window.__navbarViewportTimeout = setTimeout(handleViewport, 200);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }
})();


/* ═══════════════════════════════════════════════
   MOBILE NAV — ≤991px
   Class-based state, GPU-only transforms, iOS-optimized
   ═══════════════════════════════════════════════ */

(() => {
  "use strict";

  const SHARED = window.__watchDutyNavShared;

  if (window.__mobileNavInitialized) {
    window.__mobileNavDestroy?.();
  }
  window.__mobileNavInitialized = true;

  const MOBILE_MAX = SHARED.MOBILE_MAX;
  const SCROLL_THRESHOLD = SHARED.SCROLL_THRESHOLD;

  // Snappy mobile timings — not too fast (feels unfinished), not too slow
  const OPEN_MS = 280;
  const CLOSE_MS = 220;
  const DD_OPEN_MS = 240;
  const DD_CLOSE_MS = 200;
  const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

  const STATE = { CLOSED: 0, OPEN: 1 };
  let state = STATE.CLOSED;
  let isScrolled = false;

  const body = document.body;
  const navButton = document.querySelector(".w-nav-button");
  const navbarComponent = document.querySelector(".navbar_component");
  const navbarContainer = document.querySelector(".navbar_container");
  const navbarMenu = document.querySelector(".navbar_menu");
  const navOverlay = document.querySelector(".w-nav-overlay");

  if (!navButton || !navbarContainer) {
    window.__mobileNavInitialized = false;
    return;
  }

  // ── Cleanup tracking ──
  const observers = [];
  const trackedListeners = [];
  const dropdownResets = [];

  function addL(el, event, handler, options) {
    if (!el) return;
    el.addEventListener(event, handler, options);
    trackedListeners.push({ el, event, handler, options });
  }

  function trackObserver(o) {
    observers.push(o);
    return o;
  }

  function isMobile() {
    return window.innerWidth <= MOBILE_MAX;
  }

  // ── STATIC STYLESHEET ──
  // Everything is class-based. No JS-driven style values.
  // Only opacity + transform animate → GPU-composited on iOS WebKit.
  // No backdrop-filter on mobile — kills performance.
  const styleEl = document.createElement("style");
  styleEl.id = "mobile-nav-styles";
  styleEl.textContent = `
@media (max-width: ${MOBILE_MAX}px) {
  /* ── Full-viewport menu breakout ── */
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

    /* Menu fade — GPU compositing */
    opacity: 0;
    pointer-events: none;
    transition: opacity ${CLOSE_MS}ms ${EASE};
    will-change: opacity, transform;
  }

  /* ── OPEN state — menu visible ── */
  .navbar_component.is-m-open .navbar_menu {
    opacity: 1;
    pointer-events: auto;
    transition: opacity ${OPEN_MS}ms ${EASE};
  }

  /* ── Base component styling ── */
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
  .navbar_container {
    background-color: transparent;
    transition: background-color ${CLOSE_MS}ms ${EASE};
    will-change: background-color;
  }

  /* ── Opening: switch transition duration ── */
  .navbar_component.is-m-open {
    transition: background-color ${OPEN_MS}ms ${EASE};
  }
  .navbar_component.is-m-open .navbar_container {
    transition: background-color ${OPEN_MS}ms ${EASE};
  }

  /* ── DARK state (scrolled OR menu open) ── */
  .navbar_component.is-m-open,
  .navbar_container.is-m-dark {
    background-color: #000 !important;
  }

  /* Text/icon colors — all share the same transition rhythm */
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
      border-color ${CLOSE_MS}ms ${EASE};
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
      border-color ${OPEN_MS}ms ${EASE};
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

  /* ── DROPDOWNS inside mobile menu ── */
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
  .navbar_menu .navbar_dropdown-list.is-dd-open ~ * .dropdown-chevron,
  .navbar_menu .navbar_menu-dropdown.is-dd-open .dropdown-chevron {
    transform: rotate(180deg);
    transition: transform ${DD_OPEN_MS}ms ${EASE};
  }

  /* Lock dropdown interior colors — prevent Webflow w--open shifts */
  .navbar_menu .navbar_dropdwn-toggle,
  .navbar_menu .navbar_dropdwn-toggle *,
  .navbar_menu .navbar_dropdown-list,
  .navbar_menu .navbar_dropdown-list * {
    color: inherit !important;
    background-color: inherit !important;
  }

  /* ── Touch targets — kill tap delay & highlight ── */
  .w-nav-button,
  .navbar_dropdwn-toggle,
  .navbar_link {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  /* ── Body scroll lock ── */
  body.is-m-nav-open {
    overflow: hidden;
    position: fixed;
    width: 100%;
    top: var(--m-nav-scroll-y, 0);
  }
}
  `.trim();
  document.head.appendChild(styleEl);

  // ── Reduced motion ──
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  function updateMotion() {
    // CSS handles this via prefers-reduced-motion media query if added,
    // but the durations are fixed in the stylesheet. For true reduced
    // motion support, we'd need to swap the stylesheet — omitted for
    // simplicity since the timings are already short (~280ms max).
  }
  motionQuery?.addEventListener?.("change", updateMotion);

  // ── STATE APPLICATION ──
  // Single function, class-based. All animation is CSS-driven.
  function applyState() {
    if (!isMobile()) return;

    const menuOpen = state === STATE.OPEN;
    const dark = menuOpen || isScrolled;

    navbarComponent?.classList.toggle("is-m-open", menuOpen);
    navbarContainer.classList.toggle("is-m-dark", dark);
  }

  // ── SCROLL LOCK (iOS Safari-safe position:fixed technique) ──
  let scrollYOnOpen = 0;

  function lockBodyScroll() {
    scrollYOnOpen = window.scrollY;
    document.documentElement.style.setProperty(
      "--m-nav-scroll-y",
      `-${scrollYOnOpen}px`
    );
    body.classList.add("is-m-nav-open");
  }

  function unlockBodyScroll() {
    body.classList.remove("is-m-nav-open");
    document.documentElement.style.removeProperty("--m-nav-scroll-y");
    window.scrollTo(0, scrollYOnOpen);
  }

  // ── OPEN / CLOSE / TOGGLE ──
  // Instant state flip. CSS handles the animation.
  // No interruption logic needed — CSS transitions naturally interrupt
  // because they target the SAME property (opacity) with new values.
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
    dropdownResets.forEach((fn) => fn());
  }

  // ── EVENT BINDING ──
  // On iOS, event order is: touchstart → pointerdown → mousedown → click.
  // touchstart fires ~20-50ms FASTER than pointerdown on iOS, so we use it
  // as the primary trigger for touch, then dedupe the subsequent events.
  let lastTouchToggleAt = 0;
  const TOUCH_DEDUPE_MS = 600;

  // Prevent Webflow's own click handler from running at all on mobile.
  // We intercept at the earliest possible moment (touchstart) and block
  // every downstream event it would cascade into.
  addL(
    navButton,
    "touchstart",
    (e) => {
      if (!isMobile()) return;
      if (e.touches && e.touches.length !== 1) return; // ignore multi-touch

      lastTouchToggleAt = Date.now();

      // Fire toggle synchronously — no setTimeout, no rAF, nothing.
      // The class flip happens in the same tick as the touch.
      toggleMenu();

      // Stop every downstream event Webflow might act on
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true, passive: false }
  );

  // pointerdown fallback for stylus/pen (Apple Pencil on iPad)
  addL(
    navButton,
    "pointerdown",
    (e) => {
      if (!isMobile()) return;
      if (e.pointerType !== "pen") return; // touch already handled above
      if (e.button !== undefined && e.button !== 0) return;

      lastTouchToggleAt = Date.now();
      toggleMenu();
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true, passive: false }
  );

  // Swallow the synthetic click that follows touchstart on iOS
  addL(
    navButton,
    "click",
    (e) => {
      if (!isMobile()) return;

      // If we just handled a touch, swallow the click entirely
      if (Date.now() - lastTouchToggleAt < TOUCH_DEDUPE_MS) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Pure mouse click (no prior touch) — handle it here
      e.preventDefault();
      e.stopImmediatePropagation();
      toggleMenu();
    },
    { capture: true }
  );

  // Also swallow mousedown that comes from touch (Safari synthesizes it)
  addL(
    navButton,
    "mousedown",
    (e) => {
      if (!isMobile()) return;
      if (Date.now() - lastTouchToggleAt < TOUCH_DEDUPE_MS) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    { capture: true }
  );

  // Overlay tap-to-close
  if (navOverlay) {
    addL(
      navOverlay,
      "pointerdown",
      (e) => {
        if (!isMobile()) return;
        if (state !== STATE.OPEN) return;
        if (e.target === navOverlay) closeMenu();
      },
      { capture: true }
    );
  }

  // Tap any link inside menu → close
  if (navbarMenu) {
    addL(
      navbarMenu,
      "click",
      (e) => {
        if (!isMobile()) return;
        if (state !== STATE.OPEN) return;
        if (e.target.closest("a[href]")) {
          // Small delay so the link's navigation starts before we close
          setTimeout(closeMenu, 0);
        }
      },
      true
    );
  }

  // ── SCROLL ──
  let scrollTicking = false;
  addL(
    window,
    "scroll",
    () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        const was = isScrolled;
        isScrolled = window.scrollY > SCROLL_THRESHOLD;
        if (was !== isScrolled) applyState();
        scrollTicking = false;
      });
    },
    { passive: true }
  );

  // ── RESIZE ──
  addL(window, "resize", () => {
    if (!isMobile()) {
      // Crossed to desktop — clean up mobile state
      if (state === STATE.OPEN) {
        state = STATE.CLOSED;
        unlockBodyScroll();
      }
      navbarComponent?.classList.remove("is-m-open");
      navbarContainer.classList.remove("is-m-dark");
      resetAllDropdowns();
    } else {
      applyState();
    }
  });

  // ── WEBFLOW SYNC ──
  // Fallback only: if something else toggles w--open (keyboard, assistive tech,
  // Webflow reaching through our guards), mirror state. But don't react if we
  // JUST toggled — avoids feedback loop where our own handler triggers w--open
  // which triggers this observer which re-triggers our handler.
  trackObserver(
    new MutationObserver(() => {
      // Ignore mutations that happen within our own toggle window
      if (Date.now() - lastTouchToggleAt < TOUCH_DEDUPE_MS) return;

      const wfOpen = navButton.classList.contains("w--open");
      if (wfOpen && state === STATE.CLOSED) {
        openMenu();
      } else if (!wfOpen && state === STATE.OPEN) {
        closeMenu();
      }
    })
  ).observe(navButton, { attributes: true, attributeFilter: ["class"] });

  // ── DROPDOWNS INSIDE MENU ──
  // Webflow toggles w--open on .navbar_dropdown-list when its toggle is tapped.
  // We use that as our state signal — add/remove .is-dd-open class, CSS handles it.
  if (navbarMenu) {
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

      // Observe Webflow's w--open → sync our own class
      trackObserver(
        new MutationObserver(() => {
          if (!isMobile() || state !== STATE.OPEN) return;

          const nowOpen = list.classList.contains("w--open");
          if (nowOpen === ddOpen) return;
          ddOpen = nowOpen;
          clearTimeout(ddTimeout);

          if (ddOpen) {
            // Measure natural height, set it inline, let CSS animate to it
            const h = list.scrollHeight;
            list.classList.add("is-dd-open");
            dd.classList.add("is-dd-open");
            list.style.maxHeight = h + "px";

            // After transition, remove the cap so content can grow
            ddTimeout = setTimeout(() => {
              list.style.maxHeight = "none";
            }, DD_OPEN_MS + 20);
          } else {
            // Closing: set current height, then collapse to 0
            const h = list.scrollHeight;
            list.style.maxHeight = h + "px";
            // Force reflow so the next change animates from current height
            void list.offsetHeight;
            list.classList.remove("is-dd-open");
            dd.classList.remove("is-dd-open");
            list.style.maxHeight = "0";
          }
        })
      ).observe(list, { attributes: true, attributeFilter: ["class"] });
    });
  }

  // ── INIT ──
  isScrolled = window.scrollY > SCROLL_THRESHOLD;
  applyState();

  // ── FIRST-TAP WARMUP ──
  // iOS WebKit lazily creates GPU compositing layers and JIT-compiles JS on
  // first execution. This causes a noticeable stutter on the first real tap.
  // We pre-warm both by forcing a no-op state change cycle that promotes
  // the compositor layers and exercises the hot code path.
  function primeForFirstTap() {
    if (!isMobile()) return;

    // 1. Force layer promotion by triggering a transform on the menu.
    //    translateZ(0) forces the element onto its own GPU layer.
    if (navbarMenu) {
      navbarMenu.style.transform = "translate3d(0, 0, 0)";
      // Force a paint so the layer is actually created
      void navbarMenu.offsetHeight;
    }
    if (navbarComponent) {
      navbarComponent.style.transform = "translate3d(0, 0, 0)";
      void navbarComponent.offsetHeight;
    }

    // 2. JIT warmup: run the toggle logic against a throwaway mock target
    //    so V8/JSC sees the code path before the user triggers it.
    //    We don't actually flip state — just exercise the classList ops
    //    and getComputedStyle reads that happen on real toggle.
    try {
      const _ = navButton.classList.contains("w--open");
      const __ = navbarComponent?.classList.contains("is-m-open");
      const ___ = window.scrollY;
      void _; void __; void ___;
    } catch (e) { /* noop */ }

    // 3. Force a synchronous style recalc so the CSS transitions
    //    in the injected stylesheet are parsed and applied.
    if (navbarMenu) {
      getComputedStyle(navbarMenu).opacity;
      getComputedStyle(navbarMenu).transition;
    }
  }

  // Run warmup after first paint so it doesn't block initial render
  if (document.readyState === "complete") {
    requestAnimationFrame(primeForFirstTap);
  } else {
    window.addEventListener("load", () => {
      requestAnimationFrame(primeForFirstTap);
    }, { once: true });
  }

  // ── DESTROY ──
  window.__mobileNavDestroy = function destroy() {
    for (const o of observers) o.disconnect();
    observers.length = 0;
    for (const { el, event, handler, options } of trackedListeners) {
      el.removeEventListener(event, handler, options);
    }
    trackedListeners.length = 0;
    motionQuery?.removeEventListener?.("change", updateMotion);

    resetAllDropdowns();
    if (state === STATE.OPEN) unlockBodyScroll();

    styleEl?.parentNode?.removeChild(styleEl);
    navbarComponent?.classList.remove("is-m-open");
    navbarContainer.classList.remove("is-m-dark");

    window.__mobileNavInitialized = false;
  };
})();


/* ═══════════════════════════════════════════════
   MOBILE CTA — Platform-aware href
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

  // Initial pass
  findAndApply();

  // Re-apply when Webflow re-renders (Editor, CMS, dynamic content)
  if (window.__ctaHrefObserver) {
    window.__ctaHrefObserver.disconnect();
  }

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

  window.__ctaHrefObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
