(function($) {

  let defaultOptions = {
    visualGridSize: 50,                 // Grid size in meters
    visualMargin: 10,                   // Margin in meters
    visualMarkerSize: 5,                // Marker size in meters
    visualGridColorA: '#888',           // First grid color
    visualGridColorB: '#AAA',           // Second grid color
    visualOutlineWidth: 4,              // Width of outlines (double the actual pixel size)
    visualOutlineColor: '#000',         // Color of outlines
    visualTextColor: '#000',            // Color of text (marker numbers)
    visualTargetColor: '#F66',          // Color of the target marker
    visualGunColor: '#6F6',             // Color of the gun marker
    visualSpotterColor: '#66F',         // Color of the spotter marker
    targetElements: [],
    targetListCss: ".target-list",
    targetTemplate: null,
    gunElements: [],
    gunListCss: ".gun-list",
    gunTemplate: null,
    gunTargetTemplate: null,
    updateDelay: 100,
    updateTimer: null,
    visualCss: ".visual-aid",
    visualElement: null
  };

  // Initialize on element(s)
  let init = function(el, options) {
    $(el).each(function() {
      let invokeStartup = false;
      // Init if not already done
      if (!this.hasOwnProperty("artyOptions")) {
        this.artyOptions = $.extend({}, defaultOptions);
        invokeStartup = true;
      }
      // Apply extra options
      if (typeof options == "object") {
        $.extend(this.artyOptions, options);
      }
      startup(this);
    });
  };

  // Startup function (called after initializing a new element)
  let startup = function(el) {
    addTarget(el);
    addGun(el);
    initVisualAid(el);
    $(window).resize(function() {
      updateLazy(el);
    });
  };

  /****************************************************************************
   *                        HELPER FUNCTIONS                                  *
   ****************************************************************************/

  // Convert from degrees to radians
  let calcDegToRad = function(degAngle) {
    return degAngle * (Math.PI / 180);
  };

  // Convert from radians to degrees
  let calcRadToDeg = function(radAngle) {
    return radAngle * (180 / Math.PI);
  };

  // Convert from azim angle to polar
  let calcAzimToPolar = function(azimAngle) {
    return (azimAngle - 90) * -1;
  };

  // Convert azim angle + distance into polar coordiantes
  let calcAzimToCartesian = function(dist, azimAngle, offsetX, offsetY) {
    if (typeof offsetX == "undefined") { offsetX = 0.0; }
    if (typeof offsetY == "undefined") { offsetY = 0.0; }
    let polarAngle = calcDegToRad(calcAzimToPolar(azimAngle));
    return {
      dist: dist, azim: azimAngle, polar: polarAngle,
      x: offsetX + dist * Math.cos(polarAngle),
      y: offsetY + dist * Math.sin(polarAngle)
    };
  };

  // Convert a cartesian offset into azim angle + distance
  let calcCartesianToAzim = function(dstX, dstY, srcX, srcY) {
    if (typeof srcX == "undefined") { srcX = 0.0; }
    if (typeof srcY == "undefined") { srcY = 0.0; }
    var dist = Math.sqrt(Math.pow(dstX - srcX, 2) + Math.pow(dstY - srcY, 2));
    var azimAngle = 0;
    if (dist > 0) {
      azimAngle = calcRadToDeg( Math.asin(Math.abs(dstX - srcX) / dist) );
      if ((dstX < srcX) && (dstY >= srcY)) {
        azimAngle = 360 - azimAngle;
      } else if ((dstX < srcX) && (dstY < srcY)) {
        azimAngle = 180 + azimAngle;
      } else if ((dstX >= srcX) && (dstY < srcY)) {
        azimAngle = 180 - azimAngle;
      }
    }
    return {
      dist: dist, azim: azimAngle
    };
  };

  /****************************************************************************
   *                        TARGET FUNCTIONS                                  *
   ****************************************************************************/

  // Add new target (input form)
  let addTarget = function(el) {
    let elTarget = $(el.artyOptions.targetTemplate);
    $(el).find(el.artyOptions.targetListCss).append(elTarget);
    el.artyOptions.targetElements.push(elTarget);
    let i = el.artyOptions.targetElements.length;
    elTarget.find('[data-input="target-distance"]').on("change", function() {
      updateLazy(el);
    });
    elTarget.find('[data-input="target-azimuth"]').on("change", function() {
      let value = parseFloat($(this).val());
      if (!isNaN(value)) {
        if (value < 0) {
          $(this).val(360 + value);
        } else if (value > 360) {
          $(this).val(value - 360);
        }
      }
      updateLazy(el);
    });
    elTarget.find('[data-action="target-add"]').on("click", function(e) {
      e.preventDefault();
      addTarget(el);
    });
    elTarget.find('[data-action="target-delete"]').on("click", function(e) {
      e.preventDefault();
      let index = $(this).closest("[data-arty-target]").attr("data-arty-target");
      delTarget(el, index);
    });
    updateTargetIndex(el, elTarget, i);
    // Update
    updateGunTargets(el);
    updateLazy(el);
  };

  // Delete target (input form)
  let delTarget = function(el, i) {
    if (el.artyOptions.targetElements.length == 1) {
      alert("You need at least 1 target!");
      return;
    }
    // Update following targets
    for (let j = i; j < el.artyOptions.targetElements.length; j++) {
      updateTargetIndex(el, $(el.artyOptions.targetElements[j]), j);
    }
    // Remove target
    let elTargetJs = el.artyOptions.targetElements.splice(i-1, 1);
    $(elTargetJs[0]).remove();
    // Update
    updateGunTargets(el);
    updateLazy(el);
  };

  // Update index number (input form)
  let updateTargetIndex = function(el, elTarget, i) {
    elTarget.attr("data-arty-target", i).find(".target-index").text(i);
  };

  /****************************************************************************
   *                          GUN FUNCTIONS                                   *
   ****************************************************************************/

  // Add new gun (input form)
  let addGun = function(el) {
    let elGun = $(el.artyOptions.gunTemplate);
    $(el).find(el.artyOptions.gunListCss).append(elGun);
    el.artyOptions.gunElements.push(elGun);
    let i = el.artyOptions.gunElements.length;
    elGun.find('[data-input="gun-distance"]').on("change", function() {
      updateLazy(el);
    });
    elGun.find('[data-input="gun-azimuth"]').on("change", function() {
      let value = parseFloat($(this).val());
      if (!isNaN(value)) {
        if (value < 0) {
          $(this).val(360 + value);
        } else if (value > 360) {
          $(this).val(value - 360);
        }
      }
      updateLazy(el);
    });
    elGun.find('[data-action="gun-add"]').on("click", function(e) {
      e.preventDefault();
      addGun(el);
    });
    elGun.find('[data-action="gun-delete"]').on("click", function(e) {
      e.preventDefault();
      let index = $(this).closest("[data-arty-gun]").attr("data-arty-gun");
      delGun(el, index);
    });
    updateGunIndex(el, elGun, i);
    updateGunTargets(el, elGun);
    // Update
    updateLazy(el);
  };

  // Delete gun (input form)
  let delGun = function(el, i) {
    if (el.artyOptions.gunElements.length == 1) {
      alert("You need at least 1 target!");
      return;
    }
    // Update following targets
    for (let j = i; j < el.artyOptions.gunElements.length; j++) {
      updateGunIndex(el, $(el.artyOptions.gunElements[j]), j);
    }
    // Remove target
    let elGunJs = el.artyOptions.gunElements.splice(i-1, 1);
    $(elGunJs[0]).remove();
    // Update
    updateLazy(el);
  };

  // Update index number (input form)
  let updateGunIndex = function(el, elGun, i) {
    elGun.attr("data-arty-gun", i).find(".gun-index").text(i);
  };

  // Update target list (input form)
  let updateGunTargets = function(el, elGun) {
    if (typeof elGun == "undefined") {
      jQuery(el.artyOptions.gunElements).each(function() {
        updateGunTargets(el, this);
      });
      return;
    }
    elGun.find('[data-list="targets"]').each(function() {
      let elGunTargetList = this;
      $(elGunTargetList).html("");
      let i = 0;
      jQuery(el.artyOptions.targetElements).each(function() {
        let elGunTarget = $(el.artyOptions.gunTargetTemplate);
        $(elGunTargetList).append(elGunTarget);
        elGunTarget.find(".target-index").text(i + 1);
        elGunTarget.find('[data-input="gun-target"]').attr("data-index", i + 1);
        elGunTarget.find('[data-action="gun-target-copy"]').on("click", function(e) {
          e.preventDefault();
          let text = elGunTarget.find('[data-input="gun-target"]').val() || "";
          navigator.clipboard.writeText(text);
        });
        i++;
      });
    });
  };

  /****************************************************************************
   *                       GENERAL FUNCTIONS                                  *
   ****************************************************************************/

  // Update values and visuals after a short delay
  let updateLazy = function(el) {
    if (el.artyOptions.updateTimer !== null) {
      window.clearTimeout(el.artyOptions.updateTimer);
      el.artyOptions.updateTimer = null;
    }
    el.artyOptions.updateTimer = window.setTimeout(function() {
      el.artyOptions.updateTimer = null;
      updateNow(el);
    }, el.artyOptions.updateDelay);
  };

  // GENERAL - Update values for all gun targets
  let updateNow = function(el) {
    updateGunTargetValues(el);
    updateVisualAid(el);
  };

  // GENERAL - Update values for all gun targets
  let updateGunTargetValues = function(el) {
    jQuery(el.artyOptions.gunElements).each(function() {
      let elGunJs = this;
      let gunDist = $(this).find('[data-input="gun-distance"]').val() || 0;
      let gunAngleAzim = $(this).find('[data-input="gun-azimuth"]').val() || 0;
      let gunPosition = null;
      if ((gunDist !== "") && (gunAngleAzim !== "")) {
        gunPosition = calcAzimToCartesian(gunDist, gunAngleAzim);
      }
      let i = 0;
      jQuery(el.artyOptions.targetElements).each(function() {
        let targetDist = $(this).find('[data-input="target-distance"]').val() || 0;
        let targetAngleAzim = $(this).find('[data-input="target-azimuth"]').val() || 0;
        let targetPosition = null;
        if ((targetDist !== "") && (targetAngleAzim !== "")) {
          targetPosition = calcAzimToCartesian(targetDist, targetAngleAzim);
        }
        let targetText = "";
        if ((gunPosition !== null) && (targetPosition !== null)) {
          let gunTargetPolar = calcCartesianToAzim(targetPosition.x, targetPosition.y, gunPosition.x, gunPosition.y);
          targetText = "Dist "+(Math.floor(gunTargetPolar.dist * 10) / 10)+"m "+
            "Azim "+(Math.floor(gunTargetPolar.azim * 10) / 10)+"deg";
        }
        $(elGunJs).find('[data-input="gun-target"][data-index="'+(i+1)+'"]').val(targetText);
        i++;
      });
    });

  };

  // VISUAL AID - Initialize visual aid
  let initVisualAid = function(el) {
    if (el.artyOptions.visualElement !== null) {
      return; // Already initialized
    }
    el.artyOptions.visualElement = $(el).find(el.artyOptions.visualCss);
    if (el.artyOptions.visualElement.length == 0) {
      el.artyOptions.visualElement = null;
    } else {
      if (el.artyOptions.visualElement.is("canvas")) {
        el.artyOptions.visualElement = el.artyOptions.visualElement[0];
      } else {
        el.artyOptions.visualElement.append("<canvas style='width: 100%; height: calc(100vh - 50px);'></canvas>");
        el.artyOptions.visualElement = el.artyOptions.visualElement.find("canvas")[0];
      }
      updateVisualAid(el);
    }
  };

  // VISUAL AID - Update graphics
  let updateVisualAid = function(el) {
    if (el.artyOptions.visualElement === null) {
      return; // Canvas not present/found
    }
    let w = $(el.artyOptions.visualElement).innerWidth() * 2;
    let h = $(el.artyOptions.visualElement).innerHeight() * 2;
    el.artyOptions.visualElement.width = w;
    el.artyOptions.visualElement.height = h;
    let ctx = el.artyOptions.visualElement.getContext("2d");
    let i;
    // Target positions
    let targetPositions = [];
    i = 0;
    jQuery(el.artyOptions.targetElements).each(function() {
      let targetDist = $(this).find('[data-input="target-distance"]').val() || 0;
      let targetAngleAzim = $(this).find('[data-input="target-azimuth"]').val() || 0;
      if ((targetDist !== "") && (targetAngleAzim !== "")) {
        targetPositions.push(calcAzimToCartesian(targetDist, targetAngleAzim));
      }
      i++;
    });
    // Gun positions
    let gunPositions = [];
    i = 0;
    jQuery(el.artyOptions.gunElements).each(function() {
      let gunDist = $(this).find('[data-input="gun-distance"]').val() || 0;
      let gunAngleAzim = $(this).find('[data-input="gun-azimuth"]').val() || 0;
      if ((gunDist !== "") && (gunAngleAzim !== "")) {
        gunPositions.push(calcAzimToCartesian(gunDist, gunAngleAzim));
      }
      i++;
    });
    // Calculate optimal scale
    let margin = el.artyOptions.visualMargin;
    let scale = 1.0;
    let offsetX = w * 0.5;
    let offsetY = h * 0.5;
    if ((targetPositions.length > 0) || (gunPositions.length > 0)) {
      let minX = 0, minY = 0, maxX = 0, maxY = 0;
      for (i = 0; i < targetPositions.length; i++) {
        minX = Math.min(minX, targetPositions[i].x);
        minY = Math.min(minY, targetPositions[i].y);
        maxX = Math.max(maxX, targetPositions[i].x);
        maxY = Math.max(maxY, targetPositions[i].y);
      }
      for (i = 0; i < gunPositions.length; i++) {
        minX = Math.min(minX, gunPositions[i].x);
        minY = Math.min(minY, gunPositions[i].y);
        maxX = Math.max(maxX, gunPositions[i].x);
        maxY = Math.max(maxY, gunPositions[i].y);
      }
      minX -= margin;
      minY -= margin;
      maxX += margin;
      maxY += margin;
      let sizeX = maxX - minX, sizeY = maxY - minY;
      let scaleX = w / sizeX, scaleY = h / sizeY;
      scale = Math.min(scaleX, scaleY);
      offsetX = minX * -1;
      offsetY = minY * -1;
      if (scaleX > scaleY) {
        offsetX += (w / scale - sizeX) / 2;
      } else {
        offsetY += (h / scale - sizeY) / 2;
      }
    }
    let localX, localY;
    let gridSize = el.artyOptions.visualGridSize;
    let markerSize = el.artyOptions.visualMarkerSize;
    // Fill Background
    ctx.fillStyle = el.artyOptions.visualGridColorA;
    ctx.fillRect(0, 0, w, h);
    let gridPatternX = Math.floor(offsetX / gridSize);
    let gridPatternY = Math.floor(offsetY / gridSize);
    let gridPattern = (gridPatternX + gridPatternY) % 2
    let gridOffsetX = offsetX % gridSize;
    let gridOffsetY = offsetY % gridSize;
    let gridCountX = Math.ceil(w / scale / gridSize) + 1;
    let gridCountY = Math.ceil(h / scale / gridSize) + 1;
    ctx.fillStyle = el.artyOptions.visualGridColorB;
    for (let gridY = 0; gridY < gridCountY; gridY++) {
      let gridFill = (gridY % 2 == gridPattern);
      for (let gridX = 0; gridX < gridCountX; gridX++) {
        if (gridFill) {
          ctx.fillRect(
            ((gridX - 1) * gridSize + gridOffsetX) * scale,
            ((gridY - 1) * gridSize + gridOffsetY) * scale,
            gridSize * scale, gridSize * scale
          );
        }
        gridFill = !gridFill;
      }
    }
    // Set font
    ctx.font = (markerSize * 1.75 * scale)+'px serif';
    ctx.textBaseline = 'middle';
    // Draw targets
    ctx.lineWidth = el.artyOptions.visualOutlineWidth;
    ctx.strokeStyle = el.artyOptions.visualOutlineColor;
    for (i = 0; i < targetPositions.length; i++) {
      let markerText = i+1;
      localX = (targetPositions[i].x + offsetX) * scale;
      localY = (targetPositions[i].y + offsetY) * scale;
      ctx.fillStyle = el.artyOptions.visualTargetColor;
      ctx.beginPath();
      ctx.arc(localX, localY, markerSize * scale, 0, 2 * Math.PI, false);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = el.artyOptions.visualTextColor;
      let textMetric = ctx.measureText(markerText);
      ctx.fillText(markerText, localX - textMetric.width / 2, localY);
    }
    // Draw guns
    ctx.strokeStyle = el.artyOptions.visualOutlineColor;
    for (i = 0; i < gunPositions.length; i++) {
      let markerText = i+1;
      localX = (gunPositions[i].x + offsetX) * scale;
      localY = (gunPositions[i].y + offsetY) * scale;
      ctx.fillStyle = el.artyOptions.visualGunColor;
      ctx.beginPath();
      ctx.arc(localX, localY, markerSize * scale, 0, 2 * Math.PI, false);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = el.artyOptions.visualTextColor;
      let textMetric = ctx.measureText(markerText);
      ctx.fillText(markerText, localX - textMetric.width / 2, localY);
    }
    // Draw spotter
    ctx.fillStyle = el.artyOptions.visualSpotterColor;
    ctx.strokeStyle = el.artyOptions.visualOutlineColor;
    localX = offsetX * scale;
    localY = offsetY * scale;
    ctx.beginPath();
    ctx.arc(localX, localY, markerSize * scale, 0, 2 * Math.PI, false);
    ctx.fill();
    ctx.stroke();
  };

  $.fn.arty = function(action, ...params) {
    if (typeof action == "string") {
      $(this).each(function() {
        switch (action) {
          case "addTarget":
            addTarget(this);
            break;
          case "delTarget":
          case "deleteTarget":
          case "remTarget":
          case "removeTarget":
            delTarget(this, ...params);
            break;
          case "addGun":
            addGun(this);
            break;
          case "delGun":
          case "deleteGun":
          case "remGun":
          case "removeGun":
            delGun(this, ...params);
            break;
          case "update":
            updateNow(this);
            break;
          default:
            console.log(action, ...params);
            break;
        }
      });
    } else {
      init(this, action);
    }
    return this;
  };

})(jQuery);
