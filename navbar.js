/* ═══════════════════════════════════════════════
   WATCH DUTY NAVBAR
   Exclusive-mode architecture. Robust across resizes.
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
  let lastWidth = window.innerWidth;

  const shared = {
    mobileQuery,
    isMobile: () => mobileQuery.matches,
    desktopInit: null,
    desktopDestroy: null,
    desktopGracefulClose: null,
    mobileInit: null,
    mobileDestroy: null,
    mobileGracefulClose: null,
    activeMode: null,

    activate() {
      const target = this.isMobile() ? "mobile" : "desktop";
      console.log("[wd-nav] activate() — current:", this.activeMode, "target:", target, "innerWidth:", window.innerWidth);

      if (this.activeMode === target) return;

      // Graceful close before destroy to prevent visual artifacts
      if (this.activeMode === "desktop") {
        this.desktopGracefulClose?.();
        this.desktopDestroy?.();
      }
      if (this.activeMode === "mobile") {
        this.mobileGracefulClose?.();
        this.mobileDestroy?.();
      }
      this.activeMode = null;

      if (target === "mobile" && this.mobileInit) {
        this.mobileInit();
        this.activeMode = "mobile";
      } else if (target === "desktop" && this.desktopInit) {
        this.desktopInit();
        this.activeMode = "desktop";
      } else {
        console.warn("[wd-nav] no init function available for target:", target);
      }
    },

    destroyAll() {
      if (this.activeMode === "desktop") this.desktopDestroy?.();
      if (this.activeMode === "mobile") this.mobileDestroy?.();
      this.activeMode = null;
    },
  };

  // matchMedia.change is the AUTHORITATIVE signal for breakpoint crossing.
  // Fires exactly once per crossing. This is what drives mode switching.
  mobileQuery.addEventListener?.("change", () => shared.activate());

  // Secondary: listen for resize to catch width-only changes (e.g. iOS
  // URL bar show/hide changes height but NOT width — we ignore those).
  // This doesn't switch modes; it just lets the active mode know layout
  // may have shifted.
  window.addEventListener("resize", () => {
    const width = window.innerWidth;
    if (width === lastWidth) return; // height-only change, ignore
    lastWidth = width;
    // matchMedia change listener handles actual breakpoint crossings.
    // We don't need to call activate() here.
  }, { passive: true });

  window.__wdNavShared = shared;

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
      top: { navbarBg: "rgba(255, 255, 255, 0.95)", textColor: "#1a1a1a", elementBg: "rgba(0, 0, 0, 0.05)" },
      scrolled: { navbarBg: "rgba(0, 0, 0, 0.92)", textColor: "#ffffff", elementBg: "rgba(255, 255, 255, 0.1)" },
    },
  };

  const BASE = { openMs: CONFIG.openMs, closeMs: CONFIG.closeMs, switchMs: CONFIG.switchMs, overlayBlurPx: CONFIG.overlayBlurPx, navbarBlur: { ...CONFIG.navbarBlur } };
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  function applyMotion() {
    if (motionQuery?.matches) {
      CONFIG.openMs = CONFIG.closeMs = CONFIG.switchMs = 0;
      CONFIG.overlayBlurPx = 0;
      CONFIG.navbarBlur = { top: "0px", scrolled: "0px", open: "0px" };
    } else {
      CONFIG.openMs = BASE.openMs; CONFIG.closeMs = BASE.closeMs; CONFIG.switchMs = BASE.switchMs;
      CONFIG.overlayBlurPx = BASE.overlayBlurPx; CONFIG.navbarBlur = { ...BASE.navbarBlur };
    }
  }
  applyMotion();

  let navbarContainer, dropdownPortal, pageOverlay, measureContainer;
  let menuDropdowns = [], allTextElements = [], allToggles = [], allDropdownLists = [];
  let isScrolled = false, isOpen = false, currentDropdown = null, currentList = null;
  let closeTimer = null, switchTimeout = null, closeFallbackTimeout = null;
  let smoothScrollInstance = null, smoothScrollUnsub = null;
  let originalPaddingBottom = null, originalMarginBottom = null, originalNavbarHeight = null;
  let boundListeners = [], styleElement = null;
  let dropdownListMap = new Map(), dropdownHeightCache = new WeakMap(), morphCache = new WeakMap();
  let lastScrollY = 0, scrollTicking = false;
  let resizeTimeout = null;

  const MORPH_SELECTORS = [".dropdown-grid-left", ".dropdown-grid-right", ".dropdown-grid-app", ".dropdown-content-wrapper"];

  function addL(el, event, handler, options) {
    if (!el) return;
    el.addEventListener(event, handler, options);
    boundListeners.push({ el, event, handler, options });
  }
  function getListFor(dd) { return dropdownListMap.get(dd); }
  function getMorphable(list) {
    let c = morphCache.get(list);
    if (c) return c;
    c = {};
    for (const sel of MORPH_SELECTORS) { const el = list.querySelector(sel); if (el) c[sel] = el; }
    morphCache.set(list, c);
    return c;
  }
  function setExpandedSpace(px, ms) {
    if (!navbarContainer) return;
    const dur = typeof ms === "number" ? ms : CONFIG.closeMs, ease = CONFIG.ease;
    navbarContainer.style.transition = `background-color ${dur}ms ${ease}, backdrop-filter ${dur}ms ${ease}, -webkit-backdrop-filter ${dur}ms ${ease}, padding-bottom ${dur}ms ${ease}, margin-bottom ${dur}ms ${ease}`;
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
  function getTheme() { return isOpen || isScrolled ? CONFIG.colors.scrolled : CONFIG.colors.top; }
  function applyTheme() {
    if (!navbarContainer) return;
    const theme = getTheme();
    const blur = isOpen ? CONFIG.navbarBlur.open : isScrolled ? CONFIG.navbarBlur.scrolled : CONFIG.navbarBlur.top;
    const cs = navbarContainer.style;
    cs.maxWidth = CONFIG.maxWidth; cs.backgroundColor = theme.navbarBg;
    cs.backdropFilter = `blur(${blur})`; cs.webkitBackdropFilter = `blur(${blur})`;
    for (const el of allTextElements) el.style.color = theme.textColor;
    for (const dd of menuDropdowns) {
      const t = dd.querySelector(".navbar_dropdwn-toggle");
      if (!t) continue;
      if (t.classList.contains("is-app")) { t.style.backgroundColor = CONFIG.appToggleBg; t.style.color = CONFIG.appToggleText; continue; }
      t.style.backgroundColor = isOpen && dd === currentDropdown ? theme.elementBg : "transparent";
    }
  }
  function applyTransitions(ms) {
    if (!navbarContainer) return;
    const dur = `${ms}ms`, ease = CONFIG.ease;
    navbarContainer.style.transition = `background-color ${dur} ${ease}, backdrop-filter ${dur} ${ease}, -webkit-backdrop-filter ${dur} ${ease}, padding-bottom ${dur} ${ease}, margin-bottom ${dur} ${ease}`;
    for (const el of allTextElements) el.style.transition = `color ${dur} ${ease}`;
    for (const t of allToggles) t.style.transition = `color ${dur} ${ease}, background-color ${dur} ${ease}`;
    if (pageOverlay) pageOverlay.style.transition = `opacity ${dur} ${ease}, backdrop-filter ${dur} ${ease}, -webkit-backdrop-filter ${dur} ${ease}`;
  }
  function injectStyles() {
    const existing = document.getElementById("wd-navbar-desktop-styles");
    if (existing) existing.remove();
    const css = `
.navbar_container{position:relative!important;overflow:hidden!important;z-index:901!important;max-width:${CONFIG.maxWidth}!important;will-change:background-color,backdrop-filter,padding-bottom,margin-bottom;}
.navbar_logo-link,.navbar_menu,.navbar_button-wrapper{position:relative;z-index:10;}
.navbar-dropdown-portal{position:absolute;left:0;right:0;z-index:1;pointer-events:none;overflow:hidden;}
.navbar-dropdown-portal.is-open{pointer-events:auto;}
.navbar-measure-container{position:absolute!important;left:-9999px!important;top:-9999px!important;width:100%!important;visibility:hidden!important;pointer-events:none!important;z-index:-1!important;}
.navbar_menu{position:relative!important;}
.navbar_menu-dropdown{position:static!important;}
.navbar_dropdown-list{display:block!important;position:absolute!important;left:0!important;right:0!important;top:0!important;width:100%!important;box-sizing:border-box!important;z-index:2;background:transparent!important;border-radius:0!important;overflow:hidden;opacity:0;visibility:hidden;pointer-events:none;will-change:opacity;}
.nav-page-overlay{position:fixed;inset:0;z-index:900;pointer-events:none;background:rgba(15,15,15,${CONFIG.overlayOpacity});opacity:0;backdrop-filter:blur(0px);-webkit-backdrop-filter:blur(0px);will-change:opacity,backdrop-filter;}
.nav-page-overlay.is-visible{opacity:1;pointer-events:auto;backdrop-filter:blur(${CONFIG.overlayBlurPx}px);-webkit-backdrop-filter:blur(${CONFIG.overlayBlurPx}px);}
.navbar_dropdwn-toggle{border-radius:${CONFIG.toggleRadiusPx}px!important;cursor:pointer;-webkit-tap-highlight-color:transparent;}
.navbar_dropdwn-toggle.is-app{background-color:${CONFIG.appToggleBg}!important;color:${CONFIG.appToggleText}!important;}
.dropdown-grid-right,.dropdown-grid-app,.dropdown-left-content-icon-wrapper{background-color:#202020!important;}
.navbar_dropdown-list,.navbar_dropdown-list *{color:#ffffff!important;}`.trim();
    styleElement = document.createElement("style");
    styleElement.id = "wd-navbar-desktop-styles";
    styleElement.textContent = css;
    document.head.appendChild(styleElement);
  }
  function createOverlay() {
    pageOverlay = document.querySelector(".nav-page-overlay");
    if (!pageOverlay) { pageOverlay = document.createElement("div"); pageOverlay.className = "nav-page-overlay"; document.body.appendChild(pageOverlay); }
    addL(pageOverlay, "click", () => { if (isOpen) closeMenu(); });
  }
  function createPortal() {
    dropdownPortal = navbarContainer.querySelector(".navbar-dropdown-portal");
    if (!dropdownPortal) { dropdownPortal = document.createElement("div"); dropdownPortal.className = "navbar-dropdown-portal"; navbarContainer.appendChild(dropdownPortal); }
    dropdownPortal.style.top = `${originalNavbarHeight}px`;
    for (const dd of menuDropdowns) {
      const list = dd.querySelector(".navbar_dropdown-list");
      if (list) { dropdownListMap.set(dd, list); dropdownPortal.appendChild(list); }
    }
  }
  function createMeasureContainer() {
    measureContainer = document.createElement("div");
    measureContainer.className = "navbar-measure-container";
    navbarContainer.appendChild(measureContainer);
  }
  function prepareDropdowns() {
    for (const dd of menuDropdowns) { const ch = dd.querySelector(".dropdown-chevron"); if (ch) ch.style.transition = `transform ${CONFIG.openMs}ms ${CONFIG.ease}`; }
  }
  function disableWebflowBehavior() { for (const dd of menuDropdowns) { dd.removeAttribute("data-hover"); dd.removeAttribute("data-delay"); } }
  function enhanceToggleA11y() {
    for (const t of allToggles) {
      if (!t.hasAttribute("aria-haspopup")) t.setAttribute("aria-haspopup", "true");
      if (!t.hasAttribute("aria-expanded")) t.setAttribute("aria-expanded", "false");
      if (t.tagName !== "BUTTON" && !t.hasAttribute("role")) { t.setAttribute("role", "button"); if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "0"); }
    }
  }
  function bindEvents() {
    addL(navbarContainer, "pointerleave", (e) => { if (e.pointerType === "touch") return; const into = e.relatedTarget; if (!into || !navbarContainer.contains(into)) requestClose(); });
    addL(navbarContainer, "pointerenter", (e) => { if (e.pointerType === "touch") return; if (isOpen) cancelClose(); });
    addL(navbarContainer, "pointercancel", () => cancelClose());
    for (const dd of menuDropdowns) {
      const toggle = dd.querySelector(".navbar_dropdwn-toggle");
      const list = getListFor(dd);
      if (!toggle || !list) continue;
      addL(toggle, "pointerenter", (e) => { if (e.pointerType === "touch") return; cancelClose(); if (!isOpen || currentDropdown !== dd) openOrSwitch(dd); });
      addL(toggle, "click", (e) => { e.preventDefault(); e.stopPropagation(); if (isOpen && currentDropdown === dd) closeMenu(); else openOrSwitch(dd); });
      addL(toggle, "keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (isOpen && currentDropdown === dd) closeMenu(); else openOrSwitch(dd); }
        if (e.key === "Escape" && isOpen) { closeMenu(); toggle.focus(); }
      });
    }
    addL(document, "keydown", (e) => { if (e.key === "Escape" && isOpen) closeMenu(); });
    addL(document, "pointerdown", (e) => { if (!isOpen) return; if (!navbarContainer.contains(e.target) && !pageOverlay.contains(e.target)) closeMenu(); }, { passive: true });
  }
  function bindScrollListener() {
    const update = (y) => { const scrolled = (y || 0) > CONFIG.scrollThreshold; if (scrolled !== isScrolled) { isScrolled = scrolled; if (!isOpen) { applyTransitions(CONFIG.closeMs); applyTheme(); } } };
    smoothScrollInstance = getLenisLike();
    if (smoothScrollInstance?.on) {
      const handler = (e) => update(typeof e?.scroll === "number" ? e.scroll : getScrollTop());
      smoothScrollInstance.on("scroll", handler);
      smoothScrollUnsub = () => smoothScrollInstance.off?.("scroll", handler);
      update(getScrollTop());
    } else {
      const onScroll = () => { lastScrollY = getScrollTop(); if (!scrollTicking) { requestAnimationFrame(() => { update(lastScrollY); scrollTicking = false; }); scrollTicking = true; } };
      addL(window, "scroll", onScroll, { passive: true });
      update(getScrollTop());
    }
  }
  // Internal resize listener — handles within-desktop layout updates
  // (e.g. navbar height changing due to content wrapping at different widths).
  // Does NOT handle mode switching — matchMedia.change does that.
  function bindResizeListener() {
    addL(window, "resize", () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (!navbarContainer) return;
        // Re-read dimensions in case container width changed
        const style = getComputedStyle(navbarContainer);
        originalPaddingBottom = style.paddingBottom || "0px";
        originalMarginBottom = style.marginBottom || "0px";
        const newHeight = navbarContainer.offsetHeight;
        if (newHeight !== originalNavbarHeight) {
          originalNavbarHeight = newHeight;
          if (dropdownPortal) dropdownPortal.style.top = `${originalNavbarHeight}px`;
        }
        // Dropdowns may have reflowed
        dropdownHeightCache = new WeakMap();
        morphCache = new WeakMap();
        // If a dropdown is open, re-measure and update portal height
        if (isOpen && currentList) {
          const h = measureList(currentList);
          if (dropdownPortal) dropdownPortal.style.height = `${h}px`;
          setExpandedSpace(h, 0);
        }
      }, 150);
    }, { passive: true });
  }
  function cancelClose() { if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; } }
  function requestClose() { cancelClose(); closeTimer = setTimeout(closeMenu, CONFIG.closeDelayMs); }
  function cancelPending() { if (switchTimeout) { clearTimeout(switchTimeout); switchTimeout = null; } if (closeFallbackTimeout) { clearTimeout(closeFallbackTimeout); closeFallbackTimeout = null; } }
  function measureList(list) {
    const cached = dropdownHeightCache.get(list);
    if (cached !== undefined) return cached;
    const clone = list.cloneNode(true);
    clone.style.cssText = "position:relative!important;top:auto!important;opacity:1!important;visibility:visible!important;display:block!important;pointer-events:none!important;width:100%!important;";
    measureContainer.appendChild(clone);
    const h = clone.offsetHeight;
    measureContainer.removeChild(clone);
    dropdownHeightCache.set(list, h);
    return h;
  }
  function fullyResetListStyles(list) {
    if (!list) return;
    list.style.transition = "none"; list.style.opacity = "0"; list.style.visibility = "hidden"; list.style.pointerEvents = "none";
    for (const sel of MORPH_SELECTORS) { const el = list.querySelector(sel); if (el) { el.style.transition = "none"; el.style.opacity = "1"; } }
  }
  function resetAllLists(except = null) {
    for (const list of allDropdownLists) if (list && list !== except) fullyResetListStyles(list);
    for (const dd of menuDropdowns) {
      if (dd !== currentDropdown) {
        const ch = dd.querySelector(".dropdown-chevron"); if (ch) ch.style.transform = "rotate(0deg)";
        const t = dd.querySelector(".navbar_dropdwn-toggle"); if (t) t.setAttribute("aria-expanded", "false");
      }
    }
  }
  function openOrSwitch(dd) { if (currentDropdown === dd) return; cancelPending(); if (isOpen && currentDropdown) switchMenu(dd); else openMenu(dd); }
  function openMenu(dd) {
    const list = getListFor(dd); if (!list) return;
    cancelClose(); cancelPending(); resetAllLists(list);
    currentDropdown = dd; currentList = list; isOpen = true;
    const h = measureList(list);
    list.style.transition = "none"; list.style.opacity = "0"; list.style.visibility = "visible"; list.style.pointerEvents = "auto";
    dropdownPortal.style.height = `${h}px`; dropdownPortal.classList.add("is-open");
    void navbarContainer.offsetHeight;
    applyTransitions(CONFIG.openMs); applyTheme();
    const ch = dd.querySelector(".dropdown-chevron"); if (ch) ch.style.transform = "rotate(180deg)";
    dd.querySelector(".navbar_dropdwn-toggle")?.setAttribute("aria-expanded", "true");
    pageOverlay.classList.add("is-visible");
    setExpandedSpace(h, CONFIG.openMs);
    list.style.transition = `opacity ${CONFIG.openMs}ms ${CONFIG.ease}`; list.style.opacity = "1";
  }
  function switchMenu(next) {
    const prev = currentDropdown, prevList = currentList, nextList = getListFor(next);
    if (!nextList || next === prev) return;
    cancelClose(); cancelPending();
    currentDropdown = next; currentList = nextList;
    const h = measureList(nextList), dur = `${CONFIG.switchMs}ms`, ease = CONFIG.ease;
    const prevEls = prevList ? getMorphable(prevList) : {}, nextEls = getMorphable(nextList);
    if (prevList) prevList.style.pointerEvents = "none";
    nextList.style.transition = "none"; nextList.style.opacity = "1"; nextList.style.visibility = "visible"; nextList.style.pointerEvents = "auto";
    for (const sel in nextEls) { nextEls[sel].style.transition = "none"; nextEls[sel].style.opacity = "0"; }
    void nextList.offsetHeight;
    for (const sel in prevEls) { prevEls[sel].style.transition = `opacity ${dur} ${ease}`; prevEls[sel].style.opacity = "0"; }
    for (const sel in nextEls) { nextEls[sel].style.transition = `opacity ${dur} ${ease}`; nextEls[sel].style.opacity = "1"; }
    if (prevList && Object.keys(prevEls).length === 0) { prevList.style.transition = `opacity ${dur} ${ease}`; prevList.style.opacity = "0"; }
    if (prev) {
      const pc = prev.querySelector(".dropdown-chevron"); if (pc) { pc.style.transition = `transform ${dur} ${ease}`; pc.style.transform = "rotate(0deg)"; }
      prev.querySelector(".navbar_dropdwn-toggle")?.setAttribute("aria-expanded", "false");
    }
    const nc = next.querySelector(".dropdown-chevron"); if (nc) { nc.style.transition = `transform ${dur} ${ease}`; nc.style.transform = "rotate(180deg)"; }
    for (const t of allToggles) t.style.transition = `background-color ${dur} ${ease}, color ${dur} ${ease}`;
    applyTheme();
    dropdownPortal.style.transition = `height ${dur} ${ease}`; dropdownPortal.style.height = `${h}px`;
    setExpandedSpace(h, CONFIG.switchMs);
    next.querySelector(".navbar_dropdwn-toggle")?.setAttribute("aria-expanded", "true");
    const toClean = prevList, prevElsToReset = { ...prevEls };
    switchTimeout = setTimeout(() => {
      if (toClean && currentList !== toClean) {
        toClean.style.transition = "none"; toClean.style.opacity = "0"; toClean.style.visibility = "hidden"; toClean.style.pointerEvents = "none";
        for (const sel in prevElsToReset) { const el = prevElsToReset[sel]; if (el) { el.style.transition = "none"; el.style.opacity = "1"; } }
      }
      dropdownPortal.style.transition = "none"; switchTimeout = null;
    }, CONFIG.switchMs + 50);
  }
  function closeMenu() {
    if (!isOpen) return;
    cancelClose(); cancelPending();
    const dd = currentDropdown, list = currentList;
    currentDropdown = null; currentList = null; isOpen = false;
    const dur = `${CONFIG.closeMs}ms`, ease = CONFIG.ease;
    if (list) { list.style.transition = `opacity ${dur} ${ease}`; list.style.opacity = "0"; list.style.pointerEvents = "none"; }
    applyTransitions(CONFIG.closeMs); applyTheme();
    pageOverlay.classList.remove("is-visible");
    if (dd) {
      const ch = dd.querySelector(".dropdown-chevron"); if (ch) ch.style.transform = "rotate(0deg)";
      dd.querySelector(".navbar_dropdwn-toggle")?.setAttribute("aria-expanded", "false");
    }
    setExpandedSpace(0, CONFIG.closeMs);
    closeFallbackTimeout = setTimeout(() => {
      closeFallbackTimeout = null;
      if (!isOpen) { dropdownPortal.classList.remove("is-open"); dropdownPortal.style.height = "0"; resetAllLists(); applyTransitions(CONFIG.closeMs); applyTheme(); }
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
      injectStyles(); createOverlay(); createPortal(); createMeasureContainer();
      prepareDropdowns(); disableWebflowBehavior(); enhanceToggleA11y();
      bindEvents(); bindScrollListener(); bindResizeListener();
      allDropdownLists = Array.from(dropdownPortal.querySelectorAll(".navbar_dropdown-list"));
      requestAnimationFrame(() => { applyTransitions(0); applyTheme(); requestAnimationFrame(() => applyTransitions(CONFIG.closeMs)); });
    });
    motionQuery?.addEventListener?.("change", applyMotion);
  }
  function destroy() {
    cancelClose(); cancelPending();
    clearTimeout(resizeTimeout);
    motionQuery?.removeEventListener?.("change", applyMotion);
    dropdownListMap.forEach((list, dd) => { if (list && dd && list.parentNode === dropdownPortal) dd.appendChild(list); });
    dropdownListMap.clear(); morphCache = new WeakMap();
    for (const { el, event, handler, options } of boundListeners) el.removeEventListener(event, handler, options);
    boundListeners = [];
    if (smoothScrollUnsub) { smoothScrollUnsub(); smoothScrollUnsub = null; }
    styleElement?.parentNode?.removeChild(styleElement); styleElement = null;
    pageOverlay?.parentNode?.removeChild(pageOverlay);
    dropdownPortal?.parentNode?.removeChild(dropdownPortal);
    measureContainer?.parentNode?.removeChild(measureContainer);
    if (navbarContainer) {
      navbarContainer.style.transition = ""; navbarContainer.style.backgroundColor = "";
      navbarContainer.style.backdropFilter = ""; navbarContainer.style.webkitBackdropFilter = "";
      navbarContainer.style.paddingBottom = ""; navbarContainer.style.marginBottom = ""; navbarContainer.style.maxWidth = "";
    }
    for (const el of allTextElements) { el.style.color = ""; el.style.transition = ""; }
    for (const t of allToggles) { t.style.backgroundColor = ""; t.style.color = ""; t.style.transition = ""; }
    for (const dd of menuDropdowns) {
      const ch = dd.querySelector(".dropdown-chevron"); if (ch) { ch.style.transform = ""; ch.style.transition = ""; }
      const t = dd.querySelector(".navbar_dropdwn-toggle"); if (t) t.setAttribute("aria-expanded", "false");
    }
    navbarContainer = dropdownPortal = pageOverlay = measureContainer = null;
    menuDropdowns = allTextElements = allToggles = allDropdownLists = [];
    isScrolled = isOpen = false; currentDropdown = currentList = null;
    smoothScrollInstance = null; dropdownHeightCache = new WeakMap();
    originalPaddingBottom = originalMarginBottom = originalNavbarHeight = null;
  }

  SHARED.desktopInit = init;
  SHARED.desktopDestroy = destroy;

  // Graceful close before mode switch — force-close any open dropdown
  // instantly (no animation) so we don't leave visual artifacts.
  SHARED.desktopGracefulClose = () => {
    if (isOpen) {
      cancelClose(); cancelPending();
      isOpen = false;
      currentDropdown = null;
      currentList = null;
      if (pageOverlay) pageOverlay.classList.remove("is-visible");
      if (dropdownPortal) {
        dropdownPortal.classList.remove("is-open");
        dropdownPortal.style.height = "0";
      }
    }
  };
})();


/* ═══════════════════════════════════════════════
   MOBILE NAV — MINIMAL & FAST
   ═══════════════════════════════════════════════ */
