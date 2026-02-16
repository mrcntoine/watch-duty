(function () {
  "use strict";

  // Prevent double initialization in Webflow
  if (window.__navbarAnimationInitialized) {
    if (window.__navbarAnimationDestroy) window.__navbarAnimationDestroy();
  }

  // =============================================
  // CONFIGURATION
  // =============================================
  const CONFIG = {
    scrollThreshold: 48,
    maxWidth: "84rem",

    borderRadius: "var(--_ui-styles---radius--xlarge)",
    borderRadiusPx: 20,

    ease: "cubic-bezier(0.86, 0, 0.07, 1)",
    openMs: 850,
    closeMs: 550,
    switchMs: 450,

    // Overlay
    overlayOpacity: 0.72,
    overlayBlurPx: 14,

    // Navbar backdrop blur
    navbarBlur: {
      top: "0px",
      scrolled: "12px",
      open: "16px",
    },

    // Hover intent
    closeDelayMs: 120,

    // App toggle hard rules
    appToggleBg: "var(--_primitives---colors--accent-primary)",
    appToggleText: "#1a1a1a",

    // Toggle border radius
    toggleRadiusPx: 12,

    // Touch breakpoint (max-width for touch/mobile behavior)
    touchBreakpoint: 991,

    // Close fallback buffer (ms added to animation duration for safety)
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

  // Reduced motion
  const prefersReducedMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  if (prefersReducedMotion) {
    CONFIG.openMs = 0;
    CONFIG.closeMs = 0;
    CONFIG.switchMs = 0;
    CONFIG.overlayBlurPx = 0;
    CONFIG.navbarBlur = { top: "0px", scrolled: "0px", open: "0px" };
  }

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

  // Store original spacing
  let originalPaddingBottom = null;
  let originalMarginBottom = null;
  let originalNavbarHeight = null;

  // Cleanup tracking
  let boundEventListeners = [];
  let styleElement = null;

  // Dropdown to list mapping
  let dropdownListMap = new Map();

  // Scroll optimization
  let lastScrollY = 0;
  let scrollTicking = false;

  // Height cache
  let dropdownHeightCache = new WeakMap();
  let resizeTimeout = null;

  // Animation state tracking
  let switchTimeout = null;
  let closeFallbackTimeout = null;

  // Touch detection
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

  // The key trick:
  // We increase padding-bottom to "contain" the dropdown inside the rounded/hidden container,
  // BUT we apply an equal negative margin-bottom so the page content does NOT get pushed down.
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

    // Detect touch capability
    isTouchDevice = detectTouch();

    // Store original spacing
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
    bindEvents();
    bindScrollListener();
    bindResizeListener();

    // Cache dropdown lists AFTER portal is created
    allDropdownLists = Array.from(
      dropdownPortal.querySelectorAll(".navbar_dropdown-list")
    );

    requestAnimationFrame(() => {
      applyTransitions(0);
      applyTheme();
      requestAnimationFrame(() => applyTransitions(CONFIG.closeMs));
    });
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

/* Navbar content elements - must stack above dropdown portal */
.navbar_logo-link,
.navbar_menu,
.navbar_button-wrapper{
  position: relative;
  z-index: 10;
}

/* Dropdown portal: absolute inside container, positioned below navbar content */
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

/* Hidden offscreen container for measuring dropdown heights without visual flash */
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

/* Overlay */
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

/* Toggle radius */
.navbar_dropdwn-toggle{
  border-radius: ${CONFIG.toggleRadiusPx}px !important;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.navbar_dropdwn-toggle.is-app{
  background-color: ${CONFIG.appToggleBg} !important;
  color: ${CONFIG.appToggleText} !important;
}

/* Force same background for right/app panes */
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

    // Position portal at the bottom of the original navbar content
    dropdownPortal.style.top = `${originalNavbarHeight}px`;

    // Move dropdown lists into the portal
    for (let i = 0; i < menuDropdowns.length; i++) {
      const dropdown = menuDropdowns[i];
      const list = dropdown.querySelector(".navbar_dropdown-list");
      if (list) {
        dropdownListMap.set(dropdown, list);
        dropdownPortal.appendChild(list);
      }
    }
  }

  /**
   * Offscreen container for measuring dropdown heights.
   * Cloning into this container avoids the fragile inline-style-swap
   * approach which could flash content if the browser paints mid-measure.
   */
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
    // --- Hover behavior (desktop only) ---
    addTrackedListener(navbarContainer, "pointerleave", (e) => {
      // Ignore pointer leave on touch — close is handled by tap-outside / overlay
      if (e.pointerType === "touch") return;
      if (!navbarContainer.contains(e.relatedTarget)) {
        requestClose();
      }
    });

    addTrackedListener(navbarContainer, "pointerenter", (e) => {
      if (e.pointerType === "touch") return;
      if (isOpen) cancelClose();
    });

    for (let i = 0; i < menuDropdowns.length; i++) {
      const dropdown = menuDropdowns[i];
      const toggle = dropdown.querySelector(".navbar_dropdwn-toggle");
      const list = getListForDropdown(dropdown);
      if (!toggle || !list) continue;

      // Desktop hover intent
      addTrackedListener(toggle, "pointerenter", (e) => {
        if (e.pointerType === "touch") return;
        cancelClose();
        if (!isOpen || currentDropdown !== dropdown) openOrSwitch(dropdown);
      });

      // Click/tap handler — works on both touch and desktop as a toggle
      addTrackedListener(toggle, "click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (isOpen && currentDropdown === dropdown) {
          closeMenu();
        } else {
          openOrSwitch(dropdown);
        }
      });

      // Keyboard accessibility
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

    // Global escape
    addTrackedListener(document, "keydown", (e) => {
      if (e.key === "Escape" && isOpen) closeMenu();
    });

    // Close on tap outside navbar (touch devices)
    addTrackedListener(
      document,
      "pointerdown",
      (e) => {
        if (!isOpen) return;
        // If the tap is outside the navbar container entirely, close
        if (!navbarContainer.contains(e.target) && !pageOverlay.contains(e.target)) {
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

  function bindResizeListener() {
    addTrackedListener(
      window,
      "resize",
      () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          dropdownHeightCache = new WeakMap();
          // Re-detect touch on resize (orientation changes, etc.)
          isTouchDevice = detectTouch();
          // Recalculate portal position
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
  /**
   * Measures dropdown list height using an offscreen clone.
   * This avoids the fragile pattern of swapping inline styles on
   * the live element, which can cause a visible flash if the browser
   * paints between style changes.
   */
  function measureListHeight(list) {
    const cached = dropdownHeightCache.get(list);
    if (cached !== undefined) return cached;

    // Clone into the offscreen measure container
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

  function resetAllLists(exceptList = null) {
    for (let i = 0; i < allDropdownLists.length; i++) {
      const list = allDropdownLists[i];
      if (list && list !== exceptList) {
        list.style.transition = "none";
        list.style.opacity = "0";
        list.style.visibility = "hidden";
        list.style.pointerEvents = "none";
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

    // Expand internally, but cancel layout impact with equal negative margin-bottom
    setExpandedSpace(dropdownHeight, CONFIG.openMs);

    // Fade in list content
    const dur = `${CONFIG.openMs}ms`;
    const ease = CONFIG.ease;
    list.style.transition = `opacity ${dur} ${ease}`;
    list.style.opacity = "1";
  }

  // Morphable content selectors (elements that should crossfade individually)
  const MORPH_SELECTORS = [
    ".dropdown-grid-left",
    ".dropdown-grid-right",
    ".dropdown-grid-app",
    ".dropdown-content-wrapper",
  ];

  function getMorphableElements(list) {
    const elements = {};
    for (const selector of MORPH_SELECTORS) {
      const el = list.querySelector(selector);
      if (el) elements[selector] = el;
    }
    return elements;
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

    // Get morphable elements from both lists
    const prevElements = prevList ? getMorphableElements(prevList) : {};
    const nextElements = getMorphableElements(nextList);

    // Immediately disable pointer events on previous list
    // to prevent the fading-out list from intercepting clicks
    if (prevList) {
      prevList.style.pointerEvents = "none";
    }

    // Prepare next list — visible but content hidden
    nextList.style.transition = "none";
    nextList.style.opacity = "1";
    nextList.style.visibility = "visible";
    nextList.style.pointerEvents = "auto";

    // Hide next list's morphable content initially
    for (const selector in nextElements) {
      const el = nextElements[selector];
      el.style.transition = "none";
      el.style.opacity = "0";
    }

    void nextList.offsetHeight;

    // Crossfade morphable elements
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

    // If prev list has no matching morphable elements, fade whole list
    if (prevList && Object.keys(prevElements).length === 0) {
      prevList.style.transition = `opacity ${dur} ${ease}`;
      prevList.style.opacity = "0";
    }

    // Chevron animations
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

    // Ensure theme + highlight updates
    const toggleTransition = `background-color ${dur} ${ease}, color ${dur} ${ease}`;
    for (let i = 0; i < allToggles.length; i++) {
      allToggles[i].style.transition = toggleTransition;
    }
    applyTheme();

    // Update portal height and internal expansion (still no layout impact)
    dropdownPortal.style.transition = `height ${dur} ${ease}`;
    dropdownPortal.style.height = `${nextDropdownHeight}px`;
    setExpandedSpace(nextDropdownHeight, CONFIG.switchMs);

    nextDropdown
      .querySelector(".navbar_dropdwn-toggle")
      ?.setAttribute("aria-expanded", "true");

    const listToClean = prevList;
    const prevElementsToReset = { ...prevElements };
    switchTimeout = setTimeout(() => {
      // Reset previous list
      if (listToClean && currentList !== listToClean) {
        listToClean.style.transition = "none";
        listToClean.style.opacity = "0";
        listToClean.style.visibility = "hidden";
        listToClean.style.pointerEvents = "none";

        // Reset morphable elements opacity for next time
        for (const selector in prevElementsToReset) {
          const el = prevElementsToReset[selector];
          if (el) {
            el.style.transition = "none";
            el.style.opacity = "1";
          }
        }
      }

      // Remove portal height transition
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

    // Collapse internal expansion and restore layout spacing
    setExpandedSpace(0, CONFIG.closeMs);

    // Single timeout-based cleanup — more reliable than transitionend
    // which can be missed if the element is detached, has zero duration,
    // or the specific property never fires.
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

    // Move dropdown lists back to their original parents
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

    // Reset navbar container spacing
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
  const DESKTOP_MIN = 992;

  function handleViewport() {
    if (window.innerWidth >= DESKTOP_MIN) {
      if (!window.__navbarAnimationInitialized) init();
    } else {
      if (window.__navbarAnimationInitialized && window.__navbarAnimationDestroy) {
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




(() => {
  "use strict";

  const MOBILE_MAX = 991;
  const SCROLL_THRESHOLD = 48;
  const EASE = "cubic-bezier(0.86, 0, 0.07, 1)";
  const OPEN_MS = 850;
  const CLOSE_MS = 550;

  /* Dropdown animation config */
  const DD_OPEN_MS = 450;
  const DD_CLOSE_MS = 350;
  const DD_EASE = "cubic-bezier(0.25, 0.46, 0.45, 0.94)";

  const STATE = { CLOSED: 0, OPENING: 1, OPEN: 2, CLOSING: 3 };
  let state = STATE.CLOSED;

  const body = document.body;
  const navButton = document.querySelector(".w-nav-button");
  const navbarComponent = document.querySelector(".navbar_component");
  const navbarContainer = document.querySelector(".navbar_container");
  const navbarMenu = document.querySelector(".navbar_menu");
  const navOverlay = document.querySelector(".w-nav-overlay");

  if (!navButton || !navbarContainer) return;

  let isScrolled = false;
  let scrollTicking = false;
  let closeTimeout = null;
  let openTimeout = null;
  let guardObservers = false;
  let allowNextClick = false;

  /* Dropdown reset functions collected here */
  const dropdownResets = [];

  /* ── Helpers ─────────────────────────────────── */

  function isMobile() {
    return window.innerWidth <= MOBILE_MAX;
  }

  function isLocked() {
    return state === STATE.OPENING || state === STATE.CLOSING;
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

  /* ── Injected Stylesheet ─────────────────────── */

  const style = document.createElement("style");
  style.id = "mobile-nav-styles";
  style.textContent = `
@media (max-width: ${MOBILE_MAX}px) {

  /* Full-viewport menu breakout */
  .w-nav-overlay {
    overflow: visible !important;
  }
  .navbar_menu {
    width: 100vw !important;
    max-width: none !important;
    margin-left: calc(-50vw + 50%) !important;
    box-sizing: border-box !important;
  }

  /* Navbar bg transitions */
  .navbar_component {
    border: none !important;
    border-bottom: none !important;
    box-shadow: none !important;
    outline: none !important;
    background-color: transparent !important;
    transform: none !important;
    transition: background-color ${CLOSE_MS}ms ${EASE} !important;
  }
  .navbar_component.is-mobile-open {
    background-color: #000 !important;
    transition: background-color ${OPEN_MS}ms ${EASE} !important;
  }

  .navbar_container {
    transition: background-color ${CLOSE_MS}ms ${EASE} !important;
  }
  .navbar_container.is-mobile-dark {
    background-color: #000 !important;
  }
  .navbar_container.is-mobile-opening {
    transition: background-color ${OPEN_MS}ms ${EASE} !important;
  }

  .navbar_logo,
  .navbar_link,
  .navbar_dropdwn-toggle {
    transition: color ${CLOSE_MS}ms ${EASE} !important;
  }
  .navbar_container.is-mobile-dark .navbar_logo,
  .navbar_container.is-mobile-dark .navbar_link,
  .navbar_container.is-mobile-dark .navbar_dropdwn-toggle {
    color: #ffffff !important;
  }
  .navbar_container.is-mobile-opening .navbar_logo,
  .navbar_container.is-mobile-opening .navbar_link,
  .navbar_container.is-mobile-opening .navbar_dropdwn-toggle {
    transition: color ${OPEN_MS}ms ${EASE} !important;
  }

  .menu-icon {
    transition: background-color ${CLOSE_MS}ms ${EASE} !important;
  }
  .navbar_container.is-mobile-dark .menu-icon {
    background-color: #202020 !important;
  }
  .navbar_container.is-mobile-opening .menu-icon {
    transition: background-color ${OPEN_MS}ms ${EASE} !important;
  }

  .menu-icon_line-top,
  .menu-icon_line-middle,
  .menu-icon_line-bottom {
    transition: background-color ${CLOSE_MS}ms ${EASE} !important;
  }
  .navbar_container.is-mobile-dark .menu-icon_line-top,
  .navbar_container.is-mobile-dark .menu-icon_line-middle,
  .navbar_container.is-mobile-dark .menu-icon_line-bottom {
    background-color: #fff !important;
  }
  .navbar_container.is-mobile-opening .menu-icon_line-top,
  .navbar_container.is-mobile-opening .menu-icon_line-middle,
  .navbar_container.is-mobile-opening .menu-icon_line-bottom {
    transition: background-color ${OPEN_MS}ms ${EASE} !important;
  }

  /* ── Dropdown slide animation base ──────────── */

  /* Force lists into the flow so we can animate height.
     Visibility is controlled via max-height + overflow. */
  .navbar_menu .navbar_dropdown-list {
    display: block !important;
    max-height: 0px !important;
    overflow: hidden !important;
  }

  /* Chevron base transition */
  .navbar_menu .dropdown-chevron {
    transition: transform ${DD_OPEN_MS}ms ${DD_EASE} !important;
    will-change: transform;
  }
}
  `.trim();
  document.head.appendChild(style);

  /* ── Hide / Cleanup ──────────────────────────── */

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
    allowNextClick = false;
    navbarComponent.classList.remove("is-mobile-open");
    navbarContainer.classList.remove("is-mobile-dark", "is-mobile-opening");
    resetAllDropdowns();
    stripAllInlineStyles();
    body.style.overflow = "";
  }

  /* ── Mutation Guards ─────────────────────────── */

  if (navOverlay) {
    new MutationObserver(() => {
      if (guardObservers || !isMobile()) return;
      if (state === STATE.OPEN || state === STATE.OPENING) lockOverlayAlive();
    }).observe(navOverlay, { attributes: true, attributeFilter: ["style"] });
  }

  if (navbarMenu) {
    new MutationObserver(() => {
      if (guardObservers || !isMobile()) return;
      if (state !== STATE.CLOSED) neutralizeMenuTransform();
    }).observe(navbarMenu, { attributes: true, attributeFilter: ["style"] });
  }

  /* ── Open ─────────────────────────────────────── */

  function openMobileMenu() {
    if (state !== STATE.CLOSED) return;

    clearAllTimers();
    state = STATE.OPENING;
    body.style.overflow = "hidden";

    resetAllDropdowns();

    guardObservers = true;
    lockOverlayAlive();
    neutralizeMenuTransform();
    guardObservers = false;

    navbarComponent.classList.add("is-mobile-open");
    navbarContainer.classList.add("is-mobile-dark", "is-mobile-opening");

    requestAnimationFrame(() => {
      if (state !== STATE.OPENING) return;

      if (navbarMenu) {
        navbarMenu.style.setProperty("opacity", "0", "important");
        navbarMenu.style.setProperty("pointer-events", "auto");
        void navbarMenu.offsetHeight;
        navbarMenu.style.setProperty(
          "transition",
          `opacity ${OPEN_MS}ms ${EASE}`,
          "important"
        );
        navbarMenu.style.setProperty("opacity", "1", "important");
      }
      neutralizeMenuTransform();
      requestAnimationFrame(neutralizeMenuTransform);
    });

    openTimeout = setTimeout(() => {
      if (state !== STATE.OPENING) return;
      state = STATE.OPEN;
    }, OPEN_MS);
  }

  /* ── Close ────────────────────────────────────── */

  function closeMobileMenu() {
    if (state !== STATE.OPEN) return;

    clearAllTimers();
    state = STATE.CLOSING;
    body.style.overflow = "hidden";

    resetAllDropdowns();

    guardObservers = true;
    lockOverlayAlive();

    if (navbarMenu) {
      neutralizeMenuTransform();
      navbarMenu.style.setProperty("pointer-events", "none");
      navbarMenu.style.setProperty(
        "transition",
        `opacity ${CLOSE_MS}ms ${EASE}`,
        "important"
      );
      navbarMenu.style.setProperty("opacity", "1", "important");
      void navbarMenu.offsetHeight;
    } else {
      void navbarContainer.offsetHeight;
    }

    navbarComponent.classList.remove("is-mobile-open");
    navbarContainer.classList.remove("is-mobile-opening");
    if (!isScrolled) navbarContainer.classList.remove("is-mobile-dark");

    if (navbarMenu) {
      navbarMenu.style.setProperty("opacity", "0", "important");
    }

    guardObservers = false;

    closeTimeout = setTimeout(() => {
      if (state !== STATE.CLOSING) return;
      state = STATE.CLOSED;
      forceHideMenu();
      body.style.overflow = navButton.classList.contains("w--open") ? "hidden" : "";
    }, CLOSE_MS + 50);
  }

  /* ── Scroll State ─────────────────────────────── */

  function applyScrollState() {
    if (!isMobile()) return;
    const menuOpen = state === STATE.OPEN || state === STATE.OPENING;
    const dark = menuOpen || isScrolled;
    navbarComponent.classList.toggle("is-mobile-open", menuOpen);
    navbarContainer.classList.toggle("is-mobile-dark", dark);
    navbarContainer.classList.toggle("is-mobile-opening", menuOpen);
  }

  /* ── Event Listeners ─────────────────────────── */

  navButton.addEventListener(
    "pointerdown",
    (e) => {
      if (!isMobile()) return;

      if (isLocked()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        allowNextClick = false;
        return;
      }

      if (state === STATE.OPEN) {
        closeMobileMenu();
        allowNextClick = true;
      } else if (state === STATE.CLOSED) {
        lockOverlayAlive();
        allowNextClick = true;
      }
    },
    { capture: true }
  );

  navButton.addEventListener(
    "click",
    (e) => {
      if (!isMobile()) return;

      if (allowNextClick) {
        allowNextClick = false;
        return;
      }

      e.preventDefault();
      e.stopImmediatePropagation();
    },
    { capture: true }
  );

  if (navbarMenu) {
    navbarMenu.addEventListener(
      "click",
      (e) => {
        if (!isMobile()) return;
        if (state !== STATE.OPEN) return;
        if (e.target.closest("a[href]")) closeMobileMenu();
      },
      true
    );
  }

  if (navOverlay) {
    navOverlay.addEventListener(
      "pointerdown",
      (e) => {
        if (!isMobile()) return;
        if (state !== STATE.OPEN) return;
        if (e.target === navOverlay) closeMobileMenu();
      },
      true
    );
  }

  /* ── Webflow State Sync ──────────────────────── */

  new MutationObserver(() => {
    if (isLocked()) return;

    const nowOpen = navButton.classList.contains("w--open");
    body.style.overflow = nowOpen || state === STATE.CLOSING ? "hidden" : "";

    if (nowOpen && state === STATE.CLOSED) {
      openMobileMenu();
    } else if (!nowOpen && state === STATE.OPEN) {
      closeMobileMenu();
    }

    requestAnimationFrame(() => {
      neutralizeMenuTransform();
      requestAnimationFrame(neutralizeMenuTransform);
    });
  }).observe(navButton, { attributes: true, attributeFilter: ["class"] });

  /* ── Scroll ──────────────────────────────────── */

  window.addEventListener(
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

  /* ── Resize ──────────────────────────────────── */

  window.addEventListener("resize", () => {
    if (!isMobile()) {
      clearMobileStyles();
    } else {
      neutralizeMenuTransform();
    }
  });

  /* ── Dropdown Slide Animations ───────────────── */

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

      new MutationObserver(() => {
        if (!isMobile()) return;
        if (state === STATE.CLOSED || state === STATE.CLOSING) return;

        const nowOpen = list.classList.contains("w--open");
        if (nowOpen === ddOpen) return;
        ddOpen = nowOpen;
        clearTimeout(ddTimeout);

        if (ddOpen) {
          /* ── Opening ───────────────────────────── */

          // Snap to 0 without transition so we can measure.
          list.style.setProperty("transition", "none", "important");
          list.style.setProperty("max-height", "0px", "important");
          list.style.setProperty("overflow", "hidden", "important");
          void list.offsetHeight;

          const h = list.scrollHeight;

          // Animate to measured height.
          list.style.setProperty(
            "transition",
            `max-height ${DD_OPEN_MS}ms ${DD_EASE}`,
            "important"
          );
          list.style.setProperty("max-height", h + "px", "important");

          // Rotate chevron.
          if (chevron) {
            chevron.style.setProperty(
              "transition",
              `transform ${DD_OPEN_MS}ms ${DD_EASE}`,
              "important"
            );
            chevron.style.setProperty("transform", "rotate(180deg)", "important");
          }

          // After animation, set max-height to none so content isn't clipped
          // if it changes dynamically.
          ddTimeout = setTimeout(() => {
            list.style.setProperty("max-height", "none", "important");
            list.style.removeProperty("overflow");
          }, DD_OPEN_MS + 20);

        } else {
          /* ── Closing ───────────────────────────── */

          // Snap max-height to current actual height (from "none") so the
          // transition has a concrete start value.
          const h = list.scrollHeight;
          list.style.setProperty("transition", "none", "important");
          list.style.setProperty("max-height", h + "px", "important");
          list.style.setProperty("overflow", "hidden", "important");
          void list.offsetHeight;

          // Animate to 0.
          list.style.setProperty(
            "transition",
            `max-height ${DD_CLOSE_MS}ms ${DD_EASE}`,
            "important"
          );
          list.style.setProperty("max-height", "0px", "important");

          // Rotate chevron back.
          if (chevron) {
            chevron.style.setProperty(
              "transition",
              `transform ${DD_CLOSE_MS}ms ${DD_EASE}`,
              "important"
            );
            chevron.style.setProperty("transform", "rotate(0deg)", "important");
          }
        }
      }).observe(list, { attributes: true, attributeFilter: ["class"] });
    });
  }

  /* ── Init ─────────────────────────────────────── */

  isScrolled = window.scrollY > SCROLL_THRESHOLD;
  applyScrollState();
  neutralizeMenuTransform();
})();
