(function($) {

  let defaultOptions = {
    baseClass: "azim-input border",                   // CSS-Class for base element
    distanceMin: 0,                                   // Minimum distance (meters)
    distanceMax: 150,                                 // Maximum distance (meters)
    distanceStep: 0.5,                                // Distance per step (meters)
    distanceInputClass: "azim-input-dist",            // CSS-Class for distance input field (numeric)
    distanceInputRangeClass: "azim-input-dist-range", // CSS-Class for distance input field (slider)
    distanceInputUnitClass: "azim-input-unit",        // CSS-Class of the distance unit element (null to omit)
    distanceInputUnitText: "m",                       // Text of the distance unit element (null to omit)
    azimStep: 1,                                      // Angle per step
    azimAngleSize: 48,                                // Azim picker size in pixel
    azimInputClass: "azim-input-angle-number",        // CSS-Class for base angle element
    azimInputUnitClass: "azim-input-unit",            // CSS-Class of the azim unit element (null to omit)
    azimInputUnitText: "deg",                         // Text of the azim unit element (null to omit)
    azimSvgClass: "azim-input-angle-svg",             // CSS-Class for the angle svg element
    azimCircleClass: "azim-input-angle-circle",       // CSS-Class for the angle circle element
    azimCircleColor: "#888",                          // Color for the angle circle element
    azimLineClass: "azim-input-angle-line",           // CSS-Class for the angle line element
    azimLineColor: "#F00",                            // Color for the angle line element
    name: null,                                       // Input fields name
    // References to the html elements that will be created automatically
    inputDistance: null,
    inputDistanceRange: null,
    inputAzimNumber: null,
    inputAzimSvg: null,
    inputAzimCircle: null,
    inputAzimLine: null
  };

  // Initialize on element(s)
  let init = function(el, options) {
    $(el).each(function() {
      let invokeStartup = false;
      // Init if not already done
      if (!this.hasOwnProperty("azimInput")) {
        this.azimInput = $.extend({}, defaultOptions);
        invokeStartup = true;
      }
      // Apply extra options
      if (typeof options == "object") {
        $.extend(this.azimInput, options);
      }
      if (invokeStartup) {
        startup(this);
      } else {
        update(this);
      }
    });
  };

  // Startup function (called after initializing a new element)
  let startup = function(el) {
    addElements(el);
  };

  // Update function (update settings)
  let update = function(el) {
    updateElements(el);
  };

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

  let addElements = function(el) {
    jQuery(el).addClass(el.azimInput.baseClass);
    // Range slider
    el.azimInput.inputDistanceRange = jQuery(el).append('<input type="range">').find("input").last()
      .addClass(el.azimInput.distanceInputRangeClass)
      .val(el.azimInput.distanceMin);
    // Numeric input
    el.azimInput.inputDistance = jQuery(el).append('<input type="number">').find("input").last()
      .addClass(el.azimInput.distanceInputClass)
      .val(el.azimInput.distanceMin);
    // Distance unit
    if ((el.azimInput.distanceInputUnitClass !== null) && (el.azimInput.distanceInputUnitText !== null)) {
      el.azimInput.inputDistanceUnit = jQuery(el).append('<span>').find("span").last()
        .addClass(el.azimInput.distanceInputUnitClass)
        .text(el.azimInput.distanceInputUnitText);
    }
    // Azim SVG
    let circleRadius = el.azimInput.azimAngleSize / 2;
    el.azimInput.inputAzimSvg = jQuery(el).append(
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="'+circleRadius+'" cy="'+circleRadius+'" r="'+circleRadius+'" />' +
      '<line x1="'+circleRadius+'" y1="'+circleRadius+'" x2="'+circleRadius+'" y1="0" />' +
      '</svg>'
    ).find("svg").last().addClass(el.azimInput.azimSvgClass);
    el.azimInput.inputAzimCircle = el.azimInput.inputAzimSvg.find("circle").last().addClass(el.azimInput.azimCircleClass);
    el.azimInput.inputAzimLine = el.azimInput.inputAzimSvg.find("line").last().addClass(el.azimInput.azimLineClass);
    // Azim number input
    el.azimInput.inputAzimNumber = jQuery(el).append('<input type="number">').find("input").last()
      .addClass(el.azimInput.azimInputClass)
      .val(0);
    // Azim unit
    if ((el.azimInput.azimInputUnitClass !== null) && (el.azimInput.azimInputUnitText !== null)) {
      el.azimInput.inputazimUnit = jQuery(el).append('<span>').find("span").last()
        .addClass(el.azimInput.azimInputUnitClass)
        .text(el.azimInput.azimInputUnitText);
    }
    // Update settings
    updateElements(el);
    // Events
    el.azimInput.inputDistanceRange.on("change input", function(e) {
      el.azimInput.inputDistance.val( jQuery(this).val() );
      $(el.azimInput.inputDistance).trigger("change")
      $(el).trigger("change");
    });
    el.azimInput.inputDistance.on("change", function(e) {
      el.azimInput.inputDistanceRange.val( jQuery(this).val() );
      $(el).trigger("change");
    });
    el.azimInput.inputAzimNumber.on("change", function(e) {
      let azim = parseFloat($(this).val() || 0);
      if (azim < 0) {
        azim = (360 + azim);
      } else if (azim > 360) {
        azim = (azim - 360);
      }
      updateAngle(el, azim);
    });
    el.azimInput.inputAzimSvg.on("mousemove mouseup", function(e) {
      let oe = e.originalEvent;
      if ((oe.buttons > 0) || (oe.type == "mouseup")) {
        let x = oe.offsetX;
        let y = oe.offsetY;
        let angle = calcCartesianToAzim(x, y, el.azimInput.azimAngleSize / 2, el.azimInput.azimAngleSize / 2)
        updateAngle(el, Math.round(angle.azim), true);
      }
    });
  };

  let updateDistance = function(el, distance) {
    el.azimInput.inputDistance.val( distance );
    el.azimInput.inputDistanceRange.val( distance );
    $(el.azimInput.inputDistance).trigger("change");
    $(el.azimInput.inputDistanceRange).trigger("change");
  };

  let updateAngle = function(el, angle, inputEvent) {
    let circleRadius = el.azimInput.azimAngleSize / 2;
    let line = calcAzimToCartesian(circleRadius, angle, circleRadius, circleRadius);
    el.azimInput.inputAzimNumber.val(angle);
    el.azimInput.inputAzimLine
      .attr({
        "x2": line.x, "y2": line.y, "stroke": el.azimInput.azimLineColor
      });
    $(el).trigger("change");
    if (inputEvent || false) {
      $(el.azimInput.inputAzimNumber).trigger("change");
    }
  };

  let updateElements = function(el) {
    el.azimInput.inputDistance
      .attr({ "step": el.azimInput.distanceStep, "min": el.azimInput.distanceMin, "max": el.azimInput.distanceMax });
    if (el.azimInput.name !== null) {
      el.azimInput.inputDistance.attr("name", el.azimInput.name+"[DISTANCE]");
    }
    el.azimInput.inputDistanceRange
      .attr({ "step": el.azimInput.distanceStep, "min": el.azimInput.distanceMin, "max": el.azimInput.distanceMax });
    el.azimInput.inputAzimNumber
      .attr({ "step": el.azimInput.azimStep, "min": -1, "max": 361 })
    if (el.azimInput.name !== null) {
      el.azimInput.inputAzimNumber.attr("name", el.azimInput.name+"[AZIMUTH]");
    }
    el.azimInput.inputAzimSvg
      .attr({ "height": el.azimInput.azimAngleSize, "width": el.azimInput.azimAngleSize });
    let circleRadius = el.azimInput.azimAngleSize / 2;
    el.azimInput.inputAzimCircle
      .attr({
        "cx": circleRadius, "cy": circleRadius, "r": circleRadius, "stroke": el.azimInput.azimCircleColor
      });
    let angle = parseFloat(el.azimInput.inputAzimNumber.val());
    let line = calcAzimToCartesian(circleRadius, angle, circleRadius, circleRadius);
    el.azimInput.inputAzimLine
      .attr({
        "x1": circleRadius, "y1": circleRadius, "x2": line.x, "y2": line.y, "stroke": el.azimInput.azimLineColor
      });
  };

  /****************************************************************************
   *                     JQUERY PLUGIN METHOD                                 *
   ****************************************************************************/

  $.fn.azimInput = function(action, ...params) {
    let result = this;
    if (typeof action == "string") {
      $(this).each(function() {
        switch (action) {
          case "distance":
            updateDistance(this, params[0]);
            break;
          case "azim":
          case "angle":
            updateAngle(this, params[0])
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
