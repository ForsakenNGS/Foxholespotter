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
    referenceAdded: null,
    referenceUpdated: null,
    targetElements: [],
    targetListCss: ".target-list",
    targetTemplate: null,
    targetAdded: null,
    targetUpdated: null,
    gunElements: [],
    gunListCss: ".gun-list",
    gunTemplate: null,
    gunTargetTemplate: null,
    gunAdded: null,
    gunUpdated: null,
    mapIdent: null,
    mapScale: 2.17,
    mapSizeX: 1024,
    mapSizeY: 888,
    mapLocation: "map/",
    positions: null,
    presetId: null,
    presetName: null,
    presetNextId: 1,
    updateDelay: 100,
    updateTimer: null,
    visualCss: ".visual-aid",
    visualElement: null,
    visualMapImg: null,
    visualScale: 1.0,
    visualZoom: 0
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
      if (invokeStartup) {
        startup(this);
      }
    });
  };

  // Startup function (called after initializing a new element)
  let startup = function(el) {
    $(el).find(".card").each(function() {
      bindCard(el, this);
    });
    minimizeCard(el, $(el).find(".wind"));
    addTarget(el);
    addGun(el);
    initVisualAid(el);
    loadPresets(el);
    updateNow(el);
    bindSpotter(el);
    bindWind(el);
    $(el).find('[data-action="reset-all"]').on("click", function(e) {
      e.preventDefault();
      resetAll(el);
    });
    $(el).find('[data-action="reset-targets"]').on("click", function(e) {
      e.preventDefault();
      resetTargets(el);
    });
    $(el).find('[data-action="preset-save"]').on("click", function(e) {
      e.preventDefault();
      savePreset(el);
    });
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

  let calcGunSpread = function(specs, dist, x, y) {
    if (dist <= specs.rangeMin) {
      return { x: x, y: y, radius: specs.spreadMin };
    } else if (dist >= specs.rangeMax) {
      return { x: x, y: y, radius: specs.spreadMax };
    } else {
      let spread = specs.spreadMin + (dist - specs.rangeMin) / (specs.rangeMax - specs.rangeMin) * (specs.spreadMax - specs.spreadMin);
      return { x: x, y: y, radius: spread };
    }
  };

  let calcWindCorrection = function(specs, dist, windSpeed, windAzim) {
    let correctionDistance = specs.windDisMin;
    if (windSpeed > 0) {
      if ((dist > specs.rangeMin) && (dist < specs.rangeMax)) {
        correctionDistance = specs.windDisMin + (dist - specs.rangeMin) / (specs.rangeMax - specs.rangeMin) * (specs.windDisMax - specs.windDisMin);
      } else if (dist >= specs.rangeMax) {
        correctionDistance = specs.windDisMax;
      }
      correctionDistance = correctionDistance * windSpeed / 5.0;
    } else {
      correctionDistance = 0.0;
    }
    return calcAzimToCartesian(correctionDistance, (windAzim + 180) % 360);
  };

  let getGunSpecs = function(model) {
    let spreadMin = 5, spreadMax = 10, rangeMin = 45, rangeMax = 80, windDisMin = 10, windDisMax = 40;   // Mortar tubes
    switch (model) {
      case "120-collie": // 120mm Push-Gun (Collie)
        spreadMin = 22.5; spreadMax = 30;
        rangeMin = 100; rangeMax = 250;
        windDisMin = 10; windDisMax = 30;
        break;
      case "120-warden": // 120mm Emplacement (Warden)
        spreadMin = 25; spreadMax = 35;
        rangeMin = 100; rangeMax = 300;
        windDisMin = 10; windDisMax = 30;
        break;
      case "150-collie": // 150mm Emplacement (Collie)
        spreadMin = 32.5; spreadMax = 40;
        rangeMin = 200; rangeMax = 350;
        windDisMin = 15; windDisMax = 40;
        break;
      case "150-warden": // 150mm Emplacement (Warden)
        spreadMin = 25; spreadMax = 35;
        rangeMin = 100; rangeMax = 300;
        windDisMin = 15; windDisMax = 40;
        break;
      case "storm-cannon": // Storm Cannon
        spreadMin = 50; spreadMax = 100; // TODO: GUESSED!
        rangeMin = 400; rangeMax = 1000;
        windDisMin = 20; windDisMax = 50;
        break;
    }
    return {
      spreadMin: spreadMin, spreadMax: spreadMax,
      rangeMin: rangeMin, rangeMax: rangeMax,
      windDisMin: windDisMin, windDisMax: windDisMax
    };
  };

  /****************************************************************************
   *                         GENERAL CARDS                                    *
   ****************************************************************************/

  // Bind events for the spotter card
  let bindSpotter = function(el) {
    $(el).find('[data-input="map-region"],[data-input="map-position-x"],[data-input="map-position-y"]').on("change", function(e) {
      updateLazy(el);
    });
  };

  // Bind events for the wind card
  let bindWind = function(el) {
    $(el).find('[data-input="wind-level"],[data-input="wind-azimuth"]').on("change", function(e) {
      updateLazy(el);
    });
    $(el).find('.wind [data-action="azimuth-swap"]').on("click", function(e) {
      e.preventDefault();
      let input = $(this).closest(".input-group").find('input[data-input$="-azimuth"]');
      input.val( (parseInt(input.val() || 0) + 180) % 360 );
      updateLazy(el);
    });
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
    elTarget.find('[data-action="azimuth-swap"]').on("click", function(e) {
      e.preventDefault();
      let input = $(this).closest(".input-group").find('input[data-input$="-azimuth"]');
      input.val( (parseInt(input.val() || 0) + 180) % 360 );
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
    // Callback
    if (typeof el.artyOptions.targetAdded == "function") {
      el.artyOptions.targetAdded(el, elTarget, i);
    }
    // Change events
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
    elReference.find('[data-action="azimuth-swap"]').on("click", function(e) {
      e.preventDefault();
      let input = $(this).closest(".input-group").find('input[data-input$="-azimuth"]');
      input.val( (parseInt(input.val() || 0) + 180) % 360 );
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
    // Callback
    if (typeof el.artyOptions.referenceAdded == "function") {
      el.artyOptions.referenceAdded(el, elReference, i);
    }
    // Change events
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
    elGun.find('[data-input="gun-model"]').on("change", function() {
      updateGun(el, elGun, i);
    });
    elGun.find('[data-input="gun-reference"]').on("change", function() {
      updateGun(el, elGun, i);
    });
    elGun.find('[data-input="gun-correction-x"],[data-input="gun-correction-y"]').on("change", function() {
      updateGun(el, elGun, i);
    });
    elGun.find('[data-action="azimuth-swap"]').on("click", function(e) {
      e.preventDefault();
      let input = $(this).closest(".input-group").find('input[data-input$="-azimuth"]');
      input.val( (parseInt(input.val() || 0) + 180) % 360 );
      updateGun(el, elGun, i);
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
    elGun.find('[data-action="gun-instruction-copy"]').on("click", function(e) {
      e.preventDefault();
      let prefix = elGun.find('[data-input="gun-instruction-prefix"]').val() || "";
      let text = elGun.find('[data-input="gun-instruction"]').val() || "";
      if (prefix != "") {
        prefix += " ";
      }
      navigator.clipboard.writeText(prefix+text);
    });
    elGun.find('[data-action="gun-apply-correction"]').on("click", function(e) {
      e.preventDefault();
      updateGunCorrection(el, elGun, i);
    });
    updateGunIndex(el, elGun, i);
    updateGunTargets(el, elGun);
    updateGunReferences(el, elGun);
    bindCard(el, elGun);
    // Update
    updateGun(el, elGun, i);
    // Callback
    if (typeof el.artyOptions.gunAdded == "function") {
      el.artyOptions.gunAdded(el, elGun, i);
    }
    // Change events
    elGun.find('[data-list="targets"]').on("change", function() {
      updateGun(el, elGun, i);
    });
    elGun.find('[data-input="gun-distance"]').on("change", function() {
      updateGun(el, elGun, i);
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
      updateGun(el, elGun, i);
    });
    elGun.find('[data-input="ref-map-position-x"],[data-input="ref-map-position-y"]').on("change", function() {
      updateGun(el, elGun, i);
    });
    elGun.find('[data-input="gun-last-hit-distance"]').on("change", function() {
      updateGun(el, elGun, i);
    });
    elGun.find('[data-input="gun-last-hit-azimuth"]').on("change", function() {
      let value = parseFloat($(this).val());
      if (!isNaN(value)) {
        if (value < 0) {
          $(this).val(360 + value);
        } else if (value > 360) {
          $(this).val(value - 360);
        }
      }
      updateGun(el, elGun, i);
    });
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
  let updateGun = function(el, elGun, i) {
    // Show / hide relevant position inputs
    let referenceId = elGun.find('[data-input="gun-reference"]').val() || "spotter";
    if (referenceId == "map") {
      elGun.find('[data-input="gun-distance"]').closest(".input-group").hide();
      elGun.find('[data-input="ref-map-position-x"]').closest(".input-group").show();
    } else {
      elGun.find('[data-input="ref-map-position-x"]').closest(".input-group").hide();
      elGun.find('[data-input="gun-distance"]').closest(".input-group").show();
    }
    // Callback
    if (typeof el.artyOptions.gunUpdated == "function") {
      el.artyOptions.gunUpdated(el, elGun, i);
    }
    updateLazy(el);
  };

  // Update index number (input form)
  let updateGunCorrection = function(el, elGun, i) {
    // Check last hit
    let lastHitDist = parseFloat($(elGun).find('[data-input="gun-last-hit-distance"]').val() || 0);
    let lastHitAzimAngle = parseFloat($(elGun).find('[data-input="gun-last-hit-azimuth"]').val() || 0);
    if (lastHitDist > 0) {
      let gunPosition = el.artyOptions.positions.guns[i-1];
      let gunAimPolar = calcCartesianToAzim(gunPosition.aimTarget.x, gunPosition.aimTarget.y, gunPosition.x, gunPosition.y);
      let gunTarget = gunPosition.target;
      let lastHitPosition = calcAzimToCartesian(lastHitDist, lastHitAzimAngle);
      let lastHitOffset = calcCartesianToAzim(lastHitPosition.x, lastHitPosition.y, gunTarget.x, gunTarget.y);
      if (lastHitOffset.dist > gunPosition.aimSpread.radius) {
        if (lastHitOffset.dist < gunPosition.aimSpread.radius * 1.5) {
          lastHitOffset.dist -= gunPosition.aimSpread.radius;
        }
        let correctionOffset = calcAzimToCartesian(lastHitOffset.dist, lastHitOffset.azim);
        let correctionX = parseFloat($(elGun).find('[data-input="gun-correction-x"]').val() || 0) - correctionOffset.x;
        let correctionY = parseFloat($(elGun).find('[data-input="gun-correction-y"]').val() || 0) + correctionOffset.y;
        $(elGun).find('[data-input="gun-correction-x"]').val( Math.round(correctionX * 100) / 100 );
        $(elGun).find('[data-input="gun-correction-y"]').val( Math.round(correctionY * 100) / 100 );
      }
    }
    // Callback
    if (typeof el.artyOptions.gunUpdated == "function") {
      el.artyOptions.gunUpdated(el, elGun, i);
    }
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
      // Allow direct map positioning
      if ((elGun.find('[data-input="ref-map-position-x"]').length > 0) && (elGun.find('[data-input="ref-map-position-y"]').length > 0)) {
        $(elGunReferenceList).append('<option value="map">Map Location</option>');
      }
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
      let elGunTargetValue = $(this).val() || "target-1";
      $(elGunTargetList).html("");
      let i = 0;
      jQuery(el.artyOptions.targetElements).each(function() {
        $(elGunTargetList).append("<option></option>").find("option").last().attr("value", "target-"+(i+1)).text("Target "+(i+1));
        i++;
      });
      // Restore previous selection if possible
      $(this).val(elGunTargetValue);
      if ($(this).val() === null) {
        $(this).val("target-1");
      }
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

  let getPosition = function(el, referenceId, elInput) {
    if (referenceId == "spotter") {
      return { x: 0, y: 0 };
    } else if (referenceId == "map") {
      let spotterMapX = parseFloat($(el).find('[data-input="map-position-x"]').val() || 0);
      let spotterMapY = el.artyOptions.mapSizeY - parseFloat($(el).find('[data-input="map-position-y"]').val() || 0);
      let refMapXInput = $(elInput).find('[data-input="ref-map-position-x"]');
      let refMapYInput = $(elInput).find('[data-input="ref-map-position-y"]');
      let refMapX = parseFloat(refMapXInput.val() || 0);
      let refMapY = el.artyOptions.mapSizeY - parseFloat(refMapYInput.val() || 0);
      // Default to spotter location if not set
      if (refMapXInput.val() == "") {
        refMapX = spotterMapX;
        refMapXInput.val(refMapX);
      }
      if (refMapYInput.val() == "") {
        refMapY = spotterMapY;
        refMapYInput.val(el.artyOptions.mapSizeY - refMapY);
      }
      // Return result
      return { x: (refMapX - spotterMapX) * el.artyOptions.mapScale, y: (refMapY - spotterMapY) * el.artyOptions.mapScale, final: true };
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

  let getPreset = function(el, id) {
    return JSON.parse(localStorage.getItem(id));
  };

  let getPresets = function(el) {
    let presets = [];
    for (let i = 0; i < localStorage.length; i++) {
      let presetId = localStorage.key(i);
      let presetMatch = presetId.match(/^preset-([0-9]+)$/i);
      if (presetMatch.length > 1) {
        let presetIndex = parseInt(presetMatch[1]);
        el.artyOptions.presetNextId = Math.max(el.artyOptions.presetNextId, presetIndex + 1);
        presets.push(presetId);
      }
    }
    return presets;
  };

  let loadPreset = function(el, presetId) {
    let presetData = getPreset(el, presetId);
    importJson(el, presetData);
    el.artyOptions.presetId = presetId;
    el.artyOptions.presetName = presetData.name;
    loadPresets(el);
  };

  let loadPresets = function(el) {
    let presets = getPresets(el);
    $('[data-list="presets"]').each(function() {
      // Add presets to dropdown
      $(this).html("");
      for (let i = 0; i < presets.length; i++) {
        let presetData = getPreset(el, presets[i]);
        let classActive = (el.artyOptions.presetId == presets[i] ? " active" : "");
        $(this).append('<li><a class="dropdown-item'+classActive+'" data-action="preset-load" data-preset="'+presets[i]+'"></a></li>');
        $(this).find('[data-preset="'+presets[i]+'"]').text(presetData.name);
      }
      // Add extra options if a preset is loaded
      if (el.artyOptions.presetId !== null) {
        $(this).append('<li><hr class="dropdown-divider"></li>');
        $(this).append('<li><a class="dropdown-item text-danger" data-action="preset-delete" data-preset="'+el.artyOptions.presetId+'">Delete active preset</a></li>');
        $(this).append('<li><a class="dropdown-item text-success" data-action="preset-save-as">Save preset as...</a></li>');
      }
      // Bind actions
      $(this).find('[data-action="preset-load"]').on("click", function(e) {
        e.preventDefault();
        let presetId = $(this).attr("data-preset");
        loadPreset(el, presetId);
      });
      $(this).find('[data-action="preset-delete"]').on("click", function(e) {
        e.preventDefault();
        let presetId = $(this).attr("data-preset");
        deletePreset(el, presetId);
      });
      $(this).find('[data-action="preset-save-as"]').on("click", function(e) {
        e.preventDefault();
        savePresetAs(el);
      });
      if (presets.length == 0) {
        $(this).append('<span class="dropdown-item text-muted">No presets present</span>');
      }
    });
  };

  let deletePreset = function(el, presetId) {
    localStorage.removeItem(presetId);
    if (el.artyOptions.presetId === presetId) {
      el.artyOptions.presetName = null;
      el.artyOptions.presetId = null;
    }
    loadPresets(el);
  };

  let savePreset = function(el) {
    if (el.artyOptions.presetId === null) {
      return savePresetAs(el);
    }
    let presetData = exportJson(el, el.artyOptions.presetName);
    localStorage.setItem(el.artyOptions.presetId, JSON.stringify(presetData));
    loadPresets(el);
  };

  let savePresetAs = function(el) {
    let presetName = prompt("Please enter preset name");
    if (presetName === null) {
      return; // Cancelled
    }
    el.artyOptions.presetName = presetName;
    el.artyOptions.presetId = "preset-"+el.artyOptions.presetNextId;
    el.artyOptions.presetNextId++;
    savePreset(el)
  };

  // Export current settings as json object
  let exportJson = function(el, name) {
    let result = {
      name: name,
      spotter: { mapIdent: null, mapPosX: 0, mapPosY: 0 },
      wind: { level: 0, angle: 0 },
      targets: [],
      references: [],
      guns: []
    };
    // Spotter settings
    result.spotter.mapIdent = el.artyOptions.mapIdent;
    result.spotter.mapPosX = parseFloat($(el).find('[data-input="map-position-x"]').val() || 0);
    result.spotter.mapPosY = parseFloat($(el).find('[data-input="map-position-y"]').val() || 0);
    // Wind settings
    result.wind.level = parseFloat($(el).find('[data-input="wind-level"]').val() || 0);
    result.wind.angle = parseFloat($(el).find('[data-input="wind-azimuth"]').val() || 0);
    // Target positions
    jQuery(el.artyOptions.targetElements).each(function() {
      let dist = parseFloat($(this).find('[data-input="target-distance"]').val() || 0);
      let azimAngle = parseFloat($(this).find('[data-input="target-azimuth"]').val() || 0);
      result.targets.push({ dist: dist, angle: azimAngle });
    });
    // Reference positions
    jQuery(el.artyOptions.referenceElements).each(function() {
      let referenceId = $(this).find('[data-input="reference-reference"]').val() || "spotter";
      let dist = parseFloat($(this).find('[data-input="reference-distance"]').val() || 0);
      let azimAngle = parseFloat($(this).find('[data-input="reference-azimuth"]').val() || 0);
      result.references.push({ ref: referenceId, dist: dist, angle: azimAngle });
    });
    // Gun positions
    jQuery(el.artyOptions.gunElements).each(function() {
      let referenceId = $(this).find('[data-input="gun-reference"]').val() || "spotter";
      let model = $(this).find('[data-input="gun-model"]').val() || "mortar";
      let target = $(this).find('[data-list="targets"]').val() || "target-1";
      let dist = parseFloat($(this).find('[data-input="gun-distance"]').val() || 0);
      let azimAngle = parseFloat($(this).find('[data-input="gun-azimuth"]').val() || 0);
      let refMapPosX = parseFloat($(this).find('[data-input="ref-map-position-x"]').val() || 0);
      let refMapPosY = parseFloat($(this).find('[data-input="ref-map-position-y"]').val() || 0);
      let lastHitDist = parseFloat($(this).find('[data-input="gun-last-hit-distance"]').val() || 0);
      let lastHitAzimAngle = parseFloat($(this).find('[data-input="gun-last-hit-azimuth"]').val() || 0);
      let correctionX = parseFloat($(this).find('[data-input="gun-correction-x"]').val() || 0);
      let correctionY = parseFloat($(this).find('[data-input="gun-correction-y"]').val() || 0);
      result.guns.push({
        model: model, target: target,
        ref: referenceId, dist: dist, angle: azimAngle, refMapPosX: refMapPosX, refMapPosY: refMapPosY,
        lastHitDist: lastHitDist, lastHitAzimAngle: lastHitAzimAngle,
        correctionX: correctionX, correctionY: correctionY
      });
    });
    return result;
  };

  // Import settings from a json object
  let importJson = function(el, data) {
    // Clear all inputs
    resetAll(el);
    // Sptter settings
    if (data.hasOwnProperty("spotter")) {
      $(el).find('[data-input="map-region"]').val(data.spotter.mapIdent);
      $(el).find('[data-input="map-position-x"]').val(data.spotter.mapPosX);
      $(el).find('[data-input="map-position-y"]').val(data.spotter.mapPosY);
    }
    // Wind settings
    if (data.hasOwnProperty("wind")) {
      $(el).find('[data-input="wind-level"]').val(data.wind.level);
      $(el).find('[data-input="wind-azimuth"]').val(data.wind.angle);
    }
    // Add the correct number of targets/ref-points/guns
    while (el.artyOptions.targetElements.length < data.targets.length) {
      addTarget(el);
    }
    while (el.artyOptions.referenceElements.length < data.references.length) {
      addReference(el);
    }
    while (el.artyOptions.gunElements.length < data.guns.length) {
      addGun(el);
    }
    // Load targets
    for (let i = 0; i < el.artyOptions.targetElements.length; i++) {
      let elTarget = el.artyOptions.targetElements[i];
      let targetData = data.targets[i];
      $(elTarget).find('[data-input="target-distance"]').val(targetData.dist);
      $(elTarget).find('[data-input="target-azimuth"]').val(targetData.angle);
    }
    // Load references
    for (let i = 0; i < el.artyOptions.referenceElements.length; i++) {
      let elReference = el.artyOptions.referenceElements[i];
      let referenceData = data.references[i];
      $(elReference).find('[data-input="reference-reference"]').val(referenceData.ref);
      $(elReference).find('[data-input="reference-distance"]').val(referenceData.dist);
      $(elReference).find('[data-input="reference-azimuth"]').val(referenceData.angle);
    }
    // Load guns
    for (let i = 0; i < el.artyOptions.gunElements.length; i++) {
      let elGun = el.artyOptions.gunElements[i];
      let gunData = data.guns[i];
      $(elGun).find('[data-input="gun-reference"]').val(gunData.ref);
      $(elGun).find('[data-input="gun-model"]').val(gunData.model);
      $(elGun).find('[data-list="targets"]').val(gunData.target);
      $(elGun).find('[data-input="gun-distance"]').val(gunData.dist);
      $(elGun).find('[data-input="gun-azimuth"]').val(gunData.angle);
      $(elGun).find('[data-input="ref-map-position-x"]').val(gunData.refMapPosX);
      $(elGun).find('[data-input="ref-map-position-y"]').val(gunData.refMapPosY);
      $(elGun).find('[data-input="gun-last-hit-distance"]').val(gunData.lastHitDist);
      $(elGun).find('[data-input="gun-last-hit-azimuth"]').val(gunData.lastHitAzimAngle);
      $(elGun).find('[data-input="gun-correction-x"]').val(gunData.correctionX);
      $(elGun).find('[data-input="gun-correction-y"]').val(gunData.correctionY);
    }
  };

  // Reset the inputs for the given target
  let resetTarget = function(el, elTarget) {
    $(elTarget).find('[data-input="target-distance"]').val("");
    $(elTarget).find('[data-input="target-azimuth"]').val(0);
    updateLazy(el);
  };

  // Reset the inputs for the given gun
  let resetGun = function(el, elGun) {
    $(elGun).find('[data-input="gun-model"]').val("mortar");
    $(elGun).find('[data-list="targets"]').val("target-1");
    $(elGun).find('[data-input="gun-reference"]').val("spotter");
    $(elGun).find('[data-input="gun-distance"]').val("");
    $(elGun).find('[data-input="gun-azimuth"]').val(0);
    $(elGun).find('[data-input="gun-correction-x"]').val("");
    $(elGun).find('[data-input="gun-correction-y"]').val("");
    updateLazy(el);
  };

  // Reset wind settings
  let resetWind = function(el) {
    $(el).find('[data-input="wind-level"]').val(0);
    $(el).find('[data-input="wind-azimuth"]').val(0);
  };

  // Reset all targets
  let resetTargets = function(el) {
    for (let i = el.artyOptions.targetElements.length - 1; i > 0; i--) {
      delTarget(el, i+1);
    }
    resetTarget(el, el.artyOptions.targetElements[0]);
  };

  // Reset all references
  let resetReferences = function(el) {
    for (let i = el.artyOptions.referenceElements.length - 1; i >= 0; i--) {
      delReference(el, i+1);
    }
    updateLazy(el);
  };

  // Reset all guns
  let resetGuns = function(el) {
    for (let i = el.artyOptions.gunElements.length - 1; i > 0; i--) {
      delGun(el, i+1);
    }
    resetGun(el, el.artyOptions.gunElements[0]);
  };

  // Reset all inputs
  let resetAll = function(el) {
    el.artyOptions.presetId = null;
    resetWind(el);
    resetTargets(el);
    resetReferences(el);
    resetGuns(el);
    loadPresets(el);
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
    updateMap(el);
    updatePositions(el);
    updateGunTargetValues(el);
    updateVisualAid(el);
  };

  // Update positions of all markers
  let updateMap = function(el) {
    el.artyOptions.mapIdent = $(el).find('[data-input="map-region"]').val() || "";
    $(el).find('[data-input="map-region-img"]').attr("src", el.artyOptions.mapLocation+el.artyOptions.mapIdent+".png");
    if (el.artyOptions.mapIdent == "") {
      el.artyOptions.mapIdent = null;
    }
  };

  // Update positions of all markers
  let updatePositions = function(el) {
    el.artyOptions.positions = {
      targets: [],
      references: [],
      guns: [],
      spreadMax: 5,
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
      let referencePos = getPosition(el, referenceId, this);
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
      let referencePos = getPosition(el, referenceId, this);
      let model = $(this).find('[data-input="gun-model"]').val() || "mortar";
      let specs = getGunSpecs(model);
      el.artyOptions.positions.spreadMax = Math.max(el.artyOptions.positions.spreadMax, specs.spreadMax);
      let dist = parseFloat($(this).find('[data-input="gun-distance"]').val() || 0);
      let azimAngle = parseFloat($(this).find('[data-input="gun-azimuth"]').val() || 0);
      if (referencePos.hasOwnProperty("final") && referencePos.final) {
        dist = 0;
      }
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
    // Get estimated wind speed / direction
    let windLevel = parseFloat($(el).find('[data-input="wind-level"]').val() || 0);
    let windAzim = parseFloat($(el).find('[data-input="wind-azimuth"]').val() || 0);
    // Calculate aim targets for each gun/target combination
    let gunIndex = 0;
    jQuery(el.artyOptions.gunElements).each(function() {
      // Gun model and correction values
      let elGunJs = this;
      let gunPosition = el.artyOptions.positions.guns[gunIndex];
      gunPosition.lastHit = null;
      let model = $(this).find('[data-input="gun-model"]').val() || "mortar";
      let gunSpecs = getGunSpecs(model);
      let correctionX = parseFloat($(this).find('[data-input="gun-correction-x"]').val() || 0);
      let correctionY = parseFloat($(this).find('[data-input="gun-correction-y"]').val() || 0);
      // Gun target
      let targetId = $(this).find('[data-list="targets"]').val() || "target-1";
      let targetIdMatch = targetId.match(/^target-([0-9]+)$/);
      let targetIndex = 0;
      if (targetIdMatch.length > 0) {
        targetIndex = parseInt(targetIdMatch[1]) - 1;
      }
      let targetPosition = el.artyOptions.positions.targets[targetIndex];
      let targetPositionPolar = calcCartesianToAzim(targetPosition.x, targetPosition.y, gunPosition.x, gunPosition.y);
      let correctionWind = calcWindCorrection(gunSpecs, targetPositionPolar.dist, windLevel, windAzim);
      gunPosition.target = targetPosition;
      gunPosition.aimTarget = {
        x: targetPosition.x + correctionX + correctionWind.x,
        y: targetPosition.y - correctionY + correctionWind.y
      };
      let gunTargetPolar = calcCartesianToAzim(gunPosition.aimTarget.x, gunPosition.aimTarget.y, gunPosition.x, gunPosition.y);
      gunPosition.aimSpread = calcGunSpread(gunSpecs, gunTargetPolar.dist, targetPosition.x, targetPosition.y);
      let targetText = "Dist "+(Math.floor(gunTargetPolar.dist * 10) / 10)+"m "+
          "Azim "+(Math.floor(gunTargetPolar.azim * 10) / 10)+"deg";
      $(elGunJs).find('[data-input="gun-instruction"]').val(targetText);
      // Gun last hit
      let lastHitDist = parseFloat($(this).find('[data-input="gun-last-hit-distance"]').val() || 0);
      let lastHitAzimAngle = parseFloat($(this).find('[data-input="gun-last-hit-azimuth"]').val() || 0);
      if (lastHitDist > 0) {
        gunPosition.lastHit = calcAzimToCartesian(lastHitDist, lastHitAzimAngle);
      }
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
      $(el.artyOptions.visualElement).on("mousemove mousedown", function(e) {
        moveVisualAidMap(el, e);
      });
      $(el.artyOptions.visualElement).on("wheel", function(e) {
        zoomVisualAidMap(el, e);
      });
    }
    el.artyOptions.visualMapImg = $(el).find('[data-input="map-region-img"]');
    if (el.artyOptions.visualMapImg.length > 0) {
      el.artyOptions.visualMapImg = el.artyOptions.visualMapImg[0];
      $(el.artyOptions.visualMapImg).on("load", function() {
        updateVisualAid(el);
      });
    } else {
      el.artyOptions.visualMapImg = null;
    }
  };

  // Update graphics
  let moveVisualAidMap = function(el, e) {
    let oe = e.originalEvent;
    if (e.type == "mousedown") {
      let mapPosX = parseFloat($(el).find('[data-input="map-position-x"]').val() || 0);
      let mapPosY = parseFloat($(el).find('[data-input="map-position-y"]').val() || 0);
      el.artyOptions.visualElement.dragStart = {
        x: oe.x, y: oe.y, mapX: mapPosX, mapY: mapPosY
      };
    } else if (oe.buttons > 0) {
      let mapPosX = el.artyOptions.visualElement.dragStart.mapX;
      let mapPosY = el.artyOptions.visualElement.dragStart.mapY;
      mapPosX += (el.artyOptions.visualElement.dragStart.x - oe.x) / el.artyOptions.visualScale / el.artyOptions.mapScale * 2;
      mapPosY -= (el.artyOptions.visualElement.dragStart.y - oe.y) / el.artyOptions.visualScale / el.artyOptions.mapScale * 2;
      $(el).find('[data-input="map-position-x"]').val( Math.round(mapPosX * 100) / 100 );
      $(el).find('[data-input="map-position-y"]').val( Math.round(mapPosY * 100) / 100 );
      updateMap(el);
      updatePositions(el);
      updateGunTargetValues(el);
      updateVisualAid(el);
    }
  };

  // Update graphics
  let zoomVisualAidMap = function(el, e) {
    let oe = e.originalEvent;
    el.artyOptions.visualZoom = Math.max(0, el.artyOptions.visualZoom - oe.wheelDelta);
    updateVisualAid(el);
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
      minX = Math.min(minX, el.artyOptions.positions.targets[i].x - el.artyOptions.positions.spreadMax);
      minY = Math.min(minY, el.artyOptions.positions.targets[i].y - el.artyOptions.positions.spreadMax);
      maxX = Math.max(maxX, el.artyOptions.positions.targets[i].x + el.artyOptions.positions.spreadMax);
      maxY = Math.max(maxY, el.artyOptions.positions.targets[i].y + el.artyOptions.positions.spreadMax);
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
    minX -= (margin + el.artyOptions.visualZoom);
    minY -= (margin + el.artyOptions.visualZoom);
    maxX += (margin + el.artyOptions.visualZoom);
    maxY += (margin + el.artyOptions.visualZoom);
    let sizeX = maxX - minX, sizeY = maxY - minY;
    let scaleX = w / sizeX, scaleY = h / sizeY;
    scale = Math.min(scaleX, scaleY);
    el.artyOptions.visualScale = scale;
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
    if ((el.artyOptions.mapIdent === null) || (el.artyOptions.visualMapImg === null)) {
      // Checker pattern
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
    } else {
      // Tile image
      let mapImage = el.artyOptions.visualMapImg;
      let mapPosX = parseFloat($(el).find('[data-input="map-position-x"]').val() || 0);
      let mapPosY = el.artyOptions.mapSizeY - parseFloat($(el).find('[data-input="map-position-y"]').val() || 0);
      ctx.drawImage(mapImage,
        (offsetX - mapPosX * el.artyOptions.mapScale) * scale, (offsetY - mapPosY * el.artyOptions.mapScale) * scale,
        1024 * el.artyOptions.mapScale * scale, 888 * el.artyOptions.mapScale * scale
      );
      // Draw grid
      let gridWidth = el.artyOptions.mapSizeX * el.artyOptions.mapScale / 17.5 * scale;
      let gridHeight = el.artyOptions.mapSizeY * el.artyOptions.mapScale / 15.1 * scale;
      ctx.lineWidth = 2;
      for (let gx = 0; gx < 19; gx++) {
        localX = (offsetX - mapPosX * el.artyOptions.mapScale) * scale + gx * gridWidth;
        if ((localX > 0) && (localX < w)) {
          // Big grid
          ctx.strokeStyle = '#00000080';
          ctx.beginPath();
          ctx.moveTo(localX, 0);
          ctx.lineTo(localX, h);
          ctx.stroke();
          // Small grid
          ctx.strokeStyle = '#00000020';
          ctx.beginPath();
          ctx.moveTo(localX + gridWidth * 0.3333, 0);
          ctx.lineTo(localX + gridWidth * 0.3333, h);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(localX + gridWidth * 0.6666, 0);
          ctx.lineTo(localX + gridWidth * 0.6666, h);
          ctx.stroke();
        }
      }
      for (let gy = 0; gy < 16; gy++) {
        localY = (offsetY - mapPosY * el.artyOptions.mapScale) * scale + gy * gridHeight;
        if ((localY > 0) && (localY < h)) {
          // Big grid
          ctx.strokeStyle = '#00000080';
          ctx.beginPath();
          ctx.moveTo(0, localY);
          ctx.lineTo(w, localY);
          ctx.stroke();
          // Small grid
          ctx.strokeStyle = '#00000020';
          ctx.beginPath();
          ctx.moveTo(0, localY + gridHeight * 0.3333);
          ctx.lineTo(w, localY + gridHeight * 0.3333);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, localY + gridHeight * 0.6666);
          ctx.lineTo(w, localY + gridHeight * 0.6666);
          ctx.stroke();
        }
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
      if (el.artyOptions.positions.guns[i].aimTarget !== null) {
        let aimTarget = el.artyOptions.positions.guns[i].aimTarget;
        ctx.beginPath();
        ctx.moveTo(localX, localY);
        ctx.lineTo((aimTarget.x + offsetX) * scale, (aimTarget.y + offsetY) * scale);
        ctx.stroke();
      }
      // Draw spread circles
      ctx.strokeStyle = el.artyOptions.visualGunColor;
      if (el.artyOptions.positions.guns[i].aimSpread !== null) {
        let aimSpread = el.artyOptions.positions.guns[i].aimSpread;
        ctx.beginPath();
        ctx.arc((aimSpread.x + offsetX) * scale, (aimSpread.y + offsetY) * scale, aimSpread.radius * scale, 0, 2 * Math.PI, false);
        ctx.stroke();
      }
      // Draw last hit marker
      ctx.fillStyle = el.artyOptions.visualGunColor;
      if (el.artyOptions.positions.guns[i].lastHit !== null) {
        let lastHit = el.artyOptions.positions.guns[i].lastHit;
        ctx.beginPath();
        ctx.arc((lastHit.x + offsetX) * scale, (lastHit.y + offsetY) * scale, markerSize * scale / 2, 0, 2 * Math.PI, false);
        ctx.fill();
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
    let result = this;
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
          case "export":
          case "exportJson":
            result = exportJson(this, ...params);
            break;
          case "import":
          case "importJson":
            importJson(this, ...params);
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
    return result;
  };

})(jQuery);
