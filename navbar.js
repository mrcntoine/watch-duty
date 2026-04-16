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
   ═══════════════════════════════════════════════ */

(() => {
  "use strict";

  const SHARED = window.__watchDutyNavShared;

  // Idempotency guard for Webflow Editor re-execution
  if (window.__mobileNavInitialized) {
    window.__mobileNavDestroy?.();
  }
  window.__mobileNavInitialized = true;

  const MOBILE_MAX = SHARED.MOBILE_MAX;
  const SCROLL_THRESHOLD = SHARED.SCROLL_THRESHOLD;

  // ── MOBILE-TUNED TIMINGS ────────────────────────
  // Faster than desktop (850/550) — mobile users expect snap
  const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"; // Apple-style out-cubic
  const BASE_OPEN_MS = 320;
  const BASE_CLOSE_MS = 260;

  // Dropdown animation — even snappier, same ease
  const BASE_DD_OPEN_MS = 280;
  const BASE_DD_CLOSE_MS = 220;
  const DD_EASE = EASE;

  let OPEN_MS = BASE_OPEN_MS;
  let CLOSE_MS = BASE_CLOSE_MS;
  let DD_OPEN_MS = BASE_DD_OPEN_MS;
  let DD_CLOSE_MS = BASE_DD_CLOSE_MS;

  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  function applyMotion() {
    const reduce = !!motionQuery?.matches;
    OPEN_MS = reduce ? 0 : BASE_OPEN_MS;
    CLOSE_MS = reduce ? 0 : BASE_CLOSE_MS;
    DD_OPEN_MS = reduce ? 0 : BASE_DD_OPEN_MS;
    DD_CLOSE_MS = reduce ? 0 : BASE_DD_CLOSE_MS;
    refreshStyles();
  }

  const STATE = { CLOSED: 0, OPENING: 1, OPEN: 2, CLOSING: 3 };
  let state = STATE.CLOSED;

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

  let isScrolled = false;
  let scrollTicking = false;
  let closeTimeout = null;
  let openTimeout = null;
  let guardObservers = false;

  // Track last pointerdown time to dedupe the synthetic click that follows
  let lastPointerDownAt = 0;
  const CLICK_DEDUPE_MS = 500;

  const dropdownResets = [];

  const observers = [];
  const trackedListeners = [];

  function addTrackedListener(el, event, handler, options) {
    if (!el) return;
    el.addEventListener(event, handler, options);
    trackedListeners.push({ el, event, handler, options });
  }

  function trackObserver(observer) {
    observers.push(observer);
    return observer;
  }

  // Helpers
  function isMobile() {
    return window.innerWidth <= MOBILE_MAX;
  }

  function neutralizeMenuTransform() {
    if (!navbarMenu) return;
    if (!isMobile()) {
      navbarMenu.style.removeProperty("transform");
      return;
    }
    navbarMenu.style.setProperty("transform", "none", "important");
  }

  function lockOverlayAlive() {
    if (!navOverlay) return;
    navOverlay.style.setProperty("display", "block", "important");
    navOverlay.style.setProperty("height", "auto", "important");
    navOverlay.style.setProperty("transition", "none", "important");
    navOverlay.style.setProperty("transform", "none", "important");
  }

  function clearAllTimers() {
    clearTimeout(closeTimeout);
    clearTimeout(openTimeout);
    closeTimeout = null;
    openTimeout = null;
  }

  function resetAllDropdowns() {
    dropdownResets.forEach((fn) => fn());
  }

  // Injected Stylesheet
  // KEY CHANGE: All color-changing elements inside the menu (navbar bg, links,
  // dropdown toggles, dropdown lists) share the SAME duration/ease so everything
  // animates together. Open state uses OPEN_MS, close state uses CLOSE_MS.
  let styleEl = null;
  function refreshStyles() {
    const existing = document.getElementById("mobile-nav-styles");
    if (existing) existing.remove();

    styleEl = document.createElement("style");
    styleEl.id = "mobile-nav-styles";
    styleEl.textContent = `
@media (max-width: ${MOBILE_MAX}px) {
  .w-nav-overlay { overflow: visible !important; }
  .navbar_menu {
    width: 100vw !important;
    max-width: none !important;
    margin-left: calc(-50vw + 50%) !important;
    box-sizing: border-box !important;
  }

  /* ── SYNC: all bg/color transitions use same duration ── */
  .navbar_component,
  .navbar_container,
  .navbar_logo,
  .navbar_link,
  .navbar_dropdwn-toggle,
  .navbar_container .button.is-mobile,
  .menu-icon,
  .menu-icon_line-top,
  .menu-icon_line-middle,
  .menu-icon_line-bottom,
  .navbar_dropdown-list,
  .navbar_dropdown-list * {
    transition:
      background-color ${CLOSE_MS}ms ${EASE},
      color ${CLOSE_MS}ms ${EASE},
      border-color ${CLOSE_MS}ms ${EASE} !important;
  }

  /* Opening state — everything uses OPEN_MS instead */
  .navbar_container.is-mobile-opening,
  .navbar_container.is-mobile-opening .navbar_logo,
  .navbar_container.is-mobile-opening .navbar_link,
  .navbar_container.is-mobile-opening .navbar_dropdwn-toggle,
  .navbar_container.is-mobile-opening .button.is-mobile,
  .navbar_container.is-mobile-opening .menu-icon,
  .navbar_container.is-mobile-opening .menu-icon_line-top,
  .navbar_container.is-mobile-opening .menu-icon_line-middle,
  .navbar_container.is-mobile-opening .menu-icon_line-bottom,
  .navbar_component.is-mobile-open {
    transition:
      background-color ${OPEN_MS}ms ${EASE},
      color ${OPEN_MS}ms ${EASE},
      border-color ${OPEN_MS}ms ${EASE} !important;
  }

  /* Base (closed/top) appearance */
  .navbar_component {
    border: none !important;
    border-bottom: none !important;
    box-shadow: none !important;
    outline: none !important;
    background-color: transparent !important;
    transform: none !important;
  }

  /* Dark state — applied when menu open OR scrolled */
  .navbar_component.is-mobile-open {
    background-color: #000 !important;
  }
  .navbar_container.is-mobile-dark {
    background-color: #000 !important;
  }
  .navbar_container.is-mobile-dark .navbar_logo,
  .navbar_container.is-mobile-dark .navbar_link,
  .navbar_container.is-mobile-dark .navbar_dropdwn-toggle {
    color: #ffffff !important;
  }
  .navbar_container.is-mobile-dark .button.is-mobile {
    color: #fff !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
  }
  .navbar_container.is-mobile-dark .menu-icon {
    background-color: #202020 !important;
  }
  .navbar_container.is-mobile-dark .menu-icon_line-top,
  .navbar_container.is-mobile-dark .menu-icon_line-middle,
  .navbar_container.is-mobile-dark .menu-icon_line-bottom {
    background-color: #fff !important;
  }

  /* Menu fade uses same OPEN_MS / CLOSE_MS — stays in sync */
  .navbar_menu {
    transition: opacity ${CLOSE_MS}ms ${EASE} !important;
  }
  .navbar_component.is-mobile-open .navbar_menu {
    transition: opacity ${OPEN_MS}ms ${EASE} !important;
  }

  /* Dropdown slide */
  .navbar_menu .navbar_dropdown-list {
    display: block !important;
    max-height: 0px !important;
    overflow: hidden !important;
  }
  .navbar_menu .dropdown-chevron {
    transition: transform ${DD_OPEN_MS}ms ${DD_EASE} !important;
    will-change: transform;
  }

  /* Lock dropdown colors — prevent Webflow w--open from shifting them */
  .navbar_menu .navbar_dropdwn-toggle,
  .navbar_menu .navbar_dropdwn-toggle *,
  .navbar_menu .navbar_dropdown-list,
  .navbar_menu .navbar_dropdown-list * {
    color: inherit !important;
    background-color: inherit !important;
  }

  /* Tappable targets need no tap-highlight flash */
  .w-nav-button,
  .navbar_dropdwn-toggle {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
}
    `.trim();
    document.head.appendChild(styleEl);
  }
  refreshStyles();

  motionQuery?.addEventListener?.("change", applyMotion);

  // Hide / Cleanup
  function forceHideMenu() {
    if (navbarMenu) {
      navbarMenu.style.setProperty("opacity", "0", "important");
      navbarMenu.style.setProperty("pointer-events", "none");
      navbarMenu.style.removeProperty("transition");
    }
    if (navOverlay) {
      navOverlay.style.setProperty("display", "none", "important");
      navOverlay.style.removeProperty("height");
      navOverlay.style.removeProperty("transition");
      navOverlay.style.removeProperty("transform");
    }
  }

  function stripAllInlineStyles() {
    if (navbarMenu) {
      navbarMenu.style.removeProperty("opacity");
      navbarMenu.style.removeProperty("transition");
      navbarMenu.style.removeProperty("pointer-events");
      navbarMenu.style.removeProperty("transform");
    }
    if (navOverlay) {
      navOverlay.style.removeProperty("display");
      navOverlay.style.removeProperty("height");
      navOverlay.style.removeProperty("transition");
      navOverlay.style.removeProperty("transform");
    }
  }

  function clearMobileStyles() {
    clearAllTimers();
    state = STATE.CLOSED;
    guardObservers = false;
    navbarComponent?.classList.remove("is-mobile-open");
    navbarContainer.classList.remove("is-mobile-opening");
    resetAllDropdowns();
    stripAllInlineStyles();
    body.style.overflow = "";
    applyScrollState();
  }

  // Mutation Guards
  if (navOverlay) {
    trackObserver(
      new MutationObserver(() => {
        if (guardObservers || !isMobile()) return;
        if (state === STATE.OPEN || state === STATE.OPENING) lockOverlayAlive();
      })
    ).observe(navOverlay, { attributes: true, attributeFilter: ["style"] });
  }

  if (navbarMenu) {
    trackObserver(
      new MutationObserver(() => {
        if (guardObservers || !isMobile()) return;
        if (state !== STATE.CLOSED) neutralizeMenuTransform();
      })
    ).observe(navbarMenu, { attributes: true, attributeFilter: ["style"] });
  }

  // ── OPEN ──────────────────────────────────────
  // Interruptible: if called during CLOSING, snaps to OPENING mid-animation
  function openMobileMenu() {
    if (state === STATE.OPEN || state === STATE.OPENING) return;

    clearAllTimers();
    const wasClosing = state === STATE.CLOSING;
    state = STATE.OPENING;
    body.style.overflow = "hidden";

    resetAllDropdowns();

    guardObservers = true;
    lockOverlayAlive();
    neutralizeMenuTransform();
    guardObservers = false;

    navbarComponent.classList.add("is-mobile-open");
    navbarContainer.classList.add("is-mobile-dark", "is-mobile-opening");

    if (navbarMenu) {
      navbarMenu.style.setProperty("pointer-events", "auto");

      if (wasClosing) {
        // Interrupt: keep current opacity, just retarget to 1
        // Computed style captures wherever the animation currently is
        const currentOpacity = getComputedStyle(navbarMenu).opacity;
        navbarMenu.style.setProperty("transition", "none", "important");
        navbarMenu.style.setProperty("opacity", currentOpacity, "important");
        void navbarMenu.offsetHeight;
      } else {
        navbarMenu.style.setProperty("opacity", "0", "important");
        void navbarMenu.offsetHeight;
      }

      navbarMenu.style.setProperty(
        "transition",
        `opacity ${OPEN_MS}ms ${EASE}`,
        "important"
      );
      navbarMenu.style.setProperty("opacity", "1", "important");
    }

    neutralizeMenuTransform();
    requestAnimationFrame(neutralizeMenuTransform);

    openTimeout = setTimeout(() => {
      if (state !== STATE.OPENING) return;
      state = STATE.OPEN;
    }, OPEN_MS);
  }

  // ── CLOSE ─────────────────────────────────────
  // Interruptible: if called during OPENING, snaps to CLOSING mid-animation
  function closeMobileMenu() {
    if (state === STATE.CLOSED || state === STATE.CLOSING) return;

    clearAllTimers();
    const wasOpening = state === STATE.OPENING;
    state = STATE.CLOSING;
    body.style.overflow = "hidden";

    resetAllDropdowns();

    guardObservers = true;
    lockOverlayAlive();

    if (navbarMenu) {
      neutralizeMenuTransform();
      navbarMenu.style.setProperty("pointer-events", "none");

      if (wasOpening) {
        // Interrupt: capture current opacity mid-open, reverse to 0
        const currentOpacity = getComputedStyle(navbarMenu).opacity;
        navbarMenu.style.setProperty("transition", "none", "important");
        navbarMenu.style.setProperty("opacity", currentOpacity, "important");
        void navbarMenu.offsetHeight;
      } else {
        navbarMenu.style.setProperty("opacity", "1", "important");
        void navbarMenu.offsetHeight;
      }

      navbarMenu.style.setProperty(
        "transition",
        `opacity ${CLOSE_MS}ms ${EASE}`,
        "important"
      );
      navbarMenu.style.setProperty("opacity", "0", "important");
    }

    navbarComponent.classList.remove("is-mobile-open");
    navbarContainer.classList.remove("is-mobile-opening");
    if (!isScrolled) navbarContainer.classList.remove("is-mobile-dark");

    guardObservers = false;

    closeTimeout = setTimeout(() => {
      if (state !== STATE.CLOSING) return;
      state = STATE.CLOSED;
      forceHideMenu();
      body.style.overflow = navButton.classList.contains("w--open")
        ? "hidden"
        : "";
    }, CLOSE_MS + 20);
  }

  function toggleMobileMenu() {
    if (state === STATE.OPEN || state === STATE.OPENING) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  }

  // Scroll State
  function applyScrollState() {
    if (!isMobile()) return;
    const menuOpen = state === STATE.OPEN || state === STATE.OPENING;
    const dark = menuOpen || isScrolled;
    navbarComponent?.classList.toggle("is-mobile-open", menuOpen);
    navbarContainer.classList.toggle("is-mobile-dark", dark);
    navbarContainer.classList.toggle("is-mobile-opening", menuOpen);
  }

  // ── EVENT LISTENERS ───────────────────────────
  // pointerdown is the primary trigger — no 300ms tap delay.
  // click is the fallback for non-touch (mouse in responsive preview).
  addTrackedListener(
    navButton,
    "pointerdown",
    (e) => {
      if (!isMobile()) return;

      // Only primary button / primary touch
      if (e.button !== undefined && e.button !== 0) return;

      lastPointerDownAt = Date.now();

      // Fire immediately — interruption logic handles in-flight animations
      toggleMobileMenu();

      // Stop Webflow's default handler from also firing on the synthetic click
      e.preventDefault();
    },
    { capture: true }
  );

  addTrackedListener(
    navButton,
    "click",
    (e) => {
      if (!isMobile()) return;

      // If this click follows a pointerdown we just handled, swallow it
      if (Date.now() - lastPointerDownAt < CLICK_DEDUPE_MS) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Mouse-only path (no prior pointerdown) — treat as toggle
      e.preventDefault();
      e.stopImmediatePropagation();
      toggleMobileMenu();
    },
    { capture: true }
  );

  // Clean up stale pointerdown flag if gesture is canceled
  addTrackedListener(
    navButton,
    "pointercancel",
    () => {
      lastPointerDownAt = 0;
    },
    { capture: true }
  );

  if (navbarMenu) {
    addTrackedListener(
      navbarMenu,
      "click",
      (e) => {
        if (!isMobile()) return;
        if (state !== STATE.OPEN && state !== STATE.OPENING) return;
        if (e.target.closest("a[href]")) closeMobileMenu();
      },
      true
    );
  }

  if (navOverlay) {
    addTrackedListener(
      navOverlay,
      "pointerdown",
      (e) => {
        if (!isMobile()) return;
        if (state !== STATE.OPEN && state !== STATE.OPENING) return;
        if (e.target === navOverlay) closeMobileMenu();
      },
      true
    );
  }

  // Webflow State Sync — observe w--open class on nav button
  // (only acts when state is terminal, so our own toggles aren't fought)
  trackObserver(
    new MutationObserver(() => {
      const nowOpen = navButton.classList.contains("w--open");
      body.style.overflow =
        nowOpen || state === STATE.CLOSING ? "hidden" : "";

      if (nowOpen && state === STATE.CLOSED) {
        openMobileMenu();
      } else if (!nowOpen && state === STATE.OPEN) {
        closeMobileMenu();
      }

      requestAnimationFrame(() => {
        neutralizeMenuTransform();
        requestAnimationFrame(neutralizeMenuTransform);
      });
    })
  ).observe(navButton, { attributes: true, attributeFilter: ["class"] });

  // Scroll
  addTrackedListener(
    window,
    "scroll",
    () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        const was = isScrolled;
        isScrolled = window.scrollY > SCROLL_THRESHOLD;
        if (was !== isScrolled) applyScrollState();
        scrollTicking = false;
      });
    },
    { passive: true }
  );

  // Resize
  addTrackedListener(window, "resize", () => {
    if (!isMobile()) {
      clearMobileStyles();
    } else {
      neutralizeMenuTransform();
      applyScrollState();
    }
  });

  // ── DROPDOWN SLIDE ANIMATIONS ────────────────
  if (navbarMenu) {
    const allDropdowns = navbarMenu.querySelectorAll(".navbar_menu-dropdown");

    allDropdowns.forEach((dd) => {
      const list = dd.querySelector(".navbar_dropdown-list");
      const chevron = dd.querySelector(".dropdown-chevron");
      if (!list) return;

      let ddOpen = false;
      let ddTimeout = null;

      function resetDropdown() {
        clearTimeout(ddTimeout);
        ddOpen = false;
        list.style.removeProperty("max-height");
        list.style.removeProperty("overflow");
        list.style.removeProperty("transition");
        if (chevron) {
          chevron.style.removeProperty("transform");
          chevron.style.removeProperty("transition");
        }
      }

      dropdownResets.push(resetDropdown);

      trackObserver(
        new MutationObserver(() => {
          if (!isMobile()) return;
          if (state === STATE.CLOSED || state === STATE.CLOSING) return;

          const nowOpen = list.classList.contains("w--open");
          if (nowOpen === ddOpen) return;
          ddOpen = nowOpen;
          clearTimeout(ddTimeout);

          if (ddOpen) {
            list.style.setProperty("transition", "none", "important");
            list.style.setProperty("max-height", "0px", "important");
            list.style.setProperty("overflow", "hidden", "important");
            void list.offsetHeight;

            const h = list.scrollHeight;

            list.style.setProperty(
              "transition",
              `max-height ${DD_OPEN_MS}ms ${DD_EASE}`,
              "important"
            );
            list.style.setProperty("max-height", h + "px", "important");

            if (chevron) {
              chevron.style.setProperty(
                "transition",
                `transform ${DD_OPEN_MS}ms ${DD_EASE}`,
                "important"
              );
              chevron.style.setProperty(
                "transform",
                "rotate(180deg)",
                "important"
              );
            }

            ddTimeout = setTimeout(() => {
              list.style.setProperty("max-height", "none", "important");
              list.style.removeProperty("overflow");
            }, DD_OPEN_MS + 20);
          } else {
            const h = list.scrollHeight;
            list.style.setProperty("transition", "none", "important");
            list.style.setProperty("max-height", h + "px", "important");
            list.style.setProperty("overflow", "hidden", "important");
            void list.offsetHeight;

            list.style.setProperty(
              "transition",
              `max-height ${DD_CLOSE_MS}ms ${DD_EASE}`,
              "important"
            );
            list.style.setProperty("max-height", "0px", "important");

            if (chevron) {
              chevron.style.setProperty(
                "transition",
                `transform ${DD_CLOSE_MS}ms ${DD_EASE}`,
                "important"
              );
              chevron.style.setProperty(
                "transform",
                "rotate(0deg)",
                "important"
              );
            }
          }
        })
      ).observe(list, { attributes: true, attributeFilter: ["class"] });
    });
  }

  // Init
  isScrolled = window.scrollY > SCROLL_THRESHOLD;
  applyScrollState();
  neutralizeMenuTransform();

  // Destroy
  window.__mobileNavDestroy = function destroy() {
    clearAllTimers();

    for (const obs of observers) obs.disconnect();
    observers.length = 0;

    for (const { el, event, handler, options } of trackedListeners) {
      el.removeEventListener(event, handler, options);
    }
    trackedListeners.length = 0;

    motionQuery?.removeEventListener?.("change", applyMotion);

    resetAllDropdowns();
    stripAllInlineStyles();

    styleEl?.parentNode?.removeChild(styleEl);
    styleEl = null;

    navbarComponent?.classList.remove("is-mobile-open");
    navbarContainer.classList.remove("is-mobile-dark", "is-mobile-opening");
    body.style.overflow = "";

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
