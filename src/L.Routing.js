/*
 * L.Routing main class
 *
 * Main clase for the Leaflet routing module
 * 
 * @dependencies L
 *
 * @usage new L.Routing(options);
 *
 * @todo use L.Class.extend instead?
*/

L.Routing = L.Control.extend({
  
  // INCLUDES
  includes: [L.Mixin.Events]
  
  // CONSTANTS
  ,statics: {
    VERSION: '0.0.2-dev'
  }

  // OPTIONS
  ,options: {
    position: 'topleft'
    ,icons: {
      start: new L.Icon.Default()
      ,end: new L.Icon.Default()
      ,normal: new L.Icon.Default() 
    }
    ,zIndexOffset: 2000
    ,routing: {
      router: null       // function (<L.Latlng> l1, <L.Latlng> l2, <Function> cb)
    }
    ,snapping: {
      layers: []         // layers to snap to
      ,sensitivity: 10   // snapping sensitivity
      ,vertexonly: false // vertex only snapping
    }
  }
  
  /**
   * Routing Constructor
   *
   * @access public
   *
   * @param <Object> options - non-default options
   *
   * @todo render display of segments and waypoints
  */
  ,initialize: function (options) {
    this._editing = false;
    this._drawing = false;
  
    L.Util.setOptions(this, options);
  }
  
  /**
   * Called when controller is added to map
   *
   * @access public
   *
   * @param <L.Map> map - map instance
   *
   * @return <HTMLElement> container
  */
  ,onAdd: function (map) {
    this._map         = map;
 		this._container   = this._map._container;
		this._overlayPane = this._map._panes.overlayPane;
		this._popupPane   = this._map._panes.popupPane;
 
    this._router    = this.options.routing.router;
    this._segments  = new L.FeatureGroup().addTo(map);
    this._waypoints = new L.FeatureGroup().addTo(map);
    this._waypoints._first = null;
    this._waypoints._last = null;

		//L.DomUtil.disableTextSelection();
    //this._tooltip = new L.Tooltip(this._map);
		//this._tooltip.updateContent({ text: L.drawLocal.draw.marker.tooltip.start });
    L.DomEvent.addListener(this._container, 'keyup', this._keyupListener, this);

		this._draw = new L.Routing.Draw(this, {
  		icons: this.options.icons
  		,zIndexOffset: this.options.zIndexOffset
  		,snapping: this.options.snapping
		});
		
		this._edit = new L.Routing.Edit(this, {
  		icons: this.options.icons
  		,zIndexOffset: this.options.zIndexOffset
  		,snapping: this.options.snapping
		});
		this._edit.enable();
		
    this._segments.on('mouseover'    , this._fireSegmentEvent, this);
    this._edit.on('segment:mouseout' , this._fireSegmentEvent, this);
    this._edit.on('segment:dragstart', this._fireSegmentEvent, this);
    this._edit.on('segment:dragend'  , this._fireSegmentEvent, this);
    
    var container = L.DomUtil.create('div', 'leaflet-routing');
    
    return container;
	}
	
	/**
	 * Called when controller is removed from map
	 *
	 * @access public
	 *
   * @param <L.Map> map - map instance
  */
	,onRemove: function(map) {
  	//L.DomUtil.create('div', 'leaflet-routing'); <= delete this

    this._segments.off('mouseover'    , this._fireSegmentEvent, this);
    this._edit.off('segment:mouseout' , this._fireSegmentEvent, this);
    this._edit.off('segment:dragstart', this._fireSegmentEvent, this);
    this._edit.off('segment:dragend'  , this._fireSegmentEvent, this);

  	this._edit.disable();
  	this._draw.disable();
  	
		L.DomUtil.enableTextSelection();
		// this._tooltip.dispose();
		// this._tooltip = null;
		L.DomEvent.removeListener(this._container, 'keyup', this._keyupListener);

  	delete this._draw;
  	delete this._edit;
  	delete this._map;
  	delete this._router;
  	delete this._segments;
  	delete this._waypoints;
  	delete this.options;
	}
  
  /**
   * Add new waypoint to path
   *
   * @access public
   *
   * @param <L.Marker> marker - new waypoint marker (can be ll)
   * @param <L.Marker> prev - previous waypoint marker
   * @param <L.Marker> next - next waypoint marker
   * @param <Function> cb - callback method
   *
   * @return void
  */
  ,addWaypoint: function(marker, prev, next, cb) {
    if (marker instanceof L.LatLng) {
      marker = new L.Marker(marker);
    }
    
    marker._routing = {
      prevMarker  : prev
      ,nextMarker : next
      ,prevLine   : null
      ,nextLine   : null
      ,timeoutID  : null
    };
    
    if (this._waypoints._first === null && this._waypoints._last === null) {
      this._waypoints._first = marker;
      this._waypoints._last = marker;
    } else if (next === null) {
      this._waypoints._last = marker;
    } else if (prev === null) {
      this._waypoints._first = marker;
    }
    
    if (marker._routing.prevMarker !== null) {
      marker._routing.prevMarker._routing.nextMarker = marker;
      marker._routing.prevLine = marker._routing.prevMarker._routing.nextLine;
      if (marker._routing.prevLine !== null) {
        marker._routing.prevLine._routing.nextMarker = marker;
      }
    }
    
    if (marker._routing.nextMarker !== null) {
      marker._routing.nextMarker._routing.prevMarker = marker;
      marker.nextLine = marker._routing.nextMarker._routing.prevLine;
      if (marker._routing.nextLine !== null) {
        marker._routing.nextLine._routing.prevMarker = marker;
      }
    }
    
    marker.on('mouseover', this._fireWaypointEvent, this);
    marker.on('mouseout' , this._fireWaypointEvent, this);
    marker.on('dragstart', this._fireWaypointEvent, this);
    marker.on('dragend'  , this._fireWaypointEvent, this);
    marker.on('drag'     , this._fireWaypointEvent, this);
    marker.on('click'    , this._fireWaypointEvent, this);

    this.routeWaypoint(marker, cb);
    this._waypoints.addLayer(marker);
    marker.dragging.enable();
  }  
  
  /**
   * Remove a waypoint from path
   *
   * @access public
   *
   * @param <L.Marker> marker - new waypoint marker (can be ll)
   * @param <Function> cb - callback method
   *
   * @return void
  */
  ,removeWaypoint: function(marker, cb) {
    marker.off('mouseover', this._fireWaypointEvent, this);
    marker.off('mouseout' , this._fireWaypointEvent, this);
    marker.off('dragstart', this._fireWaypointEvent, this);
    marker.off('dragend'  , this._fireWaypointEvent, this);
    marker.off('drag'     , this._fireWaypointEvent, this);
    marker.off('click'    , this._fireWaypointEvent, this);
    
    var prev = marker._routing.prevMarker;
    var next = marker._routing.nextMarker;
    
    if (marker._leafletId === this._waypoints._first._leafletId) {
      this._waypoints._first = next;
    }
    
    if (marker._leafletId === this._waypoints._last._leafletId) {
      this._waypoints._last = prev;
    }
    
    if (prev !== null) {
      prev._routing.nextMarker = next;
      prev._routing.nextLine = null;
    }
    
    if (next !== null) {
      next._routing.prevMarker = prev;
      next._routing.prevLine = null;
    }
    
    if (marker._routing.nextLine !== null) {
      this._segments.removeLayer(marker._routing.nextLine);
    }

    if (marker._routing.prevLine !== null) {
      this._segments.removeLayer(marker._routing.prevLine);
    }
  
    this._waypoints.removeLayer(marker); 

    if (prev !== null) {
      this.routeWaypoint(prev, cb);
    } else if (next !== null) {
      this.routeWaypoint(next, cb);
    }
    
    // this._draw.show();
  }

  /**
   * Route with respect to waypoint
   *
   * @access public
   *
   * @param <L.Marker> marker - marker to route on
   * @param <Function> cb - callback function
   *
   * @return void
   *
   * @todo add propper error checking for callback
  */
  ,routeWaypoint: function(marker, cb) {
    var i = 0;
    var callback = function(err, data) {
      i++;
      if (i === 2) {
        cb(err, marker);
      }
    }
  
    this._routeSegment(marker._routing.prevMarker, marker, callback);
    this._routeSegment(marker, marker._routing.nextMarker, callback);
  }  
  
  /**
   * Route segment between two markers
   *
   * @access private
   *
   * @param <L.Marker> m1 - first waypoint marker
   * @param <L.Marker> m2 - second waypoint marker
   * @param <Function> cb - callback function (<Error> err, <String> data)
   *
   * @return void
   *
   * @todo logic if router fails
  */
  ,_routeSegment: function(m1, m2, cb) {    
    var $this = this;
    
    if (m1 === null || m2 === null) {
      return cb(null, true);
    }
    
    this._router(m1.getLatLng(), m2.getLatLng(), function(err, layer) {
      if (typeof layer === 'undefined') {
        var layer = new L.Polyline([m1.getLatLng(), m2.getLatLng()]);
      }
      
      layer._routing = {
        prevMarker: m1
        ,nextMarker: m2
      };
      
      if (m1._routing.nextLine !== null) {
        $this._segments.removeLayer(m1._routing.nextLine);
      }
      $this._segments.addLayer(layer);
            
      m1._routing.nextLine = layer;
      m2._routing.prevLine = layer;
      
      return cb(null, layer);
    });
  }
  
  /**
   * Fire events
   *
   * @access private
   *
   * @param <L.Event> e - mouse event
   *
   * @return void
  */
  ,_fireWaypointEvent: function(e) {
    this.fire('waypoint:' + e.type, {marker:e.target});
  }
  
  ,_fireSegmentEvent: function(e) {
    if (e.type.split(':').length === 2) {
      this.fire(e.type);
    } else {
      this.fire('segment:' + e.type);
    }
  }
  
  /**
   * Get first waypoint
   *
   * @access public
   *
   * @return L.Marker
  */
  ,getFirst: function() {
    return this._waypoints._first;
  }
  
  /**
   * Get last waypoint
   *
   * @access public
   *
   * @return L.Marker
  */
  ,getLast: function() {
    return this._waypoints._last;
  }
  
  /**
   *
  */
  ,toGeoJSON: function(cb) {
    if (this._waypoints._first !== null) {
      var latlngs = [];
      
      function next(waypoint, done) {
        if (waypoint._routing.nextMarker !== null) {
          var tmp = waypoint._routing.nextLine.getLatLngs();
          for (var i = 0; i < tmp.length; i++) {
            latlngs.push([tmp[i].lat, tmp[i].lng]);
          }
          next(waypoint._routing.nextMarker, done);
        } else {
          done(latlngs);
        }
      }
      
      next(this._waypoints._first, cb);
    } else {
      cb([]);
    }
  }
  
  /**
   * Start (or continue) drawing
   *
   * Call this method in order to start or continue drawing. The drawing handler
   * will be activate and the user can draw on the map.
   *
   * @access public
   *
   * @return void
   *
   * @todo check enable
  */
  ,draw: function (enable) {
    if (typeof enable === 'undefined') {
      var enable = true;
    }
    
    if (enable) {
      this._draw.enable();
    } else {
      this._draw.disable();
    }
  }
  
  /**
   * Enable or disable routing 
   *
   * @access public
   *
   * @return void
   *
   * @todo check enable
  */
  ,routing: function (enable) {
    throw new Error('Not implemented');
  }
  
  /**
   * Enable or disable snapping 
   *
   * @access public
   *
   * @return void
   *
   * @todo check enable
  */
  ,snapping: function (enable) {
    throw new Error('Not implemented');
  }
  
  	/**
	 * Key up listener
	 * 
	 * * `ESC` to cancel drawing
	 * * `M` to enable drawing
	 *
	 * @access private
	 *
	 * @return void
  */
	,_keyupListener: function (e) {
		if (e.keyCode === 27) {
			this._draw.disable();
		} else if (e.keyCode === 77) {
  		this._draw.enable();
		}
	}
  
});