(() => {
  "use strict";
  const SHARED = window.__wdNavShared;

  const OPEN_MS = 200;
  const CLOSE_MS = 160;
  const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
  const SCROLL_THRESHOLD = 48;
  const TOUCH_DEDUPE_MS = 500;

  let isOpen = false;
  let isScrolled = false;
  let body, navButton, navbarComponent, navbarContainer, navbarMenu;
  let listeners = [];
  let styleEl = null;
  let lastTouchAt = 0;
  let scrollTicking = false;
  let wfObserver = null;

  function addL(el, event, handler, options) {
    if (!el) return;
    el.addEventListener(event, handler, options);
    listeners.push({ el, event, handler, options });
  }

  function injectStyles() {
    const existing = document.getElementById("wd-navbar-mobile-styles");
    if (existing) existing.remove();

    styleEl = document.createElement("style");
    styleEl.id = "wd-navbar-mobile-styles";
    styleEl.textContent = `
@media (max-width: 991px) {
  .navbar_container {
    padding-bottom: 0 !important;
    margin-bottom: 0 !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    overflow: visible !important;
    max-width: 100% !important;
  }

  .navbar-dropdown-portal,
  .navbar-measure-container,
  .nav-page-overlay {
    display: none !important;
  }

  .navbar_menu {
    /* Override Webflow's @media (max-width: 991px) { .w-nav-menu { display: none } } */
    display: block !important;

    /* Full-viewport overlay positioning */
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    height: 100dvh !important; /* dynamic viewport height — respects iOS URL bar */
    max-width: none !important;
    margin: 0 !important;
    padding: 80px 24px 24px !important; /* top padding clears the fixed navbar */
    box-sizing: border-box !important;
    background: #000 !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch;
    z-index: 900 !important;

    /* Fade animation */
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity ${CLOSE_MS}ms ${EASE}, visibility 0s linear ${CLOSE_MS}ms;
  }
  .navbar_component.is-m-open .navbar_menu {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transition: opacity ${OPEN_MS}ms ${EASE}, visibility 0s linear 0s;
  }

  /* Menu items inside — stack vertically, readable on dark bg */
  .navbar_menu .navbar_menu-dropdown {
    display: block !important;
    width: 100% !important;
    margin-bottom: 8px !important;
  }
  .navbar_menu .navbar_dropdwn-toggle {
    display: flex !important;
    width: 100% !important;
    padding: 16px 0 !important;
    color: #fff !important;
    font-size: 1.25rem !important;
    justify-content: space-between !important;
    align-items: center !important;
  }

  .navbar_component,
  .navbar_container {
    background-color: transparent;
    transition: background-color ${CLOSE_MS}ms ${EASE};
  }
  .navbar_component.is-m-open {
    transition: background-color ${OPEN_MS}ms ${EASE};
  }
  .navbar_component.is-m-open,
  .navbar_container.is-m-dark {
    background-color: #000 !important;
  }

  .navbar_logo,
  .navbar_link,
  .navbar_dropdwn-toggle,
  .navbar_container .button.is-mobile,
  .menu-icon,
  .menu-icon_line-top,
  .menu-icon_line-middle,
  .menu-icon_line-bottom {
    transition:
      color ${CLOSE_MS}ms ${EASE},
      background-color ${CLOSE_MS}ms ${EASE},
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
      color ${OPEN_MS}ms ${EASE},
      background-color ${OPEN_MS}ms ${EASE},
      border-color ${OPEN_MS}ms ${EASE} !important;
  }

  .navbar_container.is-m-dark .navbar_logo,
  .navbar_container.is-m-dark .navbar_link,
  .navbar_container.is-m-dark .navbar_dropdwn-toggle {
    color: #fff !important;
  }
  .navbar_container.is-m-dark .button.is-mobile {
    color: #fff !important;
    border-color: rgba(255,255,255,0.2) !important;
  }
  .navbar_container.is-m-dark .menu-icon {
    background-color: #202020 !important;
  }
  .navbar_container.is-m-dark .menu-icon_line-top,
  .navbar_container.is-m-dark .menu-icon_line-middle,
  .navbar_container.is-m-dark .menu-icon_line-bottom {
    background-color: #fff !important;
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
}
    `.trim();
    document.head.appendChild(styleEl);
  }

  function applyOpenState() {
    if (isOpen) {
      navbarComponent.classList.add("is-m-open");
      navbarContainer.classList.add("is-m-dark");
    } else {
      navbarComponent.classList.remove("is-m-open");
      if (!isScrolled) navbarContainer.classList.remove("is-m-dark");
    }
  }

  function toggleMenu() {
    isOpen = !isOpen;
    applyOpenState();
  }

  function closeMenu() {
    if (!isOpen) return;
    isOpen = false;
    applyOpenState();
  }

  function bindNavButton() {
    console.log("[wd-nav] binding touchstart on navButton");
    addL(navButton, "touchstart", (e) => {
      console.log("[wd-nav] touchstart fired, isMobile:", SHARED.isMobile());
      if (!SHARED.isMobile()) return;
      if (e.touches && e.touches.length !== 1) return;
      lastTouchAt = Date.now();
      toggleMenu();
      e.preventDefault();
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

  function bindMenuLinks() {
    if (!navbarMenu) return;
    addL(navbarMenu, "click", (e) => {
      if (!SHARED.isMobile() || !isOpen) return;
      if (e.target.closest("a[href]")) {
        setTimeout(closeMenu, 0);
      }
    }, true);
  }

  function bindScroll() {
    addL(window, "scroll", () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        const was = isScrolled;
        isScrolled = window.scrollY > SCROLL_THRESHOLD;
        if (was !== isScrolled && !isOpen) {
          navbarContainer.classList.toggle("is-m-dark", isScrolled);
        }
        scrollTicking = false;
      });
    }, { passive: true });
  }

  function bindWebflowFallback() {
    wfObserver = new MutationObserver(() => {
      if (!SHARED.isMobile()) return;
      if (Date.now() - lastTouchAt < TOUCH_DEDUPE_MS) return;
      const wfOpen = navButton.classList.contains("w--open");
      if (wfOpen && !isOpen) { isOpen = true; applyOpenState(); }
      else if (!wfOpen && isOpen) { isOpen = false; applyOpenState(); }
    });
    wfObserver.observe(navButton, { attributes: true, attributeFilter: ["class"] });
  }

  function init() {
    // Log to console so we can debug what's happening
    console.log("[wd-nav] mobile init() called, readyState:", document.readyState);

    body = document.body;
    navButton = document.querySelector(".w-nav-button");
    navbarComponent = document.querySelector(".navbar_component");
    navbarContainer = document.querySelector(".navbar_container");
    navbarMenu = document.querySelector(".navbar_menu");

    console.log("[wd-nav] elements found:", {
      navButton: !!navButton,
      navbarComponent: !!navbarComponent,
      navbarContainer: !!navbarContainer,
      navbarMenu: !!navbarMenu,
    });

    if (!navButton || !navbarContainer) {
      console.warn("[wd-nav] required elements missing — will retry when DOM is ready");
      // Retry once DOM is fully parsed
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          if (SHARED.activeMode === "mobile" && !navButton) init();
        }, { once: true });
      } else {
        // DOM is already parsed — retry after a tick in case elements are injected late
        setTimeout(() => {
          if (SHARED.activeMode === "mobile" && !document.querySelector(".w-nav-button")) return;
          if (SHARED.activeMode === "mobile" && !navButton) init();
        }, 100);
      }
      return;
    }

    injectStyles();
    bindNavButton();
    bindMenuLinks();
    bindScroll();
    bindWebflowFallback();

    isScrolled = window.scrollY > SCROLL_THRESHOLD;
    if (isScrolled) navbarContainer.classList.add("is-m-dark");

    console.log("[wd-nav] mobile init complete, listeners bound to", navButton);
  }

  function destroy() {
    wfObserver?.disconnect();
    wfObserver = null;
    for (const { el, event, handler, options } of listeners) {
      el.removeEventListener(event, handler, options);
    }
    listeners = [];
    isOpen = false;
    styleEl?.parentNode?.removeChild(styleEl);
    styleEl = null;
    navbarComponent?.classList.remove("is-m-open");
    navbarContainer?.classList.remove("is-m-dark");

    // Clean Webflow's state so it doesn't leak into desktop mode
    navButton?.classList.remove("w--open");

    body = navButton = navbarComponent = navbarContainer = navbarMenu = null;
  }

  SHARED.mobileInit = init;
  SHARED.mobileDestroy = destroy;

  // Graceful close before destroy — force-close menu instantly so
  // mode transition doesn't leave a half-open menu visible
  SHARED.mobileGracefulClose = () => {
    if (isOpen && navbarComponent) {
      isOpen = false;
      navbarComponent.classList.remove("is-m-open");
      if (navbarContainer && !isScrolled) {
        navbarContainer.classList.remove("is-m-dark");
      }
    }
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
  function findAndApply() { applyHref(document.querySelector(".navbar_container .button.is-mobile")); }

  findAndApply();
  if (window.__ctaHrefObserver) window.__ctaHrefObserver.disconnect();
  window.__ctaHrefObserver = new MutationObserver((mutations) => {
    for (const m of mutations) for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches?.(".navbar_container .button.is-mobile") || node.querySelector?.(".navbar_container .button.is-mobile")) {
        findAndApply(); return;
      }
    }
  });
  window.__ctaHrefObserver.observe(document.body, { childList: true, subtree: true });
})();
