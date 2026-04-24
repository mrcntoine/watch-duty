(function () {
  "use strict";

  if (window.__navbarAnimationInitialized) {
    if (window.__navbarAnimationDestroy) window.__navbarAnimationDestroy();
  }

  const CONFIG = {
    desktopMin: 992,
    touchBreakpoint: 991,
    scrollThreshold: 48,
    maxWidth: "84rem",

    borderRadiusPx: 20,
    toggleRadiusPx: 12,

    ease: "cubic-bezier(0.86, 0, 0.07, 1)",
    openMs: 850,
    closeMs: 550,
    switchMs: 450,
    closeDelayMs: 120,
    closeFallbackBuffer: 150,

    overlayOpacity: 0.72,
    overlayBlurPx: 14,

    navbarBlur: {
      top: "0px",
      scrolled: "12px",
      open: "16px",
    },

    appToggleBg: "var(--_primitives---colors--accent-primary)",
    appToggleText: "#1a1a1a",

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

    darkVariantColors: {
      top: {
        navbarBg: "var(--_primitives---colors--dark-tertiary)",
        textColor: "var(--color-scheme-1--text-light)",
        elementBg: "rgba(255, 255, 255, 0.1)",
      },
    },

    mobileDropdown: {
      openMs: 450,
      closeMs: 350,
      ease: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    },
  };

  const prefersReducedMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)"
  )?.matches;

  if (prefersReducedMotion) {
    CONFIG.openMs = 0;
    CONFIG.closeMs = 0;
    CONFIG.switchMs = 0;
    CONFIG.overlayBlurPx = 0;
    CONFIG.mobileDropdown.openMs = 0;
    CONFIG.mobileDropdown.closeMs = 0;
    CONFIG.navbarBlur = { top: "0px", scrolled: "0px", open: "0px" };
  }

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function debounce(fn, wait) {
    let t = null;
    return function () {
      clearTimeout(t);
      const args = arguments;
      const ctx = this;
      t = setTimeout(() => fn.apply(ctx, args), wait);
    };
  }

  function getLenisLikeInstance() {
    if (window.lenis && typeof window.lenis.on === "function") return window.lenis;

    const loco =
      window.locomotiveScroll ||
      window.LocomotiveScrollInstance ||
      window.locoScroll;

    if (!loco) return null;
    if (loco.lenis && typeof loco.lenis.on === "function") return loco.lenis;
    if (loco._lenis && typeof loco._lenis.on === "function") return loco._lenis;
    if (loco.scroll && typeof loco.scroll.on === "function") return loco.scroll;

    return null;
  }

  function getScrollTop() {
    const smooth = getLenisLikeInstance();
    return (
      (smooth && typeof smooth.scroll === "number" ? smooth.scroll : null) ??
      window.scrollY ??
      window.pageYOffset ??
      0
    );
  }

  function createDesktopNavbar() {
    let navbarContainer = null;
    let dropdownPortal = null;
    let pageOverlay = null;
    let measureContainer = null;

    let menuDropdowns = [];
    let allTextElements = [];
    let allToggles = [];
    let allDropdownLists = [];

    let isScrolled = false;
    let isOpen = false;
    let isDarkVariant = false;
    let currentDropdown = null;
    let currentList = null;

    let closeTimer = null;
    let resizeTimeout = null;
    let switchTimeout = null;
    let closeFallbackTimeout = null;

    let smoothScrollInstance = null;
    let smoothScrollUnsub = null;
    let scrollTicking = false;

    let originalPaddingBottom = null;
    let originalMarginBottom = null;
    let originalNavbarHeight = null;

    let styleElement = null;
    let boundEventListeners = [];
    let dropdownListMap = new Map();
    let dropdownHeightCache = new WeakMap();

    function addTrackedListener(el, event, handler, options) {
      if (!el) return;
      el.addEventListener(event, handler, options);
      boundEventListeners.push({ el, event, handler, options });
    }

    function getListForDropdown(dropdown) {
      return dropdownListMap.get(dropdown) || null;
    }

    function detectTouch() {
      return (
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        window.innerWidth <= CONFIG.touchBreakpoint
      );
    }

    function clearListStyles(list) {
      if (!list) return;
      list.style.transition = "";
      list.style.opacity = "";
      list.style.visibility = "";
      list.style.pointerEvents = "";
    }

    function resetAllLists() {
      allDropdownLists.forEach((list) => {
        list.style.opacity = "0";
        list.style.visibility = "hidden";
        list.style.pointerEvents = "none";
        list.style.transition = "none";
      });

      menuDropdowns.forEach((dropdown) => {
        const chevron = dropdown.querySelector(".dropdown-chevron");
        const toggle = dropdown.querySelector(".navbar_dropdwn-toggle");
        if (chevron) {
          chevron.style.transition = "";
          chevron.style.transform = "rotate(0deg)";
        }
        if (toggle) toggle.setAttribute("aria-expanded", "false");
      });
    }

    function cancelClose() {
      clearTimeout(closeTimer);
      closeTimer = null;
    }

    function cancelPendingAnimations() {
      clearTimeout(switchTimeout);
      clearTimeout(closeFallbackTimeout);
      switchTimeout = null;
      closeFallbackTimeout = null;
    }

    function measureListHeight(list) {
      if (!list) return 0;
      if (dropdownHeightCache.has(list)) return dropdownHeightCache.get(list);

      measureContainer.appendChild(list);
      list.style.position = "relative";
      list.style.visibility = "hidden";
      list.style.pointerEvents = "none";
      list.style.opacity = "1";
      list.style.height = "auto";
      list.style.maxHeight = "none";

      const height = list.offsetHeight;

      dropdownPortal.appendChild(list);

      list.style.position = "";
      list.style.height = "";
      list.style.maxHeight = "";
      list.style.opacity = "0";
      list.style.visibility = "hidden";
      list.style.pointerEvents = "none";

      dropdownHeightCache.set(list, height);
      return height;
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

    function getTheme() {
      if (isOpen || isScrolled) return CONFIG.colors.scrolled;
      return isDarkVariant ? CONFIG.darkVariantColors.top : CONFIG.colors.top;
    }

    function applyTheme() {
      if (!navbarContainer) return;

      const theme = getTheme();
      const blur = isOpen
        ? CONFIG.navbarBlur.open
        : isScrolled
          ? CONFIG.navbarBlur.scrolled
          : CONFIG.navbarBlur.top;

      navbarContainer.style.maxWidth = CONFIG.maxWidth;
      navbarContainer.style.backgroundColor = theme.navbarBg;
      navbarContainer.style.backdropFilter = `blur(${blur})`;
      navbarContainer.style.webkitBackdropFilter = `blur(${blur})`;

      allTextElements.forEach((el) => {
        el.style.color = theme.textColor;
      });

      menuDropdowns.forEach((dropdown) => {
        const toggle = dropdown.querySelector(".navbar_dropdwn-toggle");
        if (!toggle) return;

        if (toggle.classList.contains("is-app")) {
          toggle.style.backgroundColor = CONFIG.appToggleBg;
          toggle.style.color = CONFIG.appToggleText;
          return;
        }

        toggle.style.backgroundColor =
          isOpen && dropdown === currentDropdown ? theme.elementBg : "transparent";
      });
    }

    function applyTransitions(ms) {
      const dur = `${ms}ms`;
      const ease = CONFIG.ease;

      if (navbarContainer) {
        navbarContainer.style.transition =
          `background-color ${dur} ${ease}, ` +
          `backdrop-filter ${dur} ${ease}, ` +
          `-webkit-backdrop-filter ${dur} ${ease}, ` +
          `padding-bottom ${dur} ${ease}, ` +
          `margin-bottom ${dur} ${ease}`;
      }

      allTextElements.forEach((el) => {
        el.style.transition = `color ${dur} ${ease}`;
      });

      allToggles.forEach((el) => {
        el.style.transition = `color ${dur} ${ease}, background-color ${dur} ${ease}`;
      });

      if (pageOverlay) {
        pageOverlay.style.transition =
          `opacity ${dur} ${ease}, ` +
          `backdrop-filter ${dur} ${ease}, ` +
          `-webkit-backdrop-filter ${dur} ${ease}`;
      }
    }

    function injectStyles() {
      const existing = document.getElementById("navbar-animation-styles");
      if (existing) existing.remove();

      styleElement = document.createElement("style");
      styleElement.id = "navbar-animation-styles";
      styleElement.textContent = `
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
      document.head.appendChild(styleElement);
    }

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

      menuDropdowns.forEach((dropdown) => {
        const list = dropdown.querySelector(".navbar_dropdown-list");
        if (!list) return;
        dropdownListMap.set(dropdown, list);
        dropdownPortal.appendChild(list);
      });
    }

    function createMeasureContainer() {
      measureContainer = document.createElement("div");
      measureContainer.className = "navbar-measure-container";
      navbarContainer.appendChild(measureContainer);
    }

    function prepareDropdowns() {
      menuDropdowns.forEach((dropdown) => {
        const chevron = dropdown.querySelector(".dropdown-chevron");
        if (chevron) {
          chevron.style.transition = `transform ${CONFIG.openMs}ms ${CONFIG.ease}`;
        }
      });
    }

    function disableWebflowBehavior() {
      menuDropdowns.forEach((dropdown) => {
        dropdown.removeAttribute("data-hover");
        dropdown.removeAttribute("data-delay");
      });
    }

    function openMenu(dropdown) {
      const list = getListForDropdown(dropdown);
      if (!list) return;

      cancelClose();
      cancelPendingAnimations();

      currentDropdown = dropdown;
      currentList = list;
      isOpen = true;

      const dropdownHeight = measureListHeight(list);

      dropdownPortal.classList.add("is-open");
      dropdownPortal.style.transition = `height ${CONFIG.openMs}ms ${CONFIG.ease}`;
      dropdownPortal.style.height = `${dropdownHeight}px`;

      pageOverlay.classList.add("is-visible");

      resetAllLists();
      applyTransitions(CONFIG.openMs);
      applyTheme();

      const chevron = dropdown.querySelector(".dropdown-chevron");
      if (chevron) {
        chevron.style.transition = `transform ${CONFIG.openMs}ms ${CONFIG.ease}`;
        chevron.style.transform = "rotate(180deg)";
      }

      const toggle = dropdown.querySelector(".navbar_dropdwn-toggle");
      if (toggle) toggle.setAttribute("aria-expanded", "true");

      list.style.transition = "none";
      list.style.visibility = "visible";
      list.style.pointerEvents = "auto";
      list.style.opacity = "0";

      void list.offsetHeight;

      list.style.transition = `opacity ${CONFIG.openMs}ms ${CONFIG.ease}`;
      list.style.opacity = "1";

      setExpandedSpace(dropdownHeight, CONFIG.openMs);
    }

    const MORPH_SELECTORS = [
      ".dropdown-grid-left",
      ".dropdown-grid-right",
      ".dropdown-grid-app",
      ".dropdown-content-wrapper",
    ];

    function getMorphableElements(list) {
      const out = {};
      MORPH_SELECTORS.forEach((selector) => {
        const el = list.querySelector(selector);
        if (el) out[selector] = el;
      });
      return out;
    }

    function switchMenu(nextDropdown) {
      const prevDropdown = currentDropdown;
      const prevList = currentList;
      const nextList = getListForDropdown(nextDropdown);

      if (!nextList || nextDropdown === prevDropdown) return;

      cancelClose();
      cancelPendingAnimations();

      currentDropdown = nextDropdown;
      currentList = nextList;

      const nextHeight = measureListHeight(nextList);
      const dur = `${CONFIG.switchMs}ms`;
      const ease = CONFIG.ease;

      const prevElements = prevList ? getMorphableElements(prevList) : {};
      const nextElements = getMorphableElements(nextList);

      if (prevList) prevList.style.pointerEvents = "none";

      nextList.style.transition = "none";
      nextList.style.opacity = "1";
      nextList.style.visibility = "visible";
      nextList.style.pointerEvents = "auto";

      Object.values(nextElements).forEach((el) => {
        el.style.transition = "none";
        el.style.opacity = "0";
      });

      void nextList.offsetHeight;

      Object.values(prevElements).forEach((el) => {
        el.style.transition = `opacity ${dur} ${ease}`;
        el.style.opacity = "0";
      });

      Object.values(nextElements).forEach((el) => {
        el.style.transition = `opacity ${dur} ${ease}`;
        el.style.opacity = "1";
      });

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
      nextDropdown
        .querySelector(".navbar_dropdwn-toggle")
        ?.setAttribute("aria-expanded", "true");

      allToggles.forEach((toggle) => {
        toggle.style.transition = `background-color ${dur} ${ease}, color ${dur} ${ease}`;
      });

      applyTheme();

      dropdownPortal.style.transition = `height ${dur} ${ease}`;
      dropdownPortal.style.height = `${nextHeight}px`;
      setExpandedSpace(nextHeight, CONFIG.switchMs);

      switchTimeout = setTimeout(() => {
        switchTimeout = null;

        if (prevList) {
          prevList.style.opacity = "0";
          prevList.style.visibility = "hidden";
          prevList.style.pointerEvents = "none";
        }

        Object.values(prevElements).forEach((el) => {
          el.style.transition = "";
          el.style.opacity = "";
        });

        Object.values(nextElements).forEach((el) => {
          el.style.transition = "";
          el.style.opacity = "";
        });

        nextList.style.transition = "";
        nextList.style.opacity = "1";
        nextList.style.visibility = "visible";
        nextList.style.pointerEvents = "auto";
      }, CONFIG.switchMs + 20);
    }

    function closeMenu() {
      cancelClose();
      cancelPendingAnimations();

      if (!isOpen) {
        resetAllLists();
        applyTransitions(CONFIG.closeMs);
        applyTheme();
        setExpandedSpace(0, CONFIG.closeMs);
        if (dropdownPortal) {
          dropdownPortal.classList.remove("is-open");
          dropdownPortal.style.height = "0px";
        }
        pageOverlay?.classList.remove("is-visible");
        currentDropdown = null;
        currentList = null;
        return;
      }

      isOpen = false;
      pageOverlay?.classList.remove("is-visible");

      if (currentList) {
        currentList.style.transition = `opacity ${CONFIG.closeMs}ms ${CONFIG.ease}`;
        currentList.style.opacity = "0";
        currentList.style.pointerEvents = "none";
      }

      if (currentDropdown) {
        const chevron = currentDropdown.querySelector(".dropdown-chevron");
        if (chevron) {
          chevron.style.transition = `transform ${CONFIG.closeMs}ms ${CONFIG.ease}`;
          chevron.style.transform = "rotate(0deg)";
        }
        currentDropdown
          .querySelector(".navbar_dropdwn-toggle")
          ?.setAttribute("aria-expanded", "false");
      }

      dropdownPortal.style.transition = `height ${CONFIG.closeMs}ms ${CONFIG.ease}`;
      dropdownPortal.style.height = "0px";

      setExpandedSpace(0, CONFIG.closeMs);

      closeFallbackTimeout = setTimeout(() => {
        closeFallbackTimeout = null;
        dropdownPortal.classList.remove("is-open");
        resetAllLists();
        currentDropdown = null;
        currentList = null;
        applyTransitions(CONFIG.closeMs);
        applyTheme();
      }, CONFIG.closeMs + CONFIG.closeFallbackBuffer);
    }

    function requestClose() {
      cancelClose();
      closeTimer = setTimeout(closeMenu, CONFIG.closeDelayMs);
    }

    function bindScrollListener() {
      const syncScrollState = () => {
        const nextScrolled = getScrollTop() > CONFIG.scrollThreshold;
        if (nextScrolled === isScrolled) return;
        isScrolled = nextScrolled;
        applyTheme();
      };

      smoothScrollInstance = getLenisLikeInstance();

      if (smoothScrollInstance && typeof smoothScrollInstance.on === "function") {
        const handler = () => {
          if (scrollTicking) return;
          scrollTicking = true;
          requestAnimationFrame(() => {
            syncScrollState();
            scrollTicking = false;
          });
        };

        smoothScrollInstance.on("scroll", handler);
        smoothScrollUnsub = () => {
          if (typeof smoothScrollInstance.off === "function") {
            smoothScrollInstance.off("scroll", handler);
          }
        };
      } else {
        const handler = () => {
          if (scrollTicking) return;
          scrollTicking = true;
          requestAnimationFrame(() => {
            syncScrollState();
            scrollTicking = false;
          });
        };
        addTrackedListener(window, "scroll", handler, { passive: true });
      }

      isScrolled = getScrollTop() > CONFIG.scrollThreshold;
    }

    function bindResizeListener() {
      const handler = debounce(() => {
        dropdownHeightCache = new WeakMap();
        if (dropdownPortal) dropdownPortal.style.top = `${originalNavbarHeight}px`;

        if (isOpen && currentList) {
          const nextHeight = measureListHeight(currentList);
          dropdownPortal.style.height = `${nextHeight}px`;
          setExpandedSpace(nextHeight, 0);
        }
      }, 120);

      addTrackedListener(window, "resize", handler);
    }

    function bindEvents() {
      const touchDevice = detectTouch();

      addTrackedListener(navbarContainer, "pointerleave", (e) => {
        if (e.pointerType === "touch") return;
        if (!navbarContainer.contains(e.relatedTarget)) requestClose();
      });

      addTrackedListener(navbarContainer, "pointerenter", (e) => {
        if (e.pointerType === "touch") return;
        if (isOpen) cancelClose();
      });

      menuDropdowns.forEach((dropdown) => {
        const toggle = dropdown.querySelector(".navbar_dropdwn-toggle");
        const list = getListForDropdown(dropdown);
        if (!toggle || !list) return;

        addTrackedListener(toggle, "pointerenter", (e) => {
          if (e.pointerType === "touch") return;
          cancelClose();
          if (!isOpen) openMenu(dropdown);
          else if (currentDropdown !== dropdown) switchMenu(dropdown);
        });

        addTrackedListener(toggle, "click", (e) => {
          if (window.innerWidth < CONFIG.desktopMin) return;
          e.preventDefault();
          e.stopPropagation();

          if (isOpen && currentDropdown === dropdown) closeMenu();
          else if (!isOpen) openMenu(dropdown);
          else switchMenu(dropdown);
        });

        addTrackedListener(toggle, "keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (isOpen && currentDropdown === dropdown) closeMenu();
            else if (!isOpen) openMenu(dropdown);
            else switchMenu(dropdown);
          }

          if (e.key === "Escape" && isOpen) {
            closeMenu();
            toggle.focus();
          }
        });

        if (touchDevice) return;
      });

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
            !(pageOverlay && pageOverlay.contains(e.target))
          ) {
            closeMenu();
          }
        },
        true
      );
    }

    function init() {
      navbarContainer = document.querySelector(".navbar_container");
      if (!navbarContainer) return;

      window.__navbarAnimationInitialized = true;

      const navbarComponent = document.querySelector(".navbar_component");
      isDarkVariant =
        navbarComponent?.getAttribute("data-wf--navbar--variant") === "dark";

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

      allDropdownLists = Array.from(
        dropdownPortal.querySelectorAll(".navbar_dropdown-list")
      );

      requestAnimationFrame(() => {
        applyTransitions(0);
        applyTheme();
        requestAnimationFrame(() => applyTransitions(CONFIG.closeMs));
      });
    }

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

      boundEventListeners.forEach(({ el, event, handler, options }) => {
        el.removeEventListener(event, handler, options);
      });
      boundEventListeners = [];

      if (smoothScrollUnsub) {
        smoothScrollUnsub();
        smoothScrollUnsub = null;
      }

      if (styleElement?.parentNode) styleElement.parentNode.removeChild(styleElement);
      if (pageOverlay?.parentNode) pageOverlay.parentNode.removeChild(pageOverlay);
      if (dropdownPortal?.parentNode) dropdownPortal.parentNode.removeChild(dropdownPortal);
      if (measureContainer?.parentNode) measureContainer.parentNode.removeChild(measureContainer);

      if (navbarContainer) {
        navbarContainer.style.paddingBottom = originalPaddingBottom;
        navbarContainer.style.marginBottom = originalMarginBottom;
        navbarContainer.style.maxWidth = "";
        navbarContainer.style.backgroundColor = "";
        navbarContainer.style.backdropFilter = "";
        navbarContainer.style.webkitBackdropFilter = "";
        navbarContainer.style.transition = "";
      }

      menuDropdowns.forEach((dropdown) => {
        const toggle = dropdown.querySelector(".navbar_dropdwn-toggle");
        const chevron = dropdown.querySelector(".dropdown-chevron");
        if (toggle) {
          toggle.style.backgroundColor = "";
          toggle.style.color = "";
          toggle.style.transition = "";
          toggle.setAttribute("aria-expanded", "false");
        }
        if (chevron) {
          chevron.style.transform = "";
          chevron.style.transition = "";
        }
      });

      allTextElements.forEach((el) => {
        el.style.color = "";
        el.style.transition = "";
      });

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
      isDarkVariant = false;
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

    function handleViewport() {
      if (window.innerWidth >= CONFIG.desktopMin) {
        if (!window.__navbarAnimationInitialized) init();
      } else {
        if (window.__navbarAnimationInitialized && window.__navbarAnimationDestroy) {
          window.__navbarAnimationDestroy();
        }
      }
    }

    function start() {
      handleViewport();
      window.addEventListener(
        "resize",
        debounce(() => {
          handleViewport();
        }, 200)
      );
    }

    return { start };
  }

  function createMobileNavbar() {
    const STATE = { CLOSED: 0, OPENING: 1, OPEN: 2, CLOSING: 3 };
    let state = STATE.CLOSED;

    const body = document.body;
    const navButton = document.querySelector(".w-nav-button");
    const navbarComponent = document.querySelector(".navbar_component");
    const navbarContainer = document.querySelector(".navbar_container");
    const navbarMenu = document.querySelector(".navbar_menu");

    if (!navButton || !navbarContainer || !navbarMenu) return { start() {} };

    let isScrolled = false;
    let scrollTicking = false;
    let closeTimeout = null;
    let openTimeout = null;
    let guardObservers = false;
    let styleEl = null;

    const dropdownResets = [];

    function isMobile() {
      return window.innerWidth <= CONFIG.touchBreakpoint;
    }

    function isLocked() {
      return state === STATE.OPENING || state === STATE.CLOSING;
    }

    function getNavOverlay() {
      return document.querySelector(".w-nav-overlay");
    }

    function neutralizeMenuTransform() {
      if (!navbarMenu) return;
      if (!isMobile()) {
        navbarMenu.style.removeProperty("transform");
        return;
      }
      navbarMenu.style.setProperty("transform", "none", "important");
    }

    function ensureOverlayVisible() {
      const overlay = getNavOverlay();
      if (!overlay) return;

      overlay.style.setProperty("display", "block", "important");
      overlay.style.setProperty("height", "auto", "important");
      overlay.style.setProperty("overflow", "visible", "important");
      overlay.style.setProperty("transition", "none", "important");
      overlay.style.setProperty("transform", "none", "important");
      overlay.style.setProperty("opacity", "1", "important");
      overlay.style.setProperty("pointer-events", "auto", "important");
    }

    function clearOverlayInlineStyles() {
      const overlay = getNavOverlay();
      if (!overlay) return;

      [
        "display",
        "height",
        "overflow",
        "transition",
        "transform",
        "opacity",
        "pointer-events",
      ].forEach((prop) => overlay.style.removeProperty(prop));
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

    function injectStyles() {
      const existing = document.getElementById("mobile-nav-styles");
      if (existing) existing.remove();

      styleEl = document.createElement("style");
      styleEl.id = "mobile-nav-styles";
      styleEl.textContent = `
@media (max-width: ${CONFIG.touchBreakpoint}px) {
  .w-nav-overlay {
    overflow: visible !important;
  }

  .navbar_menu {
    width: 100vw !important;
    max-width: none !important;
    margin-left: calc(-50vw + 50%) !important;
    box-sizing: border-box !important;
  }

  .navbar_component {
    border: none !important;
    border-bottom: none !important;
    box-shadow: none !important;
    outline: none !important;
    background-color: transparent !important;
    transform: none !important;
    transition: background-color ${CONFIG.closeMs}ms ${CONFIG.ease} !important;
  }

  .navbar_component.is-mobile-open {
    background-color: #000 !important;
    transition: background-color ${CONFIG.openMs}ms ${CONFIG.ease} !important;
  }

  .navbar_container {
    transition: background-color ${CONFIG.closeMs}ms ${CONFIG.ease} !important;
  }

  .navbar_container.is-mobile-dark {
    background-color: #000 !important;
  }

  .navbar_container.is-mobile-opening {
    transition: background-color ${CONFIG.openMs}ms ${CONFIG.ease} !important;
  }

  .navbar_logo,
  .navbar_link,
  .navbar_dropdwn-toggle {
    transition: color ${CONFIG.closeMs}ms ${CONFIG.ease} !important;
  }

  .navbar_container.is-mobile-dark .navbar_logo,
  .navbar_container.is-mobile-dark .navbar_link,
  .navbar_container.is-mobile-dark .navbar_dropdwn-toggle {
    color: #ffffff !important;
  }

  .navbar_container .button.is-mobile {
    transition:
      color ${CONFIG.closeMs}ms ${CONFIG.ease},
      background-color ${CONFIG.closeMs}ms ${CONFIG.ease},
      border-color ${CONFIG.closeMs}ms ${CONFIG.ease} !important;
  }

  .navbar_container.is-mobile-dark .button.is-mobile {
    color: #fff !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
  }

  .navbar_container.is-mobile-opening .button.is-mobile {
    transition:
      color ${CONFIG.openMs}ms ${CONFIG.ease},
      background-color ${CONFIG.openMs}ms ${CONFIG.ease},
      border-color ${CONFIG.openMs}ms ${CONFIG.ease} !important;
  }

  .navbar_container.is-mobile-opening .navbar_logo,
  .navbar_container.is-mobile-opening .navbar_link,
  .navbar_container.is-mobile-opening .navbar_dropdwn-toggle {
    transition: color ${CONFIG.openMs}ms ${CONFIG.ease} !important;
  }

  .menu-icon {
    transition: background-color ${CONFIG.closeMs}ms ${CONFIG.ease} !important;
  }

  .navbar_container.is-mobile-dark .menu-icon {
    background-color: #202020 !important;
  }

  .navbar_container.is-mobile-opening .menu-icon {
    transition: background-color ${CONFIG.openMs}ms ${CONFIG.ease} !important;
  }

  .menu-icon_line-top,
  .menu-icon_line-middle,
  .menu-icon_line-bottom {
    transition: background-color ${CONFIG.closeMs}ms ${CONFIG.ease} !important;
  }

  .navbar_container.is-mobile-dark .menu-icon_line-top,
  .navbar_container.is-mobile-dark .menu-icon_line-middle,
  .navbar_container.is-mobile-dark .menu-icon_line-bottom {
    background-color: #fff !important;
  }

  .navbar_container.is-mobile-opening .menu-icon_line-top,
  .navbar_container.is-mobile-opening .menu-icon_line-middle,
  .navbar_container.is-mobile-opening .menu-icon_line-bottom {
    transition: background-color ${CONFIG.openMs}ms ${CONFIG.ease} !important;
  }

  .navbar_menu .navbar_dropdown-list {
    display: block !important;
    max-height: 0px !important;
    overflow: hidden !important;
  }

  .navbar_menu .dropdown-chevron {
    transition: transform ${CONFIG.mobileDropdown.openMs}ms ${CONFIG.mobileDropdown.ease} !important;
    will-change: transform;
  }

  .navbar_menu .navbar_dropdwn-toggle,
  .navbar_menu .navbar_dropdwn-toggle *,
  .navbar_menu .navbar_dropdown-list,
  .navbar_menu .navbar_dropdown-list * {
    color: inherit !important;
    background-color: inherit !important;
  }
}
      `.trim();

      document.head.appendChild(styleEl);
    }

    function showMenuImmediately() {
      navbarMenu.style.setProperty("display", "block", "important");
      navbarMenu.style.setProperty("opacity", "1", "important");
      navbarMenu.style.setProperty("pointer-events", "auto", "important");
      navbarMenu.style.removeProperty("visibility");
      navbarMenu.style.removeProperty("transition");
      neutralizeMenuTransform();
    }

    function hideMenuImmediately() {
      navbarMenu.style.setProperty("opacity", "0", "important");
      navbarMenu.style.setProperty("pointer-events", "none", "important");
      navbarMenu.style.removeProperty("transition");
    }

    function stripMenuInlineStyles() {
      ["display", "opacity", "pointer-events", "transition", "transform"].forEach(
        (prop) => navbarMenu.style.removeProperty(prop)
      );
    }

    function clearMobileStyles() {
      clearAllTimers();
      state = STATE.CLOSED;
      guardObservers = false;

      navbarComponent.classList.remove("is-mobile-open");
      navbarContainer.classList.remove("is-mobile-dark", "is-mobile-opening");

      resetAllDropdowns();
      stripMenuInlineStyles();
      clearOverlayInlineStyles();
      body.style.overflow = "";
    }

    function openMobileMenu() {
      if (state !== STATE.CLOSED) return;

      clearAllTimers();
      state = STATE.OPENING;
      body.style.overflow = "hidden";

      resetAllDropdowns();

      guardObservers = true;
      ensureOverlayVisible();
      showMenuImmediately();
      guardObservers = false;

      navbarComponent.classList.add("is-mobile-open");
      navbarContainer.classList.add("is-mobile-dark", "is-mobile-opening");

      navbarMenu.style.setProperty("opacity", "0", "important");
      void navbarMenu.offsetHeight;
      navbarMenu.style.setProperty(
        "transition",
        `opacity ${CONFIG.openMs}ms ${CONFIG.ease}`,
        "important"
      );
      navbarMenu.style.setProperty("opacity", "1", "important");

      requestAnimationFrame(() => {
        neutralizeMenuTransform();
        ensureOverlayVisible();
      });

      openTimeout = setTimeout(() => {
        if (state !== STATE.OPENING) return;
        state = STATE.OPEN;
        navbarMenu.style.removeProperty("transition");
        ensureOverlayVisible();
      }, CONFIG.openMs);
    }

    function closeMobileMenu() {
      if (state !== STATE.OPEN) return;

      clearAllTimers();
      state = STATE.CLOSING;
      body.style.overflow = "hidden";

      resetAllDropdowns();

      guardObservers = true;
      ensureOverlayVisible();
      neutralizeMenuTransform();
      guardObservers = false;

      navbarMenu.style.setProperty("pointer-events", "none", "important");
      navbarMenu.style.setProperty(
        "transition",
        `opacity ${CONFIG.closeMs}ms ${CONFIG.ease}`,
        "important"
      );
      navbarMenu.style.setProperty("opacity", "0", "important");

      navbarComponent.classList.remove("is-mobile-open");
      navbarContainer.classList.remove("is-mobile-opening");
      if (!isScrolled) navbarContainer.classList.remove("is-mobile-dark");

      closeTimeout = setTimeout(() => {
        if (state !== STATE.CLOSING) return;

        state = STATE.CLOSED;
        hideMenuImmediately();

        const overlay = getNavOverlay();
        if (overlay && !navButton.classList.contains("w--open")) {
          overlay.style.setProperty("display", "none", "important");
        }

        body.style.overflow = navButton.classList.contains("w--open") ? "hidden" : "";
      }, CONFIG.closeMs + 50);
    }

    function applyScrollState() {
      if (!isMobile()) return;

      const menuOpen = state === STATE.OPEN || state === STATE.OPENING;
      const dark = menuOpen || isScrolled;

      navbarComponent.classList.toggle("is-mobile-open", menuOpen);
      navbarContainer.classList.toggle("is-mobile-dark", dark);
      navbarContainer.classList.toggle("is-mobile-opening", menuOpen);
    }

    function bindTopLevelObservers() {
      const navButtonObserver = new MutationObserver(() => {
        if (!isMobile() || isLocked()) return;

        const nowOpen = navButton.classList.contains("w--open");

        if (nowOpen && state === STATE.CLOSED) openMobileMenu();
        else if (!nowOpen && state === STATE.OPEN) closeMobileMenu();

        requestAnimationFrame(() => {
          neutralizeMenuTransform();
          ensureOverlayVisible();
        });
      });

      navButtonObserver.observe(navButton, {
        attributes: true,
        attributeFilter: ["class"],
      });

      const menuStyleObserver = new MutationObserver(() => {
        if (guardObservers || !isMobile()) return;
        if (state !== STATE.CLOSED) neutralizeMenuTransform();
      });

      menuStyleObserver.observe(navbarMenu, {
        attributes: true,
        attributeFilter: ["style"],
      });
    }

    function bindEvents() {
      navButton.addEventListener(
        "pointerdown",
        () => {
          if (!isMobile() || isLocked()) return;
          requestAnimationFrame(() => {
            ensureOverlayVisible();
            neutralizeMenuTransform();
          });
        },
        { capture: true }
      );

      navbarMenu.addEventListener(
        "click",
        (e) => {
          if (!isMobile()) return;
          if (state !== STATE.OPEN) return;
          if (e.target.closest("a[href]")) closeMobileMenu();
        },
        true
      );

      document.addEventListener(
        "pointerdown",
        (e) => {
          if (!isMobile()) return;
          if (state !== STATE.OPEN) return;

          const overlay = getNavOverlay();
          if (overlay && e.target === overlay) closeMobileMenu();
        },
        true
      );

      window.addEventListener(
        "scroll",
        () => {
          if (scrollTicking) return;
          scrollTicking = true;

          requestAnimationFrame(() => {
            const was = isScrolled;
            isScrolled = window.scrollY > CONFIG.scrollThreshold;
            if (was !== isScrolled) applyScrollState();
            scrollTicking = false;
          });
        },
        { passive: true }
      );

      window.addEventListener("resize", () => {
        if (!isMobile()) {
          clearMobileStyles();
        } else {
          neutralizeMenuTransform();
          ensureOverlayVisible();
        }
      });
    }

    function bindDropdowns() {
      const allDropdowns = navbarMenu.querySelectorAll(".navbar_menu-dropdown");

      allDropdowns.forEach((dropdown) => {
        const list = dropdown.querySelector(".navbar_dropdown-list");
        const chevron = dropdown.querySelector(".dropdown-chevron");
        if (!list) return;

        let ddOpen = false;
        let ddTimeout = null;

        function resetDropdown() {
          clearTimeout(ddTimeout);
          ddOpen = false;
          ["max-height", "overflow", "transition"].forEach((prop) =>
            list.style.removeProperty(prop)
          );
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
            list.style.setProperty("transition", "none", "important");
            list.style.setProperty("max-height", "0px", "important");
            list.style.setProperty("overflow", "hidden", "important");
            void list.offsetHeight;

            const h = list.scrollHeight;

            list.style.setProperty(
              "transition",
              `max-height ${CONFIG.mobileDropdown.openMs}ms ${CONFIG.mobileDropdown.ease}`,
              "important"
            );
            list.style.setProperty("max-height", `${h}px`, "important");

            if (chevron) {
              chevron.style.setProperty(
                "transition",
                `transform ${CONFIG.mobileDropdown.openMs}ms ${CONFIG.mobileDropdown.ease}`,
                "important"
              );
              chevron.style.setProperty("transform", "rotate(180deg)", "important");
            }

            ddTimeout = setTimeout(() => {
              list.style.setProperty("max-height", "none", "important");
              list.style.removeProperty("overflow");
            }, CONFIG.mobileDropdown.openMs + 20);
          } else {
            const h = list.scrollHeight;

            list.style.setProperty("transition", "none", "important");
            list.style.setProperty("max-height", `${h}px`, "important");
            list.style.setProperty("overflow", "hidden", "important");
            void list.offsetHeight;

            list.style.setProperty(
              "transition",
              `max-height ${CONFIG.mobileDropdown.closeMs}ms ${CONFIG.mobileDropdown.ease}`,
              "important"
            );
            list.style.setProperty("max-height", "0px", "important");

            if (chevron) {
              chevron.style.setProperty(
                "transition",
                `transform ${CONFIG.mobileDropdown.closeMs}ms ${CONFIG.mobileDropdown.ease}`,
                "important"
              );
              chevron.style.setProperty("transform", "rotate(0deg)", "important");
            }
          }
        }).observe(list, { attributes: true, attributeFilter: ["class"] });
      });
    }

    function start() {
      injectStyles();
      bindTopLevelObservers();
      bindEvents();
      bindDropdowns();
      isScrolled = window.scrollY > CONFIG.scrollThreshold;
      applyScrollState();
      neutralizeMenuTransform();
    }

    return { start };
  }

  onReady(() => {
    const desktop = createDesktopNavbar();
    const mobile = createMobileNavbar();

    desktop.start();
    mobile.start();
  });
})();
