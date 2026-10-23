/* Training Video Cards. Reads the generated catalogue and plays one clip
   in the existing player. Cards render only for the open module. */
(function () {
  "use strict";

  var openGroup = "";
  var openModule = "";

  function catalog() {
    return window.NEXUS_VIDEO_CATALOG && window.NEXUS_VIDEO_CATALOG.groups;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function chips(video) {
    var html = "";
    (video.phases || []).forEach(function (phase) {
      html += '<span class="vc-chip">' + esc(phase) + "</span>";
    });
    if (video.guess) html += '<span class="vc-chip is-mark">guess</span>';
    if (video.check) html += '<span class="vc-chip is-mark">check</span>';
    return html ? '<span class="vc-chips">' + html + "</span>" : "";
  }

  function cardHtml(video) {
    var picked = window.NexusBuilder && window.NexusBuilder.picked && window.NexusBuilder.picked(video.key);
    return '<button type="button" class="vc-card" data-vc-key="' + esc(video.key) + '" data-vc-src="' + esc(video.src) + '" data-vc-cabin="' + esc(video.cabin) + '" data-vc-title="' + esc(video.title) + '">' +
      '<span class="vc-card-top"><span class="vc-card-title">' + esc(video.title) + "</span>" +
      (picked ? '<span class="vc-in" aria-label="In this section">✓</span>' : "") +
      "</span>" +
      chips(video) +
      "</button>";
  }

  function render() {
    var root = document.getElementById("vc-list");
    var groups = catalog();
    if (!root || !groups) return;
    var html = "";
    groups.forEach(function (group) {
      var open = group.id === openGroup;
      html += '<section class="vc-block' + (open ? " is-open" : "") + '">';
      html += '<button type="button" class="vc-cabin" data-vc-group="' + esc(group.id) + '" aria-expanded="' + (open ? "true" : "false") + '">' +
        '<span class="vc-name">' + esc(group.name) + '</span><span class="vc-count">' + group.count + "</span></button>";
      if (open) {
        html += '<div class="vc-mods"><div class="vc-mods-inner">';
        group.modules.forEach(function (mod) {
          var modOpen = openModule === mod.id;
          html += '<div class="vc-mod-block' + (modOpen ? " is-open" : "") + '">';
          html += '<button type="button" class="vc-mod" data-vc-module="' + esc(mod.id) + '" aria-expanded="' + (modOpen ? "true" : "false") + '">' +
            '<span class="vc-name">' + esc(mod.name) + '</span><span class="vc-count">' + mod.count + "</span></button>";
          if (modOpen) {
            html += '<div class="vc-cards">';
            mod.videos.forEach(function (video) { html += cardHtml(video); });
            html += "</div>";
          }
          html += "</div>";
        });
        html += "</div></div>";
      }
      html += "</section>";
    });
    root.innerHTML = html;
  }

  function onClick(event) {
    var card = event.target.closest(".vc-card");
    if (card) {
      event.preventDefault();
      if (window.NexusBuilder && window.NexusBuilder.takeCard && window.NexusBuilder.takeCard({
        key: card.getAttribute("data-vc-key"),
        src: card.getAttribute("data-vc-src"),
        cabin: card.getAttribute("data-vc-cabin"),
        title: card.getAttribute("data-vc-title")
      })) return;
      if (window.RelicArchitect && window.RelicArchitect.openCatalogClip) {
        window.RelicArchitect.openCatalogClip({
          title: card.getAttribute("data-vc-title"),
          src: card.getAttribute("data-vc-src"),
          cabin: card.getAttribute("data-vc-cabin"),
          key: card.getAttribute("data-vc-key")
        });
      }
      return;
    }
    var mod = event.target.closest(".vc-mod");
    if (mod) {
      event.preventDefault();
      var nextMod = mod.getAttribute("data-vc-module") || "";
      openModule = openModule === nextMod ? "" : nextMod;
      render();
      return;
    }
    var cabin = event.target.closest(".vc-cabin");
    if (!cabin) return;
    event.preventDefault();
    var next = cabin.getAttribute("data-vc-group") || "";
    if (openGroup === next) {
      openGroup = "";
      openModule = "";
    } else {
      openGroup = next;
      openModule = "";
    }
    render();
  }

  function boot() {
    var root = document.getElementById("vcards-root");
    if (root) root.addEventListener("click", onClick);
    if (document.body && document.body.classList.contains("is-cards")) render();
  }

  window.NexusCards = { render: render };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
