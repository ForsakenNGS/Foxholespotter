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
    visualReferenceColor: '#FF6',       // Color of the reference point marker
    referenceElements: [],
    referenceListCss: ".reference-list",
    referenceTemplate: null,
    targetElements: [],
    targetListCss: ".target-list",
    targetTemplate: null,
    gunElements: [],
    gunListCss: ".gun-list",
    gunTemplate: null,
    gunTargetTemplate: null,
    positions: null,
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
    updateNow(el);
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
      y: offsetY + dist * Math.sin(polarAngle) * -1
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
      if ((dstX < srcX) && (dstY <= srcY)) {
        azimAngle = 360 - azimAngle;
      } else if ((dstX < srcX) && (dstY > srcY)) {
        azimAngle = 180 + azimAngle;
      } else if ((dstX >= srcX) && (dstY > srcY)) {
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
    bindCard(el, elTarget);
    // Update
    updateGunTargets(el);
    updateLazy(el);
    return i;
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
   *                       REFERENCE FUNCTIONS                                *
   ****************************************************************************/

  // Add new reference (input form)
  let addReference = function(el) {
    let elReference = $(el.artyOptions.referenceTemplate);
    $(el).find(el.artyOptions.referenceListCss).append(elReference);
    el.artyOptions.referenceElements.push(elReference);
    let i = el.artyOptions.referenceElements.length;
    elReference.find('[data-input="reference-distance"]').on("change", function() {
      updateLazy(el);
    });
    elReference.find('[data-input="reference-azimuth"]').on("change", function() {
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
    elReference.find('[data-action="reference-add"]').on("click", function(e) {
      e.preventDefault();
      addReference(el);
    });
    elReference.find('[data-action="reference-delete"]').on("click", function(e) {
      e.preventDefault();
      let index = $(this).closest("[data-arty-reference]").attr("data-arty-reference");
      delReference(el, index);
    });
    updateReferenceIndex(el, elReference, i);
    bindCard(el, elReference);
    // Update
    updateGunReferences(el);
    updateReferenceRefeferences(el);
    updateLazy(el);
    return i;
  };

  // Delete reference (input form)
  let delReference = function(el, i) {
    // Update following references
    for (let j = i; j < el.artyOptions.referenceElements.length; j++) {
      updateReferenceIndex(el, $(el.artyOptions.referenceElements[j]), j);
    }
    // Remove reference
    let elReferenceJs = el.artyOptions.referenceElements.splice(i-1, 1);
    $(elReferenceJs[0]).remove();
    // Update
    updateGunReferences(el);
    updateReferenceRefeferences(el);
    updateLazy(el);
  };

  // Update index number (input form)
  let updateReferenceIndex = function(el, elReference, i) {
    elReference.attr("data-arty-reference", i).find(".reference-index").text(i);
  };

  // Update reference list (input form)
  let updateReferenceRefeferences = function(el, elReference, index) {
    if (typeof elReference == "undefined") {
      let i = 1;
      jQuery(el.artyOptions.referenceElements).each(function() {
        updateReferenceRefeferences(el, this, i);
        i++;
      });
      return;
    }
    elReference.find('[data-input="reference-reference"]').each(function() {
      let elReferenceList = this;
      let elReferenceValue = $(this).val() || "spotter";
      $(elReferenceList).html('<option value="spotter">Spotter to Ref-Point '+index+'</option>');
      // Add reference points
      let i = 1;
      jQuery(el.artyOptions.referenceElements).each(function() {
        if (i < index) {
          let elReference = $('<option value="ref-point-'+i+'">Ref-Point '+index+' to Ref-Point '+i+'</option>');
          $(elReferenceList).append(elReference);
        }
        i++;
      });
      // Restore previous selection if possible
      $(this).val(elReferenceValue)
    });
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
    elGun.find('[data-input="gun-reference"]').on("change", function() {
      updateLazy(el);
    });
    elGun.find('[data-input="gun-distance"]').on("change", function() {
      updateLazy(el);
    });
    elGun.find('[data-input="gun-correction-x"],[data-input="gun-correction-y"]').on("change", function() {
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
    elGun.find('[data-action="gun-add-reference"]').on("click", function(e) {
      e.preventDefault();
      let referenceIndex = addReference(el);
      elGun.find('[data-input="gun-reference"]').val("ref-point-"+referenceIndex)
    });
    elGun.find('[data-action="gun-delete"]').on("click", function(e) {
      e.preventDefault();
      let index = $(this).closest("[data-arty-gun]").attr("data-arty-gun");
      delGun(el, index);
    });
    updateGunIndex(el, elGun, i);
    updateGunTargets(el, elGun);
    updateGunReferences(el, elGun);
    bindCard(el, elGun);
    // Update
    updateLazy(el);
    return i;
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

  // Update reference list (input form)
  let updateGunReferences = function(el, elGun) {
    if (typeof elGun == "undefined") {
      jQuery(el.artyOptions.gunElements).each(function() {
        updateGunReferences(el, this);
      });
      return;
    }
    elGun.find('[data-input="gun-reference"]').each(function() {
      let elGunReferenceList = this;
      let elGunReferenceValue = $(this).val() || "spotter";
      $(elGunReferenceList).html('<option value="spotter">Spotter to Gun</option>');
      // Add reference points
      let i = 1;
      jQuery(el.artyOptions.referenceElements).each(function() {
        let elGunReference = $('<option value="ref-point-'+i+'">Gun to Ref-Point '+i+'</option>');
        $(elGunReferenceList).append(elGunReference);
        i++;
      });
      // Restore previous selection if possible
      $(this).val(elGunReferenceValue);
      if ($(this).val() === null) {
        $(this).val("spotter");
      }
    });
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

  let bindCard = function(el, elCard) {
    $(elCard).find('[data-action="card-minimize"]').on("click", function(e) {
      e.preventDefault();
      minimizeCard(el, elCard);
    });
    $(elCard).find('[data-action="card-maximize"]').on("click", function(e) {
      e.preventDefault();
      maximizeCard(el, elCard);
    });
    maximizeCard(el, elCard);
  };

  let minimizeCard = function(el, elCard) {
    $(elCard).find('[data-visible="maximized"]').hide();
    $(elCard).find('[data-visible="minimized"]').show();
  };

  let maximizeCard = function(el, elCard) {
    $(elCard).find('[data-visible="minimized"]').hide();
    $(elCard).find('[data-visible="maximized"]').show();
  };

  let getPosition = function(el, referenceId) {
    if (referenceId == "spotter") {
      return { x: 0, y: 0 };
    } else {
      // To reference point
      let referenceMatch = referenceId.match(/^ref-point-([0-9]+)$/i);
      if (referenceMatch.length > 1) {
        let referenceIndex = parseInt(referenceMatch[1]) - 1;
        if ((el.artyOptions.positions !== null) && (el.artyOptions.positions.references.length > referenceIndex)) {
          return el.artyOptions.positions.references[referenceIndex];
        }
      }
      return { x: 0, y: 0 };
    }
  };

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

  // Update values for all gun targets
  let updateNow = function(el) {
    updatePositions(el);
    updateGunTargetValues(el);
    updateVisualAid(el);
  };

  // Update positions of all markers
  let updatePositions = function(el) {
    el.artyOptions.positions = {
      targets: [],
      references: [],
      guns: [],
      valid: true
    };
    let i = 0;
    // Target positions
    i = 0;
    jQuery(el.artyOptions.targetElements).each(function() {
      let dist = parseFloat($(this).find('[data-input="target-distance"]').val() || 0);
      let azimAngle = parseFloat($(this).find('[data-input="target-azimuth"]').val() || 0);
      if ((dist !== "") && (azimAngle !== "")) {
        el.artyOptions.positions.targets.push(calcAzimToCartesian(dist, azimAngle));
      } else {
        el.artyOptions.positions.targets.push({ x: 0, y: 0 });
        el.artyOptions.positions.valid = false;
      }
      i++;
    });
    // Reference positions
    i = 0;
    jQuery(el.artyOptions.referenceElements).each(function() {
      let referenceId = $(this).find('[data-input="reference-reference"]').val() || "spotter";
      let referencePos = getPosition(el, referenceId);
      let dist = parseFloat($(this).find('[data-input="reference-distance"]').val() || 0);
      let azimAngle = parseFloat($(this).find('[data-input="reference-azimuth"]').val() || 0);
      if ((dist !== "") && (azimAngle !== "")) {
        if (referenceId != "spotter") {
          // Reverse direction if gun to reference point
          azimAngle = (azimAngle + 180) % 360;
        }
        el.artyOptions.positions.references.push(calcAzimToCartesian(dist, azimAngle, referencePos.x, referencePos.y));
      } else {
        el.artyOptions.positions.references.push({ x: 0, y: 0 });
        el.artyOptions.positions.valid = false;
      }
      i++;
    });
    // Gun positions
    i = 0;
    jQuery(el.artyOptions.gunElements).each(function() {
      let referenceId = $(this).find('[data-input="gun-reference"]').val() || "spotter";
      let referencePos = getPosition(el, referenceId);
      let dist = parseFloat($(this).find('[data-input="gun-distance"]').val() || 0);
      let azimAngle = parseFloat($(this).find('[data-input="gun-azimuth"]').val() || 0);
      if ((dist !== "") && (azimAngle !== "")) {
        if (referenceId != "spotter") {
          // Reverse direction if gun to reference point
          azimAngle = (azimAngle + 180) % 360;
        }
        el.artyOptions.positions.guns.push(calcAzimToCartesian(dist, azimAngle, referencePos.x, referencePos.y));
      } else {
        el.artyOptions.positions.guns.push({ x: 0, y: 0 });
        el.artyOptions.positions.valid = false;
      }
      i++;
    });
    return el.artyOptions.positions.valid;
  };

  // Update values for all gun targets
  let updateGunTargetValues = function(el) {
    let gunIndex = 0;
    jQuery(el.artyOptions.gunElements).each(function() {
      let elGunJs = this;
      let gunPosition = el.artyOptions.positions.guns[gunIndex];
      gunPosition.aimTargets = [];
      let correctionX = parseFloat($(this).find('[data-input="gun-correction-x"]').val() || 0);
      let correctionY = parseFloat($(this).find('[data-input="gun-correction-y"]').val() || 0);
      let targetIndex = 0;
      jQuery(el.artyOptions.targetElements).each(function() {
        let targetPosition = el.artyOptions.positions.targets[targetIndex];
        let aimPosition = {
          x: targetPosition.x + correctionX,
          y: targetPosition.y - correctionY
        };
        gunPosition.aimTargets.push(aimPosition);
        let gunTargetPolar = calcCartesianToAzim(aimPosition.x, aimPosition.y, gunPosition.x, gunPosition.y);
        let targetText = "Dist "+(Math.floor(gunTargetPolar.dist * 10) / 10)+"m "+
            "Azim "+(Math.floor(gunTargetPolar.azim * 10) / 10)+"deg";
        $(elGunJs).find('[data-input="gun-target"][data-index="'+(targetIndex+1)+'"]').val(targetText);
        targetIndex++;
      });
      gunIndex++;
    });
  };

  /****************************************************************************
   *                     VISUAL AID FUNCTIONS                                 *
   ****************************************************************************/

  // Initialize visual aid
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
    }
  };

  // Update graphics
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
    // Calculate optimal scale
    let margin = el.artyOptions.visualMargin;
    let scale = 1.0;
    let offsetX = w * 0.5;
    let offsetY = h * 0.5;
    let minX = 0, minY = 0, maxX = 0, maxY = 0;
    for (i = 0; i < el.artyOptions.positions.targets.length; i++) {
      minX = Math.min(minX, el.artyOptions.positions.targets[i].x);
      minY = Math.min(minY, el.artyOptions.positions.targets[i].y);
      maxX = Math.max(maxX, el.artyOptions.positions.targets[i].x);
      maxY = Math.max(maxY, el.artyOptions.positions.targets[i].y);
    }
    for (i = 0; i < el.artyOptions.positions.references.length; i++) {
      minX = Math.min(minX, el.artyOptions.positions.references[i].x);
      minY = Math.min(minY, el.artyOptions.positions.references[i].y);
      maxX = Math.max(maxX, el.artyOptions.positions.references[i].x);
      maxY = Math.max(maxY, el.artyOptions.positions.references[i].y);
    }
    for (i = 0; i < el.artyOptions.positions.guns.length; i++) {
      minX = Math.min(minX, el.artyOptions.positions.guns[i].x);
      minY = Math.min(minY, el.artyOptions.positions.guns[i].y);
      maxX = Math.max(maxX, el.artyOptions.positions.guns[i].x);
      maxY = Math.max(maxY, el.artyOptions.positions.guns[i].y);
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
    // Draw reference points
    ctx.lineWidth = el.artyOptions.visualOutlineWidth;
    ctx.strokeStyle = el.artyOptions.visualOutlineColor;
    for (i = 0; i < el.artyOptions.positions.references.length; i++) {
      let markerText = i+1;
      localX = (el.artyOptions.positions.references[i].x + offsetX) * scale;
      localY = (el.artyOptions.positions.references[i].y + offsetY) * scale;
      ctx.fillStyle = el.artyOptions.visualReferenceColor;
      ctx.beginPath();
      ctx.arc(localX, localY, markerSize * scale, 0, 2 * Math.PI, false);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = el.artyOptions.visualTextColor;
      let textMetric = ctx.measureText(markerText);
      ctx.fillText(markerText, localX - textMetric.width / 2, localY);
    }
    // Draw targets
    ctx.lineWidth = el.artyOptions.visualOutlineWidth;
    ctx.strokeStyle = el.artyOptions.visualOutlineColor;
    for (i = 0; i < el.artyOptions.positions.targets.length; i++) {
      let markerText = i+1;
      localX = (el.artyOptions.positions.targets[i].x + offsetX) * scale;
      localY = (el.artyOptions.positions.targets[i].y + offsetY) * scale;
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
    for (i = 0; i < el.artyOptions.positions.guns.length; i++) {
      let markerText = i+1;
      localX = (el.artyOptions.positions.guns[i].x + offsetX) * scale;
      localY = (el.artyOptions.positions.guns[i].y + offsetY) * scale;
      // Draw aim lines
      ctx.strokeStyle = el.artyOptions.visualGunColor;
      for (let j = 0; j < el.artyOptions.positions.guns[i].aimTargets.length; j++) {
        let aimTarget = el.artyOptions.positions.guns[i].aimTargets[j];
        ctx.beginPath();
        ctx.moveTo(localX, localY);
        ctx.lineTo((aimTarget.x + offsetX) * scale, (aimTarget.y + offsetY) * scale);
        ctx.stroke();
      }
      // Draw marker
      ctx.strokeStyle = el.artyOptions.visualOutlineColor;
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

  /****************************************************************************
   *                     JQUERY PLUGIN METHOD                                 *
   ****************************************************************************/

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